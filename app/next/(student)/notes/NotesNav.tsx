// Shared tab row for the /notes/* family of pages: Notes,
// Error Log, Flashcards. Surfaces all three siblings under the
// same management hub so the student sees them as one collection
// rather than three separate features. Active tab is computed
// from the current pathname.
//
// Each tab is just a Link, so navigating between them is a normal
// route transition — no client-side state to keep in sync.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from './Notes.module.css';

interface Tab {
  href: string;
  label: string;
  /** Match strategy: the pathname must equal this href OR start
   *  with `${href}/`. A bare equality match would highlight the
   *  Notes tab on /notes/anything-else (including the per-note
   *  edit pages, which we want), but not narrow enough on its
   *  own; the prefix branch is what makes /notes/[id] keep the
   *  Notes tab active. */
  matchPrefix?: string;
}

const TABS: Tab[] = [
  { href: '/notes',            label: 'Notes',      matchPrefix: '/notes' },
  { href: '/notes/error-log',  label: 'Error Log',  matchPrefix: '/notes/error-log' },
  { href: '/notes/flashcards', label: 'Flashcards', matchPrefix: '/notes/flashcards' },
];

export function NotesNav() {
  const pathname = usePathname() ?? '';

  // Resolve the active tab by longest matching prefix so a path
  // like /notes/error-log doesn't also match the /notes tab.
  const activeHref = TABS.reduce<string | null>((best, t) => {
    const prefix = t.matchPrefix ?? t.href;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      if (!best || prefix.length > (TABS.find((x) => x.href === best)?.matchPrefix ?? best).length) {
        return t.href;
      }
    }
    return best;
  }, null);

  return (
    <nav className={s.notesNav} aria-label="Notes sections">
      <ul className={s.notesNavList}>
        {TABS.map((t) => {
          const active = t.href === activeHref;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={active ? `${s.notesNavTab} ${s.notesNavTabActive}` : s.notesNavTab}
                aria-current={active ? 'page' : undefined}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
