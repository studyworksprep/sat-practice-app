// Batch controls for the ACT rationale pipeline: pick a scope
// (section, form), a batch size, and generate; plus the
// bulk-approve step for the clean pending drafts in the same scope.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import { ACT_SECTIONS, sectionLabel } from '@/lib/practice/act-taxonomy';
import { generateActRationaleBatch, bulkApproveActRationales } from './actions';
import s from '../questions/ActQuestions.module.css';

export function RationaleControls({ forms }: { forms: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const [section, setSection] = useState('');
  const [form, setForm] = useState('');
  const [limit, setLimit] = useState('5');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function scopeLabel() {
    const parts = [section ? sectionLabel(section) : 'all sections', form || 'all forms'];
    return parts.join(' · ');
  }

  function onGenerate() {
    setMessage(null);
    setError(null);
    const fd = new FormData();
    fd.set('section', section);
    fd.set('form', form);
    fd.set('limit', limit);
    startTransition(async () => {
      const res = await generateActRationaleBatch(null, fd);
      if (res?.ok) {
        const failed = res.failed ?? [];
        setMessage(
          `Generated ${res.generated} draft${res.generated === 1 ? '' : 's'}`
          + (failed.length ? `, ${failed.length} failed` : '')
          + ` · ${res.remaining} still to do in this scope.`
          + (failed.length ? ` First failure: ${failed[0].error}` : ''),
        );
        router.refresh();
      } else {
        setError(res?.error ?? 'Generation failed');
      }
    });
  }

  async function onBulkApprove() {
    const ok = await confirm({
      title: `Approve all clean pending drafts (${scopeLabel()})?`,
      body: 'Only drafts with no validator warnings and not held for review are approved. Each approved rationale becomes visible to students immediately. Review a sample first.',
      confirmLabel: 'Approve clean drafts',
    });
    if (!ok) return;
    setMessage(null);
    setError(null);
    const fd = new FormData();
    fd.set('section', section);
    fd.set('form', form);
    startTransition(async () => {
      const res = await bulkApproveActRationales(null, fd);
      if (res?.ok) {
        setMessage(`Approved ${res.approved} draft${res.approved === 1 ? '' : 's'}; skipped ${res.skipped}.`);
        router.refresh();
      } else {
        setError(res?.error ?? 'Bulk approve failed');
      }
    });
  }

  return (
    <section className={s.card}>
      <div className={s.fieldLabel}>Generate</div>
      <div className={s.filterBar}>
        <select value={section} onChange={(e) => setSection(e.target.value)} className={s.select} aria-label="Section">
          <option value="">All sections</option>
          {ACT_SECTIONS.map((sec) => <option key={sec} value={sec}>{sectionLabel(sec)}</option>)}
        </select>
        <select value={form} onChange={(e) => setForm(e.target.value)} className={s.select} aria-label="Form">
          <option value="">All forms</option>
          {forms.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <label className={s.toggle}>
          Batch size
          <input
            type="number"
            min={1}
            max={10}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className={s.input}
            style={{ width: 72 }}
            aria-label="Batch size"
          />
        </label>
        <button type="button" className={s.btnPrimary} onClick={onGenerate} disabled={pending}>
          {pending ? 'Working…' : 'Generate next batch'}
        </button>
        <button type="button" className={s.btnSecondary} onClick={onBulkApprove} disabled={pending}>
          Approve clean drafts in scope
        </button>
      </div>
      <p className={s.fieldHint}>
        Each batch picks questions in this scope that have no rationale and no
        draft yet, up to 10 per click. Figure questions and anything the
        validator flags are held for review and never bulk-approved.
      </p>
      {message && <div className={s.notice} role="status">{message}</div>}
      {error && <div className={s.error} role="alert">{error}</div>}
      {confirmDialog}
    </section>
  );
}
