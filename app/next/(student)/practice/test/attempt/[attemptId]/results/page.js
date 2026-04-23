// Practice-test results page (V1). Shows composite + per-section
// scaled scores plus a per-module raw-correct breakdown. Richer
// per-question review (rationale reveal, domain/skill accuracy)
// lands in a follow-up.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import s from './Results.module.css';

export const dynamic = 'force-dynamic';

export default async function PracticeTestResultsPage({ params }) {
  const { attemptId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const { data: attempt } = await supabase
    .from('practice_test_attempts_v2')
    .select(`
      id, user_id, status, started_at, finished_at,
      composite_score, rw_scaled, math_scaled,
      practice_test:practice_tests_v2(id, code, name)
    `)
    .eq('id', attemptId)
    .maybeSingle();
  if (!attempt) notFound();
  if (attempt.user_id !== user.id) notFound();

  // Still in progress? Bounce back to the attempt router which
  // redirects into the current module.
  if (attempt.status === 'in_progress') {
    redirect(`/practice/test/attempt/${attemptId}`);
  }

  const { data: moduleAttempts } = await supabase
    .from('practice_test_module_attempts_v2')
    .select(`
      id, correct_count, raw_score, started_at, finished_at,
      practice_test_module:practice_test_modules_v2(
        subject_code, module_number, route_code
      )
    `)
    .eq('practice_test_attempt_id', attemptId)
    .order('started_at', { ascending: true });

  // Count items per module so we can show raw/total.
  const moduleIds = (moduleAttempts ?? [])
    .map((m) => m.practice_test_module)
    .filter(Boolean);
  const totalsByKey = new Map();
  if (moduleIds.length > 0) {
    // We don't have module ids on the select above in a queryable
    // form; re-query for module ids + item counts so totals land.
    const { data: rawModuleRows } = await supabase
      .from('practice_test_module_attempts_v2')
      .select('practice_test_module:practice_test_modules_v2(id, subject_code, module_number, route_code)')
      .eq('practice_test_attempt_id', attemptId);
    const idsList = (rawModuleRows ?? [])
      .map((r) => r.practice_test_module?.id)
      .filter(Boolean);
    if (idsList.length > 0) {
      const { data: itemRows } = await supabase
        .from('practice_test_module_items_v2')
        .select('practice_test_module_id')
        .in('practice_test_module_id', idsList);
      const countByModId = new Map();
      for (const r of itemRows ?? []) {
        countByModId.set(
          r.practice_test_module_id,
          (countByModId.get(r.practice_test_module_id) ?? 0) + 1,
        );
      }
      for (const r of rawModuleRows ?? []) {
        const m = r.practice_test_module;
        if (!m) continue;
        const key = `${m.subject_code}|${m.module_number}`;
        totalsByKey.set(key, (totalsByKey.get(key) ?? 0) + (countByModId.get(m.id) ?? 0));
      }
    }
  }

  const modules = (moduleAttempts ?? []).map((ma) => {
    const m = ma.practice_test_module;
    return {
      subject:       m?.subject_code ?? '—',
      moduleNumber:  m?.module_number ?? 0,
      routeCode:     m?.route_code ?? 'std',
      correctCount:  ma.correct_count ?? 0,
      rawScore:      ma.raw_score ?? 0,
    };
  });

  // RW + Math totals for the section tiles.
  function subjectTotals(subj) {
    let correct = 0;
    let total = 0;
    for (const m of modules) {
      if (m.subject === subj) {
        correct += m.correctCount;
        total += totalsByKey.get(`${subj}|${m.moduleNumber}`) ?? 0;
      }
    }
    // Dedupe the key totals — totalsByKey is per (subject, module_number),
    // not per attempt, so we may have double-counted if two module
    // attempts shared a key. Compute directly from unique keys:
    const uniqueKeys = new Set();
    for (const m of modules) {
      if (m.subject === subj) uniqueKeys.add(`${subj}|${m.moduleNumber}`);
    }
    total = 0;
    for (const k of uniqueKeys) total += totalsByKey.get(k) ?? 0;
    return { correct, total };
  }

  const rwTotals = subjectTotals('RW');
  const mathTotals = subjectTotals('MATH');

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Practice test results</div>
        <h1 className={s.h1}>{attempt.practice_test.name}</h1>
        <div className={s.sub}>
          {attempt.practice_test.code} ·{' '}
          {attempt.finished_at
            ? new Date(attempt.finished_at).toLocaleDateString(undefined, {
                year: 'numeric', month: 'long', day: 'numeric',
              })
            : '—'}
          {attempt.status === 'abandoned' && (
            <span className={s.abandonedTag}> · Abandoned</span>
          )}
        </div>
      </header>

      <section className={s.compositeCard}>
        <div className={s.compositeLabel}>Composite score</div>
        <div className={s.compositeValue}>
          {attempt.composite_score ?? '—'}
        </div>
        <div className={s.compositeMax}> / 1600</div>
      </section>

      <section className={s.sectionScoreRow}>
        <SectionScoreTile
          label="Reading & Writing"
          scaled={attempt.rw_scaled}
          correct={rwTotals.correct}
          total={rwTotals.total}
          tone="rw"
        />
        <SectionScoreTile
          label="Math"
          scaled={attempt.math_scaled}
          correct={mathTotals.correct}
          total={mathTotals.total}
          tone="math"
        />
      </section>

      <section className={s.card}>
        <div className={s.sectionLabel}>Module breakdown</div>
        <ul className={s.moduleList}>
          {modules.map((m, idx) => {
            const total = totalsByKey.get(`${m.subject}|${m.moduleNumber}`) ?? 0;
            const pct = total > 0 ? Math.round((m.correctCount / total) * 100) : null;
            return (
              <li key={idx} className={s.moduleRow}>
                <div className={s.moduleRowLeft}>
                  <div className={s.moduleRowName}>
                    {m.subject === 'RW' ? 'Reading & Writing' : 'Math'} · Module {m.moduleNumber}
                  </div>
                  <div className={s.moduleRowMeta}>
                    {m.routeCode} route
                  </div>
                </div>
                <div className={s.moduleRowRight}>
                  <div className={s.moduleRowScore}>
                    {m.correctCount} <span className={s.moduleRowOver}>/ {total || '—'}</span>
                  </div>
                  {pct != null && (
                    <div className={s.moduleRowPct}>{pct}%</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className={s.footer}>
        <Link href="/practice/start" className={s.footerLink}>
          ← Back to practice
        </Link>
        <Link href="/dashboard" className={s.footerLinkPrimary}>
          Dashboard →
        </Link>
      </div>
    </main>
  );
}

function SectionScoreTile({ label, scaled, correct, total, tone }) {
  const cls = tone === 'rw' ? s.sectionTileRw : s.sectionTileMath;
  return (
    <div className={`${s.sectionTile} ${cls}`}>
      <div className={s.sectionTileLabel}>{label}</div>
      <div className={s.sectionTileScaled}>
        {scaled ?? '—'}
        <span className={s.sectionTileMax}> / 800</span>
      </div>
      <div className={s.sectionTileRaw}>
        {correct} correct
        {total > 0 && <span className={s.sectionTileOver}> / {total}</span>}
      </div>
    </div>
  );
}
