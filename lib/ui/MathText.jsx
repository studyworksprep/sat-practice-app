'use client';

// Renders text (or inline nodes) and typesets any LaTeX inside it with
// MathJax, in place. Unlike HtmlBlock it does NOT set innerHTML — the
// children render as normal React nodes (so plain text stays escaped
// and safe), and MathJax only rewrites the \( … \) / \[ … \] / $$ … $$
// spans it finds. Use it for short, plain-text fields that may contain
// math — knowledge-check prompts, choices, explanations — where a full
// HTML/sanitizer pass would be overkill.

import { useRef } from 'react';
import { useMathTypeset } from './preview-effects';

export function MathText({ as: Tag = 'span', children, ...rest }) {
  const ref = useRef(null);
  const dep = typeof children === 'string' ? children : '';
  useMathTypeset(ref, dep);
  return (
    <Tag ref={ref} {...rest}>
      {children}
    </Tag>
  );
}
