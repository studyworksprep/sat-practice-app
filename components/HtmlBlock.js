'use client';

import { useEffect, useRef } from 'react';

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

    let cancelled = false;
    let tries = 0;
    const maxTries = 60; // ~3s if 50ms interval
    const delayMs = 50;

    const tryTypeset = () => {
      if (cancelled) return;

      const mj = window.MathJax;
      if (mj?.typesetPromise) {
        try {
          mj.typesetClear?.([el]);
          mj.typesetPromise([el]).catch(() => {});
        } catch {
          // swallow; render raw HTML if MathJax throws
        }
        return;
      }

      tries += 1;
      if (tries < maxTries) {
        setTimeout(tryTypeset, delayMs);
      }
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
