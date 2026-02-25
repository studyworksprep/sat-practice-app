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

    const mj = window.MathJax;

    // MathJax might not be ready immediately on first render
    if (mj?.typesetPromise) {
      mj.typesetClear?.([el]);        // clear old typesetting in this element (safe if exists)
      mj.typesetPromise([el]).catch(() => {});
    }
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
