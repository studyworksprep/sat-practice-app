// Generic page-level loading skeleton. Used as the Suspense
// fallback for each new-tree route group's loading.js, so a
// navigation immediately renders something while the next page's
// Server Components stream in.
//
// Shape mimics the design-kit page vocabulary the new tree uses
// throughout (eyebrow + serif h1 + sub paragraph + 4-tile stats
// strip + two content cards). One layout works for every page
// because the design kit standardized on this shape.

import s from './PageSkeleton.module.css';

export function PageSkeleton({ tilesCount = 4, cardsCount = 2 }) {
  return (
    <main className={s.main} aria-busy="true" aria-live="polite">
      <span className={s.srOnly}>Loading…</span>

      <header className={s.header}>
        <div className={`${s.shimmer} ${s.eyebrow}`} />
        <div className={`${s.shimmer} ${s.h1}`} />
        <div className={`${s.shimmer} ${s.sub}`} />
      </header>

      <div className={s.statsRow}>
        {Array.from({ length: tilesCount }).map((_, i) => (
          <div key={i} className={`${s.shimmer} ${s.stat}`} />
        ))}
      </div>

      {Array.from({ length: cardsCount }).map((_, i) => (
        <div key={i} className={`${s.shimmer} ${s.card}`} />
      ))}
    </main>
  );
}
