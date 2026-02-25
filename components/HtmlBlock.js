'use client';

import React, { useEffect, useRef } from 'react';

const MATHJAX_SRC = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
const SCRIPT_ID = 'mathjax-cdn-script';

function ensureMathJaxLoaded() {
  if (typeof window === 'undefined') return;

  // If MathJax is already ready, we're good.
  if (window.MathJax?.typesetPromise) return;

  // Provide a safe default config (won't break if layout also sets it).
  window.MathJax = window.MathJax || {};
  window.MathJax = {
    ...window.MathJax,
    loader: window.MathJax.loader || { load: ['input/mml', 'output/chtml'] },
    options: {
      ...(window.MathJax.options || {}),
      skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
    },
    chtml: { ...(window.MathJax.chtml || {}), scale: 1.0 },
  };

  // Inject script once as a fallback.
  if (!document.getElementById(SCRIPT_ID)) {
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.src = MATHJAX_SRC;
    s.async = true;
    document.head.appendChild(s);
  }
}

function HtmlBlockImpl({ html, className }) {
  const ref = useRef(null);
  const lastHtmlRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Only update DOM when the html string actually changes.
    if ((html || '') === (lastHtmlRef.current || '')) return;
    lastHtmlRef.current = html || '';

    // Set HTML once (this prevents React from overwriting MathJax output on unrelated rerenders)
    el.innerHTML = html || '';

    // Only typeset if MathML exists
    if (!el.querySelector('math')) return;

    ensureMathJaxLoaded();

    let cancelled = false;
    let tries = 0;
    const maxTries = 240; // ~12s
    const delayMs = 50;

    const tryTypeset = () => {
      if (cancelled) return;

      const mj = window.MathJax;
      if (mj?.typesetPromise) {
        try {
          mj.typesetClear?.([el]);
          mj.typesetPromise([el]).catch(() => {});
        } catch {
          // swallow
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

  // Render a stable container; content is managed imperatively in the effect above.
  return <div ref={ref} className={className} />;
}

// Prevent rerenders when props haven't changed
const HtmlBlock = React.memo(
  HtmlBlockImpl,
  (prev, next) => prev.html === next.html && prev.className === next.className
);

export default HtmlBlock;
