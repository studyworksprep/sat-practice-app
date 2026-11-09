// Small line icons for the SlideFeatures cards on the persona
// feature decks (app/features/*). 22px, stroke = currentColor, so the
// card's accent color applies. Shared here so the three decks don't
// each carry their own SVG copies.

import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const icons = {
  // Mastery
  weight: (
    <Icon>
      <path d="M12 3v18" />
      <path d="M5 7h14" />
      <path d="M5 7l-3 7a3 3 0 006 0z" />
      <path d="M19 7l-3 7a3 3 0 006 0z" />
    </Icon>
  ),
  stack: (
    <Icon>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </Icon>
  ),
  hint: (
    <Icon>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" />
    </Icon>
  ),
  trendDown: (
    <Icon>
      <path d="M3 7l6 6 4-4 8 8" />
      <path d="M21 11v6h-6" />
    </Icon>
  ),
  // Lessons
  book: (
    <Icon>
      <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" />
      <path d="M4 21V5" />
      <path d="M9 7h6" />
    </Icon>
  ),
  check: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </Icon>
  ),
  graph: (
    <Icon>
      <path d="M3 3v18h18" />
      <path d="M7 15c3-8 6-8 10-2" />
    </Icon>
  ),
  play: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8l6 4-6 4z" />
    </Icon>
  ),
  // ACT
  grid: (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  ),
  clock: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  ),
  report: (
    <Icon>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M9 17v-3" />
      <path d="M12 17v-6" />
      <path d="M15 17v-4" />
    </Icon>
  ),
};
