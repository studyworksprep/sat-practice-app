// Runner-shaped Suspense fallback. Mirrors the shape of
// PracticeInteractive (header three-slot strip → question pane →
// QuestionMap footer) so a navigation lands on a layout that
// matches the runner instead of the generic dashboard skeleton —
// no jarring shift when the real component takes over.
//
// Used by:
//   /practice/s/[sessionId]/[position]/loading.js                  (student runner)
//   /tutor/training/practice/s/[sessionId]/[position]/loading.js   (tutor training runner)
//
// The shape changes only on the runner page, so we keep this
// scoped to a leaf loading.js rather than overriding the route-
// group default.

import s from './RunnerSkeleton.module.css';

export function RunnerSkeleton() {
  return (
    <main className={s.main} aria-busy="true" aria-live="polite">
      <span className={s.srOnly}>Loading question…</span>

      <header className={s.header}>
        <div className={s.headerLeft}>
          <div className={`${s.shimmer} ${s.progress}`} />
          <div className={`${s.shimmer} ${s.meta}`} />
        </div>
        <div className={s.headerCenter}>
          <div className={`${s.shimmer} ${s.pill}`} />
        </div>
        <div className={s.headerRight}>
          <div className={`${s.shimmer} ${s.toolBtn}`} />
          <div className={`${s.shimmer} ${s.toolBtn}`} />
          <div className={`${s.shimmer} ${s.iconBtn}`} />
          <div className={`${s.shimmer} ${s.iconBtn}`} />
        </div>
      </header>

      <section className={s.article}>
        <div className={s.twoPane}>
          <div className={s.passagePane}>
            <div className={`${s.shimmer} ${s.line} ${s.lineLong}`} />
            <div className={`${s.shimmer} ${s.line} ${s.lineLong}`} />
            <div className={`${s.shimmer} ${s.line} ${s.lineMed}`} />
            <div className={`${s.shimmer} ${s.line} ${s.lineLong}`} />
            <div className={`${s.shimmer} ${s.line} ${s.lineShort}`} />
            <div className={`${s.shimmer} ${s.line} ${s.lineMed}`} />
          </div>
          <div className={s.stemPane}>
            <div className={`${s.shimmer} ${s.line} ${s.lineLong}`} />
            <div className={`${s.shimmer} ${s.line} ${s.lineMed}`} />
            <div className={s.options}>
              <div className={`${s.shimmer} ${s.option}`} />
              <div className={`${s.shimmer} ${s.option}`} />
              <div className={`${s.shimmer} ${s.option}`} />
              <div className={`${s.shimmer} ${s.option}`} />
            </div>
            <div className={`${s.shimmer} ${s.submitBtn}`} />
          </div>
        </div>
      </section>

      <footer className={s.footer}>
        <span className={s.footerLabel} aria-hidden="true">Questions</span>
        <div className={s.pillRow}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={`${s.shimmer} ${s.mapPill}`} />
          ))}
        </div>
        <div className={`${s.shimmer} ${s.submitSetBtn}`} />
      </footer>
    </main>
  );
}
