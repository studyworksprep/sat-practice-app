// Admin → ACT → Forms. One row per form in the bank with the setting
// that drives Phase 3 test mode — classic vs enhanced format — next
// to the facts an admin needs to pick it: live question count per
// section against the format's released count (released forms omit
// the unscored field-test items), the resulting section time limits,
// and whether the form has a score-conversion table.
//
// Forms with no act_forms row run as classic; the select saves a row
// on first change.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { ACT_SECTIONS, sectionLabel } from '@/lib/practice/act-taxonomy';
import {
  ACT_FORMAT_SPECS,
  isActFormat,
  isSectionComplete,
  minutesLabel,
  sectionTimeLimitMs,
  type ActFormat,
} from '@/lib/practice/act-test-plan';
import { FormatSelect } from './FormatSelect';
import s from '../questions/ActQuestions.module.css';

export const dynamic = 'force-dynamic';

interface FormRow {
  sourceTest: string;
  format: ActFormat;
  hasRow: boolean;
  counts: Record<string, number>;
  scaleRows: Record<string, number>;
}

export default async function AdminActFormsPage() {
  let supabase;
  try {
    ({ supabase } = await requireRole(['admin']));
  } catch {
    redirect('/');
  }

  const [{ data: questionRows }, { data: formRows }, { data: scaleRows }] = await Promise.all([
    supabase
      .from('act_questions')
      .select('source_test, section')
      .is('deleted_at', null)
      .eq('is_broken', false)
      .not('source_test', 'is', null),
    supabase.from('act_forms').select('source_test, format'),
    supabase.from('act_score_conversion').select('source_test, section'),
  ]);

  const formatByForm = new Map<string, ActFormat>();
  for (const r of (formRows ?? []) as Array<{ source_test: string; format: string }>) {
    if (isActFormat(r.format)) formatByForm.set(r.source_test, r.format);
  }
  const scaleByForm = new Map<string, Record<string, number>>();
  for (const r of (scaleRows ?? []) as Array<{ source_test: string; section: string }>) {
    const m = scaleByForm.get(r.source_test) ?? {};
    m[r.section] = (m[r.section] ?? 0) + 1;
    scaleByForm.set(r.source_test, m);
  }
  const rowsByForm = new Map<string, FormRow>();
  for (const r of (questionRows ?? []) as Array<{ source_test: string; section: string }>) {
    let row = rowsByForm.get(r.source_test);
    if (!row) {
      row = {
        sourceTest: r.source_test,
        format: formatByForm.get(r.source_test) ?? 'classic',
        hasRow: formatByForm.has(r.source_test),
        counts: {},
        scaleRows: scaleByForm.get(r.source_test) ?? {},
      };
      rowsByForm.set(r.source_test, row);
    }
    row.counts[r.section] = (row.counts[r.section] ?? 0) + 1;
  }
  const rows = Array.from(rowsByForm.values()).sort((a, b) => a.sourceTest.localeCompare(b.sourceTest));

  return (
    <main className={s.container}>
      <header className={s.header}>
        <Link href="/admin/act/questions" className={s.backLink}>← ACT questions</Link>
        <div className={s.titleRow}>
          <h1 className={s.h1}>ACT forms</h1>
          <div className={s.actions}>
            <Link href="/admin/act/score-conversion" className={s.btnSecondary}>Score conversion</Link>
            <Link href="/admin/act/imports" className={s.btnSecondary}>Imports</Link>
          </div>
        </div>
        <p className={s.sub}>
          The format decides each section&apos;s time limit, the break
          after Math and the composite rule when a student takes the
          form as a timed test. Classic: English 75q/45 min, Math
          60q/60 min, Reading 40q/35 min, Science 40q/35 min, composite
          over four. Enhanced (2025+): English 50q/35 min, Math 45q/50
          min, Reading 36q/40 min, Science 40q/40 min, composite over
          English, Math and Reading. Released forms omit the unscored
          field-test items, so a complete released enhanced form has
          English 40, Math 41, Reading 27 and Science 34 questions
          (classic released forms carry all 75/60/40/40). Each section
          is timed at the official pace, so 40 released English
          questions get 28 minutes; a section short of the released
          count is flagged partial.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className={s.empty}>No ACT forms in the bank yet.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>Form</th>
                <th className={s.th}>Format</th>
                {ACT_SECTIONS.map((sec) => (
                  <th key={sec} className={s.th}>{sectionLabel(sec)}</th>
                ))}
                <th className={s.th}>Scale table</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const spec = ACT_FORMAT_SPECS[row.format];
                return (
                  <tr key={row.sourceTest}>
                    <td className={`${s.td} ${s.mono}`}>
                      <Link href={`/admin/act/questions?form=${encodeURIComponent(row.sourceTest)}`} className={s.rowLink}>
                        {row.sourceTest}
                      </Link>
                    </td>
                    <td className={s.td}>
                      <FormatSelect sourceTest={row.sourceTest} format={row.format} hasRow={row.hasRow} />
                    </td>
                    {ACT_SECTIONS.map((sec) => {
                      const n = row.counts[sec] ?? 0;
                      if (n === 0) return <td key={sec} className={s.td} style={{ color: 'var(--fg3)' }}>—</td>;
                      const released = spec.sections[sec].released;
                      const complete = isSectionComplete(row.format, sec, n);
                      return (
                        <td key={sec} className={s.td} style={{ whiteSpace: 'nowrap' }}>
                          {complete ? n : `${n}/${released}`}
                          {complete ? null : <span className={`${s.pill} ${s.pillWarn}`}>partial</span>}
                          <div className={s.fieldHint}>{minutesLabel(sectionTimeLimitMs(row.format, sec, n))}</div>
                        </td>
                      );
                    })}
                    <td className={s.td} style={{ whiteSpace: 'nowrap' }}>
                      {ACT_SECTIONS.filter((sec) => (row.counts[sec] ?? 0) > 0).map((sec) => {
                        const have = row.scaleRows[sec] ?? 0;
                        return (
                          <span key={sec} className={`${s.pill} ${have > 0 ? s.pillOk : s.pillMuted}`} style={{ marginRight: 4 }}>
                            {sectionLabel(sec).slice(0, 1)} {have > 0 ? `0–${have - 1}` : 'none'}
                          </span>
                        );
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
