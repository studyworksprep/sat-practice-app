// HelpButton — a contextual amber pill, distinct from page navigation
// links, that opens a modal with a short intro to a Help article and
// a "Read full article" link that opens the article in a new tab.
//
// Designed to sit beside a page title (e.g. next to "Practice", "Review",
// "My notes") so it reads as "more info about this page" rather than
// "go somewhere." The orange/gold palette intentionally contrasts with
// the blue accent used for navigation, so a student doesn't mistake one
// for the other.
//
// Pattern follows ReferenceSheetButton: client component, controlled
// modal, escape-to-close, click-outside-to-close.

'use client';

import { useEffect, useState } from 'react';
import { getArticle } from './content';
import s from './HelpButton.module.css';

/**
 * @param {object} props
 * @param {string} props.slug — slug of the Help article to summarize.
 *   The button text is derived from the article unless overridden.
 * @param {string} [props.label] — optional override for the button label.
 *   Defaults to "Help" so the button stays short next to a page title.
 */
export function HelpButton({ slug, label = 'Help' }) {
  const [open, setOpen] = useState(false);
  const article = getArticle(slug);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // If the slug is wrong (typo, deleted article), the button falls
  // back to a plain link straight to the help index rather than
  // showing a broken modal.
  if (!article) {
    return (
      <a href="/help" target="_blank" rel="noopener" className={s.button}>
        <QuestionIcon className={s.icon} aria-hidden />
        {label}
      </a>
    );
  }

  const articleHref = `/help/${article.slug}`;
  const summary = article.summary || article.blurb;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={s.button}
        aria-label={`Help: ${article.title}`}
        title={`About ${article.title}`}
      >
        <QuestionIcon className={s.icon} aria-hidden />
        {label}
      </button>

      {open && (
        <div
          className={s.overlay}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-modal-title"
        >
          <div className={s.card} onClick={(e) => e.stopPropagation()}>
            <div className={s.header}>
              <span className={s.headerIcon} aria-hidden>{article.icon}</span>
              <h2 id="help-modal-title" className={s.title}>{article.title}</h2>
              <button
                type="button"
                className={s.closeBtn}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className={s.body}>
              <p>{summary}</p>
            </div>
            <div className={s.footer}>
              <button type="button" className={s.footerBtn} onClick={() => setOpen(false)}>
                Close
              </button>
              <a
                href={articleHref}
                target="_blank"
                rel="noopener"
                className={`${s.footerBtn} ${s.footerBtnPrimary}`}
              >
                Read full article ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function QuestionIcon({ className }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.2 6.2c0-1 0.8-1.7 1.8-1.7s1.8 0.7 1.8 1.6c0 0.7-0.4 1.1-1 1.5-0.6 0.4-0.9 0.6-0.9 1.2v0.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.6" r="0.85" fill="currentColor" />
    </svg>
  );
}
