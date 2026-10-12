// Batch controls for the ACT difficulty backfill: pick a scope
// (section, form) and how many passage groups to rate per click,
// then run. Shows the ratings the click produced so the admin can
// spot-check reasons without opening each question.

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ACT_SECTIONS, sectionLabel } from '@/lib/practice/act-taxonomy';
import { estimateActDifficultyBatch, type DifficultyBatchDetail } from './difficulty-actions';
import s from './ActQuestions.module.css';

export function DifficultyControls({
  missing,
  forms,
}: {
  /** Live questions with no difficulty, per section. */
  missing: Record<string, number>;
  forms: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [section, setSection] = useState('');
  const [form, setForm] = useState('');
  const [groups, setGroups] = useState('3');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<DifficultyBatchDetail[]>([]);
  const [failures, setFailures] = useState<Array<{ group: string; error: string }>>([]);

  const total = Object.values(missing).reduce((a, b) => a + b, 0);
  const perSection = ACT_SECTIONS
    .filter((sec) => (missing[sec] ?? 0) > 0)
    .map((sec) => `${sectionLabel(sec)} ${missing[sec]}`)
    .join(' · ');

  function onEstimate() {
    setMessage(null);
    setError(null);
    setDetails([]);
    setFailures([]);
    const fd = new FormData();
    fd.set('section', section);
    fd.set('form', form);
    fd.set('groups', groups);
    startTransition(async () => {
      const res = await estimateActDifficultyBatch(null, fd);
      if (res?.ok) {
        const failed = res.failed ?? [];
        setMessage(
          `Rated ${res.rated} question${res.rated === 1 ? '' : 's'} across ${res.groups} passage group${res.groups === 1 ? '' : 's'}`
          + (failed.length ? `; ${failed.length} problem${failed.length === 1 ? '' : 's'}` : '')
          + ` · ${res.remaining} still unrated in this scope.`,
        );
        setDetails(res.details ?? []);
        setFailures(failed);
        router.refresh();
      } else {
        setError(res?.error ?? 'Estimate failed');
      }
    });
  }

  return (
    <section className={s.card}>
      <div className={s.fieldLabel}>Difficulty backfill</div>
      <p className={s.fieldHint}>
        {total.toLocaleString()} live question{total === 1 ? '' : 's'} still
        {total === 1 ? ' has' : ' have'} no difficulty ({perSection || 'none'}).
        Each click sends the next few passage groups in this scope to Claude,
        which rates every question of a passage together; values are stored as
        AI estimates (shown with * below and named in the editor) until student
        performance data replaces them. Editing a value in the editor marks it
        manual.
      </p>
      <div className={s.filterBar}>
        <select value={section} onChange={(e) => setSection(e.target.value)} className={s.select} aria-label="Section">
          <option value="">All sections</option>
          {ACT_SECTIONS.map((sec) => (
            <option key={sec} value={sec}>{sectionLabel(sec)}{missing[sec] ? ` (${missing[sec]})` : ''}</option>
          ))}
        </select>
        <select value={form} onChange={(e) => setForm(e.target.value)} className={s.select} aria-label="Form">
          <option value="">All forms</option>
          {forms.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <label className={s.toggle}>
          Passage groups
          <input
            type="number"
            min={1}
            max={5}
            value={groups}
            onChange={(e) => setGroups(e.target.value)}
            className={s.input}
            style={{ width: 72 }}
            aria-label="Passage groups per click"
          />
        </label>
        <button type="button" className={s.btnPrimary} onClick={onEstimate} disabled={pending}>
          {pending ? 'Rating…' : 'Estimate next batch'}
        </button>
      </div>
      {message && <div className={s.notice} role="status">{message}</div>}
      {error && <div className={s.error} role="alert">{error}</div>}
      {failures.length > 0 && (
        <ul className={s.fieldHint}>
          {failures.slice(0, 10).map((f, i) => (
            <li key={i}><strong>{f.group}</strong>: {f.error}</li>
          ))}
          {failures.length > 10 && <li>…and {failures.length - 10} more.</li>}
        </ul>
      )}
      {details.length > 0 && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>Form</th>
                <th className={s.th}>Section</th>
                <th className={`${s.th} ${s.tdNum}`}>#</th>
                <th className={`${s.th} ${s.tdNum}`}>Diff</th>
                <th className={s.th}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {details.map((d) => (
                <tr key={d.questionId}>
                  <td className={`${s.td} ${s.mono}`}>
                    <Link href={`/admin/act/questions/${d.questionId}`} className={s.rowLink}>
                      {d.sourceTest ?? d.questionId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className={s.td}>{sectionLabel(d.section)}</td>
                  <td className={`${s.td} ${s.tdNum}`}>{d.ordinal ?? '—'}</td>
                  <td className={`${s.td} ${s.tdNum}`}>{d.difficulty}*</td>
                  <td className={s.td}>{d.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
