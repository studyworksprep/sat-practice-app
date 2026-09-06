// Pinned lesson context (the text-side twin of the pinned figure in
// ./figure.mjs).
//
// The slideshow shows one block per slide, so a passage, sentence,
// or data table introduced on one slide is gone by the time a later
// check asks about it. Any lesson block's content may carry a
// `context` object:
//
//   { html: '<p>Museums sometimes display replicas…</p>',
//     label: 'Passage' }
//
// The slideshow renders it persistently in the side pane (stacked
// with the pinned figure, above the calculator; inline above the
// block on narrow screens), so the material a check refers to stays
// on screen while the learner answers. `label` is an optional short
// kicker ("Passage", "Table", "Sentence"); `html` is required and
// goes through the same sanitizer as text-block html.

export function normalizeLessonContext(block) {
  const context = block?.content?.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const html = typeof context.html === 'string' ? context.html.trim() : '';
  if (!html) return null;
  return {
    html,
    label:
      typeof context.label === 'string' && context.label.trim()
        ? context.label.trim()
        : null,
  };
}

export function validateLessonContext(context) {
  const errors = [];
  if (context == null) return errors;
  if (typeof context !== 'object' || Array.isArray(context)) {
    return ['context must be an object with html and optional label'];
  }
  if (typeof context.html !== 'string' || context.html.trim() === '') {
    errors.push('context.html must be a non-empty string');
  }
  if (context.label != null && (typeof context.label !== 'string' || context.label.trim() === '')) {
    errors.push('context.label must be a non-empty string when present');
  }
  return errors;
}
