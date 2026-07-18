'use client';

// Resolves the pending graph_image blocks of an AI lesson draft.
// Desmos renders only in a browser, so this runs in the admin's own
// session during the preview step: each spec mounts an offscreen
// Desmos calculator, takes an asyncScreenshot, uploads the PNG to the
// question-figures bucket (content-addressed, same store as the
// editor's manual image upload), and hands the finished <img> html
// back to the parent, which swaps it into the draft block before the
// lesson can be saved.
//
// Failure (no Desmos key, script blocked, upload error) degrades to a
// visible [Graph: …] note so the draft stays saveable — the admin can
// attach an image in the editor instead.

import { useEffect } from 'react';
// Client uploader is shared untyped .js.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { uploadFigure } from '@/lib/content/upload-figure-client';
import type { PendingGraph } from '@/lib/admin/lessonGenMapper';

const SHOT_WIDTH = 560;
const SHOT_HEIGHT = 380;

interface GraphImageResolverProps {
  graphs: PendingGraph[];
  onResult: (blockId: string, html: string, ok: boolean) => void;
}

// In-flight renders keyed by spec (not just blockId — revisions can
// reuse ids with different content). Module scope on purpose: React
// StrictMode mounts effects twice, and a per-instance guard would let
// the first (immediately cancelled) run swallow the work while the
// second run skips it. Sharing the promise lets whichever run is
// still alive consume the result; entries are deleted once consumed.
const inFlight = new Map<string, Promise<{ html: string; ok: boolean }>>();

function specKey(graph: PendingGraph): string {
  return `${graph.blockId}:${JSON.stringify([graph.expressions, graph.viewport, graph.caption])}`;
}

export function GraphImageResolver({ graphs, onResult }: GraphImageResolverProps) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const graph of graphs) {
        const key = specKey(graph);
        let promise = inFlight.get(key);
        if (!promise) {
          promise = renderOne(graph);
          inFlight.set(key, promise);
        }
        const result = await promise;
        if (cancelled) return;
        inFlight.delete(key);
        onResult(graph.blockId, result.html, result.ok);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [graphs, onResult]);

  return null;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function successHtml(url: string, caption: string): string {
  return (
    `<p><img src="${escapeHtml(url)}" alt="${escapeHtml(caption || 'Graph')}" width="${SHOT_WIDTH}" /></p>` +
    (caption ? `<p><em>${escapeHtml(caption)}</em></p>` : '')
  );
}

function fallbackHtml(caption: string): string {
  const note = caption
    ? `Graph: ${caption} — image could not be rendered; add one in the editor.`
    : 'Graph image could not be rendered — add one in the editor.';
  return `<p><em>[${escapeHtml(note)}]</em></p>`;
}

async function renderOne(graph: PendingGraph): Promise<{ html: string; ok: boolean }> {
  const Desmos = await waitForDesmos(6000);
  if (!Desmos) return { html: fallbackHtml(graph.caption), ok: false };

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:540px;';
  document.body.appendChild(host);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let calculator: any = null;
  try {
    calculator = Desmos.GraphingCalculator(host, {
      expressions: false,
      settingsMenu: false,
      zoomButtons: false,
      keypad: false,
      border: false,
    });
    graph.expressions.forEach((latex, i) => {
      calculator.setExpression({ id: `g${i}`, latex });
    });
    if (graph.viewport) calculator.setMathBounds(graph.viewport);

    // asyncScreenshot waits for plotting to settle before capturing.
    const dataUrl: string = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('screenshot timeout')), 15000);
      calculator.asyncScreenshot(
        { width: SHOT_WIDTH, height: SHOT_HEIGHT, targetPixelRatio: 2, showLabels: true },
        (shot: string) => {
          clearTimeout(timer);
          resolve(shot);
        },
      );
    });

    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'graph.png', { type: 'image/png' });
    // Bound the upload too — a hung request must degrade, not leave
    // the draft's save gate stuck on "Rendering…" forever.
    const url: string = await Promise.race([
      uploadFigure(file) as Promise<string>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('upload timeout')), 20000),
      ),
    ]);
    return { html: successHtml(url, graph.caption), ok: true };
  } catch (e) {
    // Surface the cause for the admin/devtools; the UI shows the
    // degraded note either way.
    console.warn('[graph_image] render/upload failed:', e);
    return { html: fallbackHtml(graph.caption), ok: false };
  } finally {
    try {
      calculator?.destroy();
    } catch {
      // already gone
    }
    host.remove();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function waitForDesmos(timeoutMs: number): Promise<any | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (window as any).Desmos;
      if (d?.GraphingCalculator) return resolve(d);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 200);
    };
    tick();
  });
}
