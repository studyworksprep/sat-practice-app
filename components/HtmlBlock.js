'use client';

import React, { useEffect, useRef } from 'react';

const MATHJAX_SRC = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
const SCRIPT_ID = 'mathjax-cdn-script';
const ENABLE_MATHJAX =
  typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_ENABLE_MATHJAX !== 'false'
    : true;

function ensureMathJaxLoaded() {
  if (typeof window === 'undefined') return;

  // If MathJax is already ready, we're good.
  if (window.MathJax?.typesetPromise) return;

  // Provide a safe default config (won't break if layout also sets it).
  window.MathJax = window.MathJax || {};
  window.MathJax = {
    ...window.MathJax,
    loader: window.MathJax.loader || { load: ['input/tex', 'input/mml', 'output/chtml'] },
    tex: { ...(window.MathJax.tex || {}), inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]'], ['$$', '$$']] },
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

// Strip wrapping double-quotes that some DB columns return around HTML strings
function cleanHtml(raw) {
  if (!raw) return '';
  let s = raw;
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s;
}

function HtmlBlockImpl({ html, className, imgMaxWidth }) {
  const ref = useRef(null);
  const lastHtmlRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const cleaned = cleanHtml(html);

    // Only update DOM when the html string actually changes.
    if (cleaned === (lastHtmlRef.current || '')) return;
    lastHtmlRef.current = cleaned;

    // Set HTML once (this prevents React from overwriting MathJax output on unrelated rerenders)
    el.innerHTML = cleaned;

    // Constrain images inline when requested (reliable regardless of CSS loading)
    if (imgMaxWidth) {
      for (const img of el.querySelectorAll('img')) {
        img.style.maxWidth = typeof imgMaxWidth === 'number' ? `${imgMaxWidth}px` : imgMaxWidth;
        img.style.height = 'auto';
      }
    }

    // Only typeset if MathML exists
     // If MathJax is disabled, stop here and let native MathML render
    if (!ENABLE_MATHJAX) return;
    
    // Only typeset if math content exists (MathML tags or LaTeX delimiters)
    const hasmath = el.querySelector('math') || /\\\(|\\\[|\$\$/.test(cleaned);
    if (!hasmath) return;

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
  (prev, next) => prev.html === next.html && prev.className === next.className && prev.imgMaxWidth === next.imgMaxWidth
);

export default HtmlBlock;
