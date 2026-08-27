// Pinned lesson figure (lesson-improvement plan step 3.1).
//
// Any lesson block's content may carry a `figure` object:
//
//   { src: '/images/lessons/similar-triangles.svg',
//     alt: 'Two similar triangles sharing an angle',
//     caption: 'Figure 1 — the nested configuration' }
//
// The slideshow renders it persistently in the side pane (stacked
// above the calculator when both are visible), so a diagram
// introduced on one slide stays on screen for every later slide that
// references it — the author attaches the same figure to each block
// that needs it. `caption` is optional; `src` and `alt` are required
// (alt is what a screen reader gets instead of the diagram).

export function normalizeLessonFigure(block) {
  const figure = block?.content?.figure;
  if (!figure || typeof figure !== 'object' || Array.isArray(figure)) return null;
  const src = typeof figure.src === 'string' ? figure.src.trim() : '';
  if (!src) return null;
  return {
    src,
    alt: typeof figure.alt === 'string' ? figure.alt.trim() : '',
    caption:
      typeof figure.caption === 'string' && figure.caption.trim()
        ? figure.caption.trim()
        : null,
  };
}

export function validateLessonFigure(figure) {
  const errors = [];
  if (figure == null) return errors;
  if (typeof figure !== 'object' || Array.isArray(figure)) {
    return ['figure must be an object with src, alt, and optional caption'];
  }
  if (typeof figure.src !== 'string' || figure.src.trim() === '') {
    errors.push('figure.src must be a non-empty string');
  }
  if (typeof figure.alt !== 'string' || figure.alt.trim() === '') {
    errors.push('figure.alt must be a non-empty string');
  }
  if (figure.caption != null && (typeof figure.caption !== 'string' || figure.caption.trim() === '')) {
    errors.push('figure.caption must be a non-empty string when present');
  }
  return errors;
}
