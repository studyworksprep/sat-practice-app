// Two-line tool button — icon stacked on top, label below. Used
// for every student-facing question-context action: Calculator,
// Reference, Notes, Error Log, Flashcards. The visual rules live
// in app/styles/next-tools.css (loaded by app/next/layout.js) so
// any client island can pick up the unified treatment without
// importing a CSS module.
//
// State props:
//   active      — open / pressed (e.g. calculator panel showing)
//   hasContent  — student already has saved content for this slot
//                 (e.g. note exists). Renders a small gold dot on
//                 the icon row.
//
// Wraps a plain <button>, so any standard button prop (onClick,
// title, aria-pressed, data-*, etc.) passes through.

'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

export interface ToolButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode;
  label: string;
  active?: boolean;
  hasContent?: boolean;
}

export const ToolButton = forwardRef(function ToolButton(
  {
    icon,
    label,
    active = false,
    hasContent = false,
    className,
    ...rest
  }: ToolButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const cls = [
    'sw-tool-btn',
    active ? 'sw-tool-btn-active' : null,
    hasContent ? 'sw-tool-btn-has-content' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type="button" className={cls} {...rest}>
      <span className="sw-tool-btn-icon">{icon}</span>
      <span className="sw-tool-btn-label">{label}</span>
    </button>
  );
});
