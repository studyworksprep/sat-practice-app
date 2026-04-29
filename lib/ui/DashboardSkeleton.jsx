// Dashboard-shaped Suspense fallback. Mirrors the student
// dashboard's vertical stack — banner → 4-tile stats row → 2-up
// performance grid → bottom row (recent + assignments) → target
// card — so the load-in handoff matches the real dashboard
// instead of the generic PageSkeleton's eyebrow + stats + cards.
//
// Dashboard pulls 9+ queries on every visit (see (student)
// /dashboard/page.js); this is the screen the cold-start latency
// shows up on most. Matching the shape closely is what makes the
// 1–2 seconds the queries take feel like loading rather than
// nothing happening.

import s from './DashboardSkeleton.module.css';

export function DashboardSkeleton() {
  return (
    <main className={s.main} aria-busy="true" aria-live="polite">
      <span className={s.srOnly}>Loading dashboard…</span>

      <div className={`${s.shimmer} ${s.banner}`}>
        <div className={s.bannerText}>
          <div className={`${s.shimmer} ${s.bannerEyebrow}`} />
          <div className={`${s.shimmer} ${s.bannerH1}`} />
          <div className={s.bannerChips}>
            <div className={`${s.shimmer} ${s.chip}`} />
            <div className={`${s.shimmer} ${s.chip}`} />
          </div>
        </div>
        <div className={s.bannerActions}>
          <div className={`${s.shimmer} ${s.cta}`} />
          <div className={`${s.shimmer} ${s.cta}`} />
        </div>
      </div>

      <div className={s.statsRow}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${s.shimmer} ${s.stat}`} />
        ))}
      </div>

      <div className={s.perfGrid}>
        <div className={`${s.shimmer} ${s.perfCard}`} />
        <div className={`${s.shimmer} ${s.perfCard}`} />
      </div>

      <div className={s.bottomRow}>
        <div className={`${s.shimmer} ${s.bottomCard}`} />
        <div className={`${s.shimmer} ${s.bottomCard}`} />
      </div>

      <div className={`${s.shimmer} ${s.targetCard}`} />
    </main>
  );
}
