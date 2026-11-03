// PageHeader — the one header every student page opens with:
//
//   EYEBROW (context: section, test, week)
//   Serif title
//   One line on what the page is for
//                                           [actions, right-aligned]
//
// Server Component, no state. Pages pass plain strings for the text and
// any links/buttons as `actions`. Spacing and width come from the page's
// own container, so the header lines up with whatever sits below it.

import type { ReactNode } from 'react';
import s from './PageHeader.module.css';

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** id for the <h1>, so a landmark can point at it with aria-labelledby. */
  titleId?: string;
}

export function PageHeader({ eyebrow, title, description, actions, titleId }: PageHeaderProps) {
  return (
    <header className={s.header}>
      <div className={s.text}>
        {eyebrow && <p className={s.eyebrow}>{eyebrow}</p>}
        <h1 id={titleId} className={s.title}>{title}</h1>
        {description && <p className={s.description}>{description}</p>}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </header>
  );
}
