'use client';

import { useEffect, useRef } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';

export default function HtmlBlock({ html, className }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Prevent double-rendering for identical HTML payloads
    if (el.dataset.renderedFor === (html || '')) return;
    el.dataset.renderedFor = html || '';

    try {
      renderMathInElement(el, {
        // Avoid single-$ because SAT content can include currency
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false },
        ],
        throwOnError: false,
        strict: 'ignore',
      });
    } catch {
      // If KaTeX fails, show raw HTML instead of crashing
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
