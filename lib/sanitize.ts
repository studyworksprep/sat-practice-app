// HTML sanitization for the trust boundaries that render
// user-authored or admin-authored markup. See
// docs/architecture-plan.md §3.4 — RichContent primitive.
//
// Two profiles exist because the threat models differ:
//
//   sanitizeNoteHtml(html)
//     - For student-authored notes (TipTap → docToFullHtml → here).
//     - Allows the block / inline / mark tags docToFullHtml emits,
//       plus inline SVG (Excalidraw drawings) — but with all event
//       handlers and dangerous schemes scrubbed.
//     - Self-XSS surface today (students see only their own notes),
//       defense-in-depth tomorrow if notes ever become shareable.
//
//   sanitizeQuestionHtml(html)
//     - For admin-authored question content (stem / stimulus /
//       rationale / options HTML, often containing MathML).
//     - Wider tag allowlist, MathML preserved, but still no
//       <script>, no on* attributes, no javascript: URLs.
//     - Admins are trusted; this is defense-in-depth so a
//       compromised admin token can't immediately stage XSS.
//
// Both profiles run on the server (jsdom backend) and the client
// (window.DOMPurify) via isomorphic-dompurify so the same code path
// applies on every render boundary.

import DOMPurify from 'isomorphic-dompurify';

// ──────────────────────────────────────────────────────────────
// Note profile — what docToFullHtml emits, plus inline SVG so
// Excalidraw drawings survive. Excludes raw <script>, <iframe>,
// any `on*` attribute, any non-http/https/mailto/relative href,
// any data: URL except the SVG <image> use case (none in our docs
// today; tighten further if that changes).
// ──────────────────────────────────────────────────────────────

const NOTE_TAGS = [
  // Block + inline structure
  'p', 'br', 'hr', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  // Marks
  'strong', 'em', 's', 'a',
  // Excalidraw SVG output (these are the elements the exporter
  // actually emits)
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
  'polygon', 'text', 'tspan', 'defs', 'mask', 'clippath', 'use',
  'lineargradient', 'radialgradient', 'stop', 'filter', 'fegaussianblur',
  'fecolormatrix', 'femerge', 'femergenode', 'feoffset',
  'symbol', 'image', 'title', 'desc',
];

const NOTE_ATTRS = [
  'class', 'href', 'target', 'rel',
  // SVG geometry / styling
  'viewBox', 'xmlns', 'xmlns:xlink',
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'width', 'height', 'transform',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-opacity',
  'opacity', 'points', 'preserveAspectRatio', 'overflow', 'style',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
  'dominant-baseline', 'dy', 'dx',
  'id', 'gradientUnits', 'gradientTransform', 'spreadMethod',
  'offset', 'stop-color', 'stop-opacity',
  'mask', 'clip-path', 'filter',
  'in', 'in2', 'result', 'stdDeviation', 'values', 'mode',
  'href', 'xlink:href',
];

export function sanitizeNoteHtml(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: NOTE_TAGS,
    ALLOWED_ATTR: NOTE_ATTRS,
    // No JavaScript-bearing schemes anywhere.
    ALLOWED_URI_REGEXP: /^(https?:|mailto:|\/|#)/i,
    // Don't keep relative `data:` URIs that could ship inline JS.
    ALLOW_DATA_ATTR: false,
    // Keep the wrapping <body>'s contents only (sanitize() returns
    // the inner HTML by default, but this is explicit).
    KEEP_CONTENT: true,
  });
}

// ──────────────────────────────────────────────────────────────
// Question profile — admin-authored stem / stimulus / rationale /
// options. Defense-in-depth, not the primary trust boundary.
// MathML allowlist is broad because content authors use the full
// set; we still strip <script>, on* handlers, and javascript: URLs.
// ──────────────────────────────────────────────────────────────

export function sanitizeQuestionHtml(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    // USE_PROFILES preserves MathML + SVG + safe HTML in one call,
    // which is exactly the question-content shape (rendered math +
    // figures + inline markup). DOMPurify still strips on* attrs
    // and dangerous URIs under this profile.
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ALLOWED_URI_REGEXP: /^(https?:|mailto:|\/|#|data:image\/(png|jpeg|gif|webp|svg\+xml);base64,)/i,
  });
}
