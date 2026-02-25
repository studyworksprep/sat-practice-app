'use client';

import { useEffect, useRef } from 'react';

const MATHJAX_SRC = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
const SCRIPT_ID = 'mathjax-cdn-script';

function ensureMathJaxLoaded() {
  if (typeof window === 'undefined') return;

  // If MathJax is already the runtime object, we're good.
  if (window.MathJax?.typesetPromise) return;

  // If the config hasn't been set yet, set a safe default.
  // (This won't override an existing config object.)
  if (!window.MathJax || !window.MathJax.loader) {
    window.MathJax = window.MathJax || {};
    window.MathJax = {
      ...window.MathJax,
      loader: { load: ['input/mml', 'output/chtml'] },
      options: {
        ...(window.MathJax.options || {}),
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
      },
      chtml: { ...(window.MathJax.chtml || {}), scale: 1.0 },
    };
  }

  // Inject the script once (fallback in case layout script didn't run).
  if (!document.getElementById(SCRIPT_ID)) {
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.src = MATHJAX_SRC;
    s.async = true;
    document.head.appendChild(s);
  }
}

export default function HtmlBlock({ html, className }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !html) return;

    // Only typeset if there is MathML present
    if (!el.querySelector('math')) return;

    // Avoid re-typesetting identical HTML
    if (el.dataset.typesetFor === html) return;
    el.dataset.typesetFor = html;

    ensureMathJaxLoaded();

    let cancelled = false;
    let tries = 0;

    // ~12s total (good for slower cold loads)
    const maxTries = 240;
    const delayMs = 50;

    const tryTypeset = () => {
      if (cancelled) return;

      const mj = window.MathJax;
      if (mj?.typesetPromise) {
        try {
          mj.typesetClear?.([el]);
          mj.typesetPromise([el]).catch(() => {});
        } catch {
          // If MathJax throws, show raw HTML instead of crashing
        }
        return;
      }

      tries += 1;
      if (tries < maxTries) setTimeout(tryTypeset, delayMs);
    };

    tryTypeset();

    return () => {
      cancelled = true;
    };
  }, [html]);

  if (!html) return null;

  return (
    <div
      ref={ref}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
