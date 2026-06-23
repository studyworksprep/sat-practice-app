// Practice-question (question_link) block editor.
//
// Searches the published question bank and lets the admin pick one
// real question to embed by id. The block content schema stays
// minimal — { id, question_id } — exactly what the runtime reads to
// link out to /practice/${question_id}; the picker just resolves a
// human-friendly question onto that id.
//
// Selection shows a live stem preview so the admin sees what they're
// embedding without leaving the canvas.

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/lib/ui/Button';
import { SafeHtml } from '@/lib/ui/SafeHtml';
import { useMathTypeset } from '@/lib/ui/preview-effects';
import { searchQuestionBank, getQuestionById } from './actions';
import f from '../../../forms.module.css';

type Question = {
  id: string;
  display_code: string | null;
  question_type: string;
  domain_name: string | null;
  skill_name: string | null;
  difficulty: number | null;
  score_band: number | null;
  stem_html: string | null;
};

type Content = { id?: string; question_id?: string } & Record<string, unknown>;

export function QuestionPicker({
  content,
  onChange,
}: {
  content: Content;
  onChange: (next: Content) => void;
}) {
  const selectedId = content?.question_id ?? '';
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Question | null>(null);
  const [pending, startTransition] = useTransition();

  function runSearch(query: string) {
    setError(null);
    startTransition(async () => {
      const res = (await searchQuestionBank({ q: query })) as
        | { ok: true; data: { rows: Question[]; total: number } }
        | { ok: false; error: string };
      if (res.ok) {
        setRows(res.data.rows);
        setTotal(res.data.total);
      } else {
        setError(res.error);
      }
    });
  }

  // Initial result list + resolve any already-linked question.
  useEffect(() => {
    runSearch('');
    if (selectedId) {
      startTransition(async () => {
        const res = (await getQuestionById(selectedId)) as
          | { ok: true; data: { question: Question | null } }
          | { ok: false; error: string };
        if (res.ok) setSelected(res.data.question);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(row: Question) {
    setSelected(row);
    onChange({ ...content, question_id: row.id });
  }

  function clear() {
    setSelected(null);
    onChange({ ...content, question_id: '' });
  }

  return (
    <div style={S.wrap}>
      <SelectedBanner selected={selected} selectedId={selectedId} onClear={clear} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(q);
        }}
        style={S.searchRow}
      >
        <input
          type="text"
          className={f.input}
          placeholder="Search by code or stem text…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1 }}
        />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {error ? <div className={f.err}>{error}</div> : null}

      <div style={S.results}>
        {rows.length === 0 && !pending ? (
          <p className={f.muted} style={{ padding: 8 }}>No matching questions.</p>
        ) : null}
        {rows.map((row) => (
          <QuestionRow key={row.id} row={row} active={row.id === selectedId} onPick={() => pick(row)} />
        ))}
      </div>
      {total > rows.length ? (
        <p className={f.muted} style={{ fontSize: 11 }}>
          Showing {rows.length} of {total}. Refine your search to narrow results.
        </p>
      ) : null}
    </div>
  );
}

function SelectedBanner({
  selected,
  selectedId,
  onClear,
}: {
  selected: Question | null;
  selectedId: string;
  onClear: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useMathTypeset(ref, selected?.stem_html ?? selectedId);

  if (!selectedId) {
    return <div style={S.bannerEmpty}>No question linked yet — search and choose one below.</div>;
  }
  return (
    <div style={S.banner} ref={ref}>
      <div style={S.bannerHead}>
        <span style={S.bannerLabel}>Linked question</span>
        <code style={S.code}>{selected?.display_code ?? selectedId}</code>
        <Button type="button" variant="remove" size="sm" onClick={onClear} style={{ marginLeft: 'auto' }}>
          Clear
        </Button>
      </div>
      {selected?.stem_html ? (
        <div style={S.bannerStem}>
          <SafeHtml as="div" html={selected.stem_html} />
        </div>
      ) : (
        <div style={S.metaRow}>
          <code style={S.code}>{selectedId}</code>
        </div>
      )}
    </div>
  );
}

function QuestionRow({ row, active, onPick }: { row: Question; active: boolean; onPick: () => void }) {
  return (
    <div style={{ ...S.row, ...(active ? S.rowActive : null) }}>
      <div style={S.rowMain}>
        <div style={S.rowMeta}>
          <code style={S.code}>{row.display_code ?? row.id.slice(0, 8)}</code>
          <span style={S.tag}>{row.question_type}</span>
          {row.skill_name ? <span style={S.muted}>{row.skill_name}</span> : null}
          {row.difficulty != null ? <span style={S.muted}>· diff {row.difficulty}</span> : null}
        </div>
        {row.stem_html ? (
          <div style={S.rowStem}>
            <SafeHtml as="div" html={row.stem_html} />
          </div>
        ) : null}
      </div>
      <Button type="button" variant={active ? 'primary' : 'secondary'} size="sm" onClick={onPick}>
        {active ? 'Linked' : 'Use'}
      </Button>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 10 },

  bannerEmpty: {
    padding: 10,
    border: '1px dashed var(--border-strong)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--fg3)',
    fontStyle: 'italic',
    fontSize: 13,
  },
  banner: {
    padding: 10,
    border: '1px solid var(--color-app-accent)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-app-accent-bg, #eef)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  bannerHead: { display: 'flex', alignItems: 'center', gap: 8 },
  bannerLabel: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-navy-900)',
  },
  bannerStem: { fontSize: 14, color: 'var(--fg1)', maxHeight: 160, overflow: 'auto' },

  searchRow: { display: 'flex', gap: 8, alignItems: 'center' },
  results: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 320,
    overflow: 'auto',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: 6,
  },
  row: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    padding: 8,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-white, var(--card))',
  },
  rowActive: { borderColor: 'var(--color-app-accent)' },
  rowMain: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  rowMeta: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 },
  rowStem: { fontSize: 13, color: 'var(--fg2)', maxHeight: 60, overflow: 'hidden' },

  code: { fontSize: 12, color: 'var(--fg2)', fontWeight: 600 },
  tag: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    color: 'var(--fg3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-pill)',
    padding: '0 6px',
  },
  muted: { color: 'var(--fg3)', fontSize: 12 },
  metaRow: { fontSize: 12 },
};
