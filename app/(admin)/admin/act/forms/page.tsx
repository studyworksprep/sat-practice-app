// Admin → ACT → Forms. One row per form in the bank with the setting
// that drives Phase 3 test mode — classic vs enhanced format — next
// to the facts an admin needs to pick it: live question count per
// section judged by the form's kind (a released exam omits the
// unscored field-test items; an online practice test may carry them),
// the resulting section time limits, and whether the form has a
// score-conversion table.
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
  isActFormKind,
  minutesLabel,
  sectionCompleteness,
  sectionTimeLimitMs,
  type ActFormat,
  type ActFormKind,
} from '@/lib/practice/act-test-plan';
import { FormatSelect } from './FormatSelect';
import { KindSelect } from './KindSelect';
import { NameInput } from './NameInput';
import { defaultActFormName } from '@/lib/practice/act-form-names';
import s from '../questions/ActQuestions.module.css';

export const dynamic = 'force-dynamic';

interface FormRow {
  sourceTest: string;
  format: ActFormat;
  kind: ActFormKind;
  /** Saved student-facing name, or null when the derived default applies. */
  displayName: string | null;
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
    supabase.from('act_forms').select('source_test, format, kind, display_name'),
    supabase.from('act_score_conversion').select('source_test, section'),
  ]);

  const formatByForm = new Map<string, ActFormat>();
  const kindByForm = new Map<string, ActFormKind>();
  const nameByForm = new Map<string, string>();
  for (const r of (formRows ?? []) as Array<{ source_test: string; format: string; kind: string; display_name: string | null }>) {
    if (isActFormat(r.format)) formatByForm.set(r.source_test, r.format);
    if (isActFormKind(r.kind)) kindByForm.set(r.source_test, r.kind);
    if (r.display_name && r.display_name.trim()) nameByForm.set(r.source_test, r.display_name.trim());
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
        kind: kindByForm.get(r.source_test) ?? 'released',
        displayName: nameByForm.get(r.source_test) ?? null,
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
          English, Math and Reading. Three kinds of form exist: classic
          forms carry every question (75/60/40/40); in the new format a
          released exam omits the unscored field-test items, so a
          complete one has English 40, Math 41, Reading 27 and Science
          34, while an online practice test may include them (up to
          50/45/36/40). Every section is timed at the official pace for
          its question count, so 40 released English questions get 28
          minutes and 50 get 35. A section short of the released count
          is flagged partial. The name is what students see on the
          tests hub, attempt and results pages and in assignments; leave
          it blank to use the default derived from the key.
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
                <th className={s.th}>Name</th>
                <th className={s.th}>Format</th>
                <th className={s.th}>Kind</th>
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
                      <NameInput
                        sourceTest={row.sourceTest}
                        displayName={row.displayName}
                        defaultName={defaultActFormName(row.sourceTest)}
                      />
                    </td>
                    <td className={s.td}>
                      <FormatSelect sourceTest={row.sourceTest} format={row.format} hasRow={row.hasRow} />
                    </td>
                    <td className={s.td}>
                      <KindSelect sourceTest={row.sourceTest} kind={row.kind} hasRow={row.hasRow} />
                    </td>
                    {ACT_SECTIONS.map((sec) => {
                      const n = row.counts[sec] ?? 0;
                      if (n === 0) return <td key={sec} className={s.td} style={{ color: 'var(--fg3)' }}>—</td>;
                      const released = spec.sections[sec].released;
                      const status = sectionCompleteness(row.format, row.kind, sec, n);
                      return (
                        <td key={sec} className={s.td} style={{ whiteSpace: 'nowrap' }}>
                          {status === 'partial' ? `${n}/${released}` : n}
                          {status === 'partial' && <span className={`${s.pill} ${s.pillWarn}`}>partial</span>}
                          {status === 'full_length' && <span className={`${s.pill} ${s.pillMuted}`}>incl. unscored</span>}
                          {status === 'scored_only' && <span className={`${s.pill} ${s.pillMuted}`}>scored items only</span>}
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
