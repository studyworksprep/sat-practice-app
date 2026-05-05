// Official SAT/PSAT scores panel for the tutor's student-detail
// page. Shows past entries newest-first and an inline Add modal
// with optional per-domain (1-7) breakdown.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addOfficialScore, removeOfficialScore } from './actions';
import s from './StudentDetail.module.css';

const RW_DOMAINS = [
  ['domain_ini', 'Information & Ideas'],
  ['domain_cas', 'Craft & Structure'],
  ['domain_eoi', 'Expression of Ideas'],
  ['domain_sec', 'Standard English Conventions'],
];
const MATH_DOMAINS = [
  ['domain_alg', 'Algebra'],
  ['domain_atm', 'Advanced Math'],
  ['domain_pam', 'Problem-Solving & Data Analysis'],
  ['domain_geo', 'Geometry & Trigonometry'],
];

export function OfficialScoresCard({ studentId, scores }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <section className={s.card}>
      <div className={s.cardHeader}>
        <div className={s.sectionLabel}>Official scores</div>
        <button
          type="button"
          className={s.cardHeaderLink}
          onClick={() => setOpen(true)}
        >
          + Add
        </button>
      </div>

      {scores.length === 0 ? (
        <p className={s.empty}>No official scores recorded.</p>
      ) : (
        <ul className={s.scoreList}>
          {scores.map((sc) => (
            <ScoreRow
              key={sc.id}
              studentId={studentId}
              score={sc}
              onRemoved={() => router.refresh()}
            />
          ))}
        </ul>
      )}

      {open && (
        <AddScoreModal
          studentId={studentId}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </section>
  );
}

function ScoreRow({ studentId, score, onRemoved }) {
  const [pending, startTransition] = useTransition();
  const hasDomains = [...RW_DOMAINS, ...MATH_DOMAINS].some(([key]) => score[key] != null);
  return (
    <li className={s.scoreRow}>
      <div className={s.scoreRowMain}>
        <div className={s.scoreRowDate}>
          {/* Always include the year. The shared formatDate helper
              omits it for current-year dates, which made the score
              rows wrap inconsistently between, say, "Mar 13" and
              "Dec 5, 2025". */}
          {formatScoreDate(score.test_date)}
          <span className={s.scoreRowType}>{score.test_type ?? 'SAT'}</span>
        </div>
        <div className={s.scoreRowScores}>
          <span className={s.scorePillTotal}>{score.composite_score}</span>
          <span className={s.scorePillRw}>RW {score.rw_score}</span>
          <span className={s.scorePillMath}>Math {score.math_score}</span>
        </div>
      </div>
      {hasDomains && (
        <div className={s.scoreRowDomains}>
          {[...RW_DOMAINS, ...MATH_DOMAINS]
            .filter(([key]) => score[key] != null)
            .map(([key, label]) => (
              <span key={key} className={s.domainChip} title={label}>
                {label.split(' ')[0]}: <strong>{score[key]}</strong>
              </span>
            ))}
        </div>
      )}
      <button
        type="button"
        className={s.scoreRemove}
        disabled={pending}
        onClick={() => {
          if (!confirm('Remove this score?')) return;
          const fd = new FormData();
          fd.set('student_id', studentId);
          fd.set('id', score.id);
          startTransition(async () => {
            const res = await removeOfficialScore(null, fd);
            if (res?.ok) onRemoved?.();
          });
        }}
        aria-label="Remove score"
      >
        ✕
      </button>
    </li>
  );
}

function AddScoreModal({ studentId, onClose, onSaved }) {
  const [testDate, setTestDate] = useState('');
  const [testType, setTestType] = useState('SAT');
  const [rw, setRw] = useState('');
  const [math, setMath] = useState('');
  const [domains, setDomains] = useState({}); // domain key → '1'…'7'
  const [showDomains, setShowDomains] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  const composite = (Number(rw) || 0) + (Number(math) || 0);

  function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('student_id', studentId);
    fd.set('test_date', testDate);
    fd.set('test_type', testType);
    fd.set('rw_score', rw);
    fd.set('math_score', math);
    for (const [key, val] of Object.entries(domains)) {
      if (val !== '' && val != null) fd.set(key, val);
    }
    startTransition(async () => {
      const res = await addOfficialScore(null, fd);
      if (!res?.ok) {
        setError(res?.error ?? 'Could not save');
        return;
      }
      onSaved?.();
    });
  }

  return (
    <div className={s.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <strong className={s.modalTitle}>Add official score</strong>
          <button type="button" className={s.modalClose} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={onSubmit} className={s.modalBody}>
          <div className={s.fieldRow}>
            <label className={s.field}>
              <span className={s.fieldLabel}>Test date</span>
              <input
                type="date"
                value={testDate}
                onChange={(e) => setTestDate(e.target.value)}
                required
                autoFocus
                className={s.input}
              />
            </label>
            <label className={`${s.field} ${s.fieldNarrow}`}>
              <span className={s.fieldLabel}>Type</span>
              <select
                value={testType}
                onChange={(e) => setTestType(e.target.value)}
                className={s.input}
              >
                <option value="SAT">SAT</option>
                <option value="PSAT">PSAT</option>
              </select>
            </label>
          </div>

          <div className={s.fieldRow}>
            <label className={s.field}>
              <span className={s.fieldLabel}>Reading & Writing</span>
              <input
                type="number"
                min={200}
                max={800}
                step={10}
                value={rw}
                onChange={(e) => setRw(e.target.value)}
                required
                placeholder="200-800"
                className={s.input}
              />
            </label>
            <label className={s.field}>
              <span className={s.fieldLabel}>Math</span>
              <input
                type="number"
                min={200}
                max={800}
                step={10}
                value={math}
                onChange={(e) => setMath(e.target.value)}
                required
                placeholder="200-800"
                className={s.input}
              />
            </label>
          </div>

          {rw && math && (
            <div className={s.compositeRow}>
              Composite <strong>{composite}</strong>
            </div>
          )}

          <button
            type="button"
            className={s.btnSecondary}
            onClick={() => setShowDomains((v) => !v)}
            style={{ alignSelf: 'flex-start' }}
          >
            {showDomains ? 'Hide domain scores' : '+ Add domain scores (1–7)'}
          </button>

          {showDomains && (
            <div className={s.domainGroup}>
              <div className={s.domainGroupLabel}>Reading & Writing</div>
              <div className={s.domainGrid}>
                {RW_DOMAINS.map(([key, label]) => (
                  <DomainSelect key={key} k={key} label={label} value={domains[key] ?? ''} onChange={(v) => setDomains((d) => ({ ...d, [key]: v }))} />
                ))}
              </div>
              <div className={s.domainGroupLabel}>Math</div>
              <div className={s.domainGrid}>
                {MATH_DOMAINS.map(([key, label]) => (
                  <DomainSelect key={key} k={key} label={label} value={domains[key] ?? ''} onChange={(v) => setDomains((d) => ({ ...d, [key]: v }))} />
                ))}
              </div>
            </div>
          )}

          {error && <p role="alert" className={s.error}>{error}</p>}

          <div className={s.modalActions}>
            <button type="button" className={s.btnSecondary} onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className={s.btnPrimary} disabled={pending}>
              {pending ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DomainSelect({ k, label, value, onChange }) {
  return (
    <label className={s.domainCell}>
      <span className={s.domainCellLabel}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={s.input}>
        <option value="">—</option>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}

function formatScoreDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
