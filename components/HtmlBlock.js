'use client';

import React, { useEffect, useRef } from 'react';
import { sanitizeQuestionHtml } from '@/lib/sanitize';
import { typesetMath } from '@/lib/ui/mathjax-loader';

const ENABLE_MATHJAX = process.env.NEXT_PUBLIC_ENABLE_MATHJAX !== 'false';

// Strip wrapping double-quotes that some DB columns return around HTML
// strings, then run the question-content sanitizer (defense-in-depth
// for admin-authored content). The sanitizer preserves MathML / SVG /
// safe HTML while stripping <script>, on* handlers, and dangerous URIs.
function cleanHtml(raw) {
  if (!raw) return '';
  let s = raw;
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return sanitizeQuestionHtml(s);
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
        img.style.maxHeight = typeof imgMaxWidth === 'number' ? `${imgMaxWidth}px` : imgMaxWidth;
        img.style.height = 'auto';
        img.style.objectFit = 'contain';
      }
    }

    // If MathJax is disabled, stop here and let native MathML render
    if (!ENABLE_MATHJAX) return;
    
    // Only typeset if math content exists (MathML tags or LaTeX delimiters)
    const hasmath = el.querySelector('math') || /\\\(|\\\[|\$\$/.test(cleaned);
    if (!hasmath) return;

    let cancelled = false;
    typesetMath(el, () => !cancelled).catch(() => {});

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
