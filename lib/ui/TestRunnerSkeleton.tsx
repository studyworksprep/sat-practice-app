// Bluebook-shaped Suspense skeleton for the practice-test runner.
// Mirrors TestRunnerInteractive's shell — top bar (module label /
// timer / tools), full-width question area (number chip + mark
// pill, dashed rule, stem lines, four option rows), sticky bottom
// bar (question pill / Back / Next) — so entering a module, a
// module transition, or a refresh lands on the runner's own
// silhouette instead of the dashboard-shaped PageSkeleton.
// Shimmer treatment matches PageSkeleton / RunnerSkeleton so the
// skeleton family reads as one system.

import s from './TestRunnerSkeleton.module.css';

export function TestRunnerSkeleton() {
  return (
    <div className={s.shell} aria-busy="true" aria-live="polite">
      <span className={s.srOnly}>Loading…</span>

      <div className={s.topBar}>
        <div className={s.topBarLeft}>
          <div className={`${s.shimmer} ${s.moduleLabel}`} />
          <div className={`${s.shimmer} ${s.testName}`} />
        </div>
        <div className={s.topBarCenter}>
          <div className={`${s.shimmer} ${s.timer}`} />
        </div>
        <div className={s.topBarRight}>
          <div className={`${s.shimmer} ${s.toolBtn}`} />
          <div className={`${s.shimmer} ${s.toolBtn}`} />
        </div>
      </div>

      <main className={s.main}>
        <div className={s.questionHeader}>
          <div className={`${s.shimmer} ${s.numChip}`} />
          <div className={`${s.shimmer} ${s.markPill}`} />
        </div>
        <div className={s.rule} />
        <div className={s.stem}>
          <div className={`${s.shimmer} ${s.line} ${s.lineLong}`} />
          <div className={`${s.shimmer} ${s.line} ${s.lineMed}`} />
        </div>
        <div className={s.options}>
          <div className={`${s.shimmer} ${s.option}`} />
          <div className={`${s.shimmer} ${s.option}`} />
          <div className={`${s.shimmer} ${s.option}`} />
          <div className={`${s.shimmer} ${s.option}`} />
        </div>
      </main>

      <div className={s.bottomBar}>
        <div className={s.bottomBarCenter}>
          <div className={`${s.shimmer} ${s.questionPill}`} />
        </div>
        <div className={s.bottomBarRight}>
          <div className={`${s.shimmer} ${s.navBtn}`} />
          <div className={`${s.shimmer} ${s.navBtnPrimary}`} />
        </div>
      </div>
    </div>
  );
}
