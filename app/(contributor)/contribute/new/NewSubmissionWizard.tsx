'use client';

// The three entry flows, in one component because they share the
// score/label/date footer and the submitted state.
//
// The ordering is deliberate: the report upload is first and named as
// the default, because it is the only route with zero answer entry and
// the only one that ships evidence with it. The grid is last and framed
// as a fallback — it's the most work and the least verifiable.
//
// Nothing here decides anything. The server re-parses the report, the
// server reads the attempt, and the database re-checks the grid's
// checksum. The counters and disabled buttons below are there so a
// contributor finds out about a mistake while they can still see what
// caused it, not so the server can trust them.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import {
  createHtmlUploadSubmission,
  createAttemptLinkedSubmission,
  createManualGridSubmission,
  crossCheckAttempt,
  loadAttemptEntryView,
  type AttemptEntryView,
  type CrossCheckResult,
} from '@/lib/bluebook/submission-actions';
import s from '../Contribute.module.css';

/** The question numbers each module actually uses, in order. Not a
 *  count: the grid labels cells with these, so the vector it builds is
 *  keyed the same way the module items are. */
export interface ModuleShape {
  RW1: number[];
  RW2: number[];
  MATH1: number[];
  MATH2: number[];
}

export interface AttemptOption {
  id: string;
  practiceTestId: string;
  testName: string;
  finishedAt: string | null;
}

interface TestOption {
  id: string;
  name: string;
  code: string;
}

type Flow = 'html_upload' | 'attempt_link' | 'manual_grid';

const MODULE_KEYS = ['RW1', 'RW2', 'MATH1', 'MATH2'] as const;
type ModuleKey = (typeof MODULE_KEYS)[number];

const MODULE_LABELS: Record<ModuleKey, string> = {
  RW1: 'Reading & Writing · Module 1',
  RW2: 'Reading & Writing · Module 2',
  MATH1: 'Math · Module 1',
  MATH2: 'Math · Module 2',
};

interface ParsedPreview {
  testName: string;
  testDate: string;
  reportDate: string | null;
  questionCount: number;
  correctCounts: {
    rw: { m1: number; m2: number; total: number };
    math: { m1: number; m2: number; total: number };
  };
}

export function NewSubmissionWizard({
  tests,
  attempts,
  moduleShapes,
  canLinkAttempts,
}: {
  tests: TestOption[];
  attempts: AttemptOption[];
  moduleShapes: Record<string, ModuleShape>;
  canLinkAttempts: boolean;
}) {
  const [flow, setFlow] = useState<Flow | null>(null);
  const [done, setDone] = useState<{ id: string; flags: unknown[]; autoVerified?: boolean } | null>(null);

  if (done) return <SubmittedPanel flags={done.flags} autoVerified={Boolean(done.autoVerified)} />;

  return (
    <>
      <div className={s.flowGrid} style={{ marginBottom: 24 }}>
        <FlowCard
          active={flow === 'html_upload'}
          onSelect={() => setFlow('html_upload')}
          title="Upload the score report"
          when="You saved the Details page from My Practice. Nothing to enter but the two section scores. Start here if you can."
        />
        {canLinkAttempts && (
          <FlowCard
            active={flow === 'attempt_link'}
            onSelect={() => setFlow('attempt_link')}
            title="Link an in-app test"
            when="Your student took the test in Studyworks and you keyed the same answers into Bluebook. We already have the answers — just add the official scores."
          />
        )}
        <FlowCard
          active={flow === 'manual_grid'}
          onSelect={() => setFlow('manual_grid')}
          title="Mark the wrong ones"
          when="No file, no in-app attempt. Everything starts marked correct and you flip the misses. Slowest route — use it when the others don't fit."
        />
      </div>

      {flow === 'html_upload' && (
        <HtmlUploadFlow tests={tests} onDone={setDone} />
      )}
      {flow === 'attempt_link' && (
        <AttemptLinkFlow attempts={attempts} onDone={setDone} />
      )}
      {flow === 'manual_grid' && (
        <ManualGridFlow tests={tests} moduleShapes={moduleShapes} onDone={setDone} />
      )}
    </>
  );
}

function FlowCard({
  active, onSelect, title, when,
}: { active: boolean; onSelect: () => void; title: string; when: string }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`${s.flowCard} ${active ? s.flowCardActive : ''}`}
    >
      <div className={s.flowTitle}>{title}</div>
      <div className={s.flowWhen}>{when}</div>
    </button>
  );
}

function SubmittedPanel({ flags, autoVerified }: { flags: unknown[]; autoVerified: boolean }) {
  const router = useRouter();
  const conflict = flags.some((f) => (f as { code?: string })?.code === 'conversion_conflict');

  return (
    <div className={s.card}>
      <div className={s.flowTitle}>Thank you — that&rsquo;s in.</div>
      <p className={s.muted} style={{ marginTop: 8 }}>
        {conflict
          ? 'One thing to flag: another official report gave a different scaled score for the same module counts. Nothing is wrong with what you sent — a reviewer will look at both and work out which is right.'
          : autoVerified
            ? 'Your report was accepted straight away — you\u2019ve sent enough that held up that we no longer read each one first. It goes into the scoring data on the next pass.'
            : 'A reviewer will check it before it feeds the scoring data. You can follow its progress from your contributions list.'}
      </p>
      <div className={s.actions}>
        <Button href="/contribute">Back to contributions</Button>
        <Button variant="secondary" onClick={() => router.refresh()}>
          Send another
        </Button>
      </div>
    </div>
  );
}

// ── Shared score/label footer ─────────────────────────────────────

interface Meta {
  rwScaled: string;
  mathScaled: string;
  subjectLabel: string;
  reportDate: string;
}

const EMPTY_META: Meta = { rwScaled: '', mathScaled: '', subjectLabel: '', reportDate: '' };

function ScoreFields({
  meta, setMeta, hint,
}: { meta: Meta; setMeta: (m: Meta) => void; hint?: string }) {
  return (
    <>
      <div className={s.fieldRow}>
        <label className={s.field}>
          <span className={s.fieldLabel}>Reading &amp; Writing scaled score</span>
          <input
            type="number" min={200} max={800} step={10} placeholder="200–800"
            className={s.input}
            value={meta.rwScaled}
            onChange={(e) => setMeta({ ...meta, rwScaled: e.target.value })}
          />
        </label>
        <label className={s.field}>
          <span className={s.fieldLabel}>Math scaled score</span>
          <input
            type="number" min={200} max={800} step={10} placeholder="200–800"
            className={s.input}
            value={meta.mathScaled}
            onChange={(e) => setMeta({ ...meta, mathScaled: e.target.value })}
          />
        </label>
      </div>
      <p className={s.muted} style={{ marginTop: -4 }}>
        {hint ?? 'Copy these from the score report summary. One section is enough if that’s all you have.'}
      </p>

      <div className={s.fieldRow} style={{ marginTop: 12 }}>
        <label className={s.field}>
          <span className={s.fieldLabel}>
            Your own label <span className={s.muted}>— optional</span>
          </span>
          <input
            type="text" maxLength={40} placeholder="Student A"
            className={s.input}
            value={meta.subjectLabel}
            onChange={(e) => setMeta({ ...meta, subjectLabel: e.target.value })}
          />
        </label>
        <label className={s.field}>
          <span className={s.fieldLabel}>
            Date taken <span className={s.muted}>— optional</span>
          </span>
          <input
            type="date"
            className={s.input}
            value={meta.reportDate}
            onChange={(e) => setMeta({ ...meta, reportDate: e.target.value })}
          />
        </label>
      </div>
      <p className={s.muted} style={{ marginTop: -4 }}>
        The label is only ever shown back to you. Please don&rsquo;t put a real name in it —
        we don&rsquo;t want student names in this data at all.
      </p>
    </>
  );
}

function metaPayload(meta: Meta) {
  return {
    rwScaled: meta.rwScaled ? Number(meta.rwScaled) : null,
    mathScaled: meta.mathScaled ? Number(meta.mathScaled) : null,
    subjectLabel: meta.subjectLabel || null,
    reportDate: meta.reportDate || null,
  };
}

function TestPicker({
  tests, value, onChange,
}: { tests: TestOption[]; value: string; onChange: (id: string) => void }) {
  return (
    <label className={s.field}>
      <span className={s.fieldLabel}>Practice test</span>
      <select className={s.input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Select —</option>
        {tests.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </label>
  );
}

type DoneHandler = (d: { id: string; flags: unknown[]; autoVerified?: boolean }) => void;

// ── Flow A: upload the report ─────────────────────────────────────

function HtmlUploadFlow({ tests, onDone }: { tests: TestOption[]; onDone: DoneHandler }) {
  const [testId, setTestId] = useState('');
  const [html, setHtml] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(file: File | null) {
    setHtml(null); setPreview(null); setError(null);
    if (!file) return;
    setParsing(true);
    try {
      const text = await file.text();
      const res = await fetch('/api/bluebook/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: text }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) {
        setError(payload?.error ?? 'Could not read that file.');
        return;
      }
      setHtml(text);
      setPreview(payload.data);
      if (payload.data.reportDate) {
        setMeta((m) => (m.reportDate ? m : { ...m, reportDate: payload.data.reportDate }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setParsing(false);
    }
  }

  function submit() {
    setError(null);
    if (!testId) return setError('Choose which practice test this report is for.');
    if (!html) return setError('Attach the saved score report first.');

    startTransition(async () => {
      const res = await createHtmlUploadSubmission({
        practiceTestId: testId,
        html,
        meta: metaPayload(meta),
      });
      if (!res.ok) return setError(res.error);
      onDone({
        id: res.data!.submissionId,
        flags: res.data!.validationFlags,
        autoVerified: res.data!.autoVerified,
      });
    });
  }

  return (
    <div className={s.card}>
      <div className={s.sectionLabel}>Upload the score report</div>

      <p className={s.muted} style={{ margin: '8px 0 16px' }}>
        On the College Board My Practice site, open the test and go to the question
        detail view, then save the page as HTML. Upload that file here. We read it on our
        side and keep the original as the record of where the numbers came from.
      </p>

      <TestPicker tests={tests} value={testId} onChange={setTestId} />

      <label className={s.field}>
        <span className={s.fieldLabel}>Saved report file</span>
        <input
          type="file" accept=".htm,.html" className={s.input}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        {parsing && <span className={s.muted}>Reading the report…</span>}
      </label>

      {preview && (
        <div className={s.diffBox} style={{ borderColor: 'var(--border)', background: 'transparent' }}>
          <div className={s.diffHead}>{preview.testName}</div>
          <div className={s.muted}>
            {preview.testDate && `${preview.testDate} · `}
            {preview.questionCount} questions read
          </div>
          <div style={{ marginTop: 6 }}>
            R&amp;W <strong>{preview.correctCounts.rw.total}</strong> correct
            {' '}(M1 {preview.correctCounts.rw.m1} · M2 {preview.correctCounts.rw.m2})
            {' — '}
            Math <strong>{preview.correctCounts.math.total}</strong> correct
            {' '}(M1 {preview.correctCounts.math.m1} · M2 {preview.correctCounts.math.m2})
          </div>
          <p className={s.muted} style={{ marginTop: 8, marginBottom: 0 }}>
            Do those counts match the report in front of you? If not, it may be a
            different test than the one selected above.
          </p>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <ScoreFields meta={meta} setMeta={setMeta} />
      </div>

      {error && <p role="alert" className={s.error}>{error}</p>}

      <div className={s.actions}>
        <Button onClick={submit} disabled={pending || parsing || !html}>
          {pending ? 'Sending…' : 'Send submission'}
        </Button>
      </div>
    </div>
  );
}

// ── Flow B: link an in-app attempt ────────────────────────────────

function AttemptLinkFlow({
  attempts, onDone,
}: { attempts: AttemptOption[]; onDone: DoneHandler }) {
  const [attemptId, setAttemptId] = useState('');
  const [view, setView] = useState<AttemptEntryView | null>(null);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [html, setHtml] = useState<string | null>(null);
  const [check, setCheck] = useState<CrossCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pick(id: string) {
    setAttemptId(id); setView(null); setCheck(null); setHtml(null); setError(null);
    if (!id) return;
    setLoading(true);
    startTransition(async () => {
      const res = await loadAttemptEntryView({ attemptId: id });
      setLoading(false);
      if (!res.ok) return setError(res.error);
      setView(res.data);
    });
  }

  async function onFile(file: File | null) {
    setHtml(null); setCheck(null); setError(null);
    if (!file || !attemptId) return;
    setChecking(true);
    try {
      const text = await file.text();
      const res = await crossCheckAttempt({ attemptId, html: text });
      if (!res.ok) return setError(res.error);
      setHtml(text);
      setCheck(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setChecking(false);
    }
  }

  function submit() {
    setError(null);
    if (!attemptId) return setError('Pick the test attempt this is for.');

    startTransition(async () => {
      const res = await createAttemptLinkedSubmission({
        attemptId,
        meta: metaPayload(meta),
        html: html ?? null,
      });
      if (!res.ok) return setError(res.error);
      onDone({
        id: res.data!.submissionId,
        flags: res.data!.validationFlags,
        autoVerified: res.data!.autoVerified,
      });
    });
  }

  const blockedByDiff = Boolean(check && !check.diff.matches);

  return (
    <div className={s.card}>
      <div className={s.sectionLabel}>Link an in-app test</div>

      <p className={s.muted} style={{ margin: '8px 0 16px' }}>
        We already have every answer this student gave. Pick the attempt, use the list
        below to key those same answers into Bluebook, then come back and enter the
        official scores Bluebook reports.
      </p>

      {attempts.length === 0 ? (
        <p className={s.muted}>
          No completed in-app attempts available to link. Use one of the other routes.
        </p>
      ) : (
        <label className={s.field}>
          <span className={s.fieldLabel}>Test attempt</span>
          <select className={s.input} value={attemptId} onChange={(e) => pick(e.target.value)}>
            <option value="">— Select —</option>
            {attempts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.testName}
                {a.finishedAt ? ` — ${new Date(a.finishedAt).toLocaleDateString()}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      {loading && <p className={s.muted}>Loading the attempt…</p>}

      {view && (
        <>
          <div className={s.cardHeader} style={{ marginTop: 16 }}>
            <div className={s.sectionLabel}>Bluebook entry view</div>
            <span className={s.muted}>
              R&amp;W {view.counts.rw.m1}+{view.counts.rw.m2} correct ·
              {' '}Math {view.counts.math.m1}+{view.counts.math.m2} correct
            </span>
          </div>
          <p className={s.muted} style={{ marginBottom: 12 }}>
            Type these into Bluebook in order. A dash means the question was left blank.
          </p>

          <div className={s.entryView}>
            {view.modules.map((m) => (
              <div key={m.key} className={s.entryModule}>
                <div className={s.entryModuleHead}>{m.label}</div>
                <div className={s.entryRows}>
                  {m.answers.map((a) => (
                    <div key={a.ordinal} className={s.entryRow}>
                      <span className={s.entryOrdinal}>{a.ordinal}</span>
                      {a.response
                        ? <span className={s.entryAnswer}>{a.response}</span>
                        : <span className={s.entryBlank}>—</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <label className={s.field} style={{ marginTop: 16 }}>
            <span className={s.fieldLabel}>
              Bluebook score report <span className={s.muted}>— optional, but it&rsquo;s the proof</span>
            </span>
            <input
              type="file" accept=".htm,.html" className={s.input}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            {checking && <span className={s.muted}>Comparing against the attempt…</span>}
          </label>

          {check && check.diff.matches && (
            <p className={s.ok}>
              Every one of the {check.diff.compared} questions matches. The answers in
              Bluebook are the answers your student gave.
            </p>
          )}

          {blockedByDiff && check && (
            <div className={s.diffBox}>
              <div className={s.diffHead}>
                {check.diff.disagreements.length} question
                {check.diff.disagreements.length === 1 ? '' : 's'} don&rsquo;t match
              </div>
              <p className={s.muted} style={{ marginTop: 0 }}>
                Almost always an answer keyed into Bluebook that isn&rsquo;t the one the
                student picked. Fix those in Bluebook, re-export, and try again — or drop
                the file and submit the scores on their own.
              </p>
              <ul className={s.diffList}>
                {check.diff.disagreements.slice(0, 25).map((d) => (
                  <li key={`${d.module}-${d.ordinal}`}>
                    {MODULE_LABELS[d.module as ModuleKey] ?? d.module}, question {d.ordinal}:
                    {' '}in-app {describeMark(d.attempt)}, report {describeMark(d.report)}
                  </li>
                ))}
                {check.diff.disagreements.length > 25 && (
                  <li className={s.muted}>
                    …and {check.diff.disagreements.length - 25} more
                  </li>
                )}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <ScoreFields
              meta={meta}
              setMeta={setMeta}
              hint="These are the numbers Bluebook reported after you keyed the answers in."
            />
          </div>

          {error && <p role="alert" className={s.error}>{error}</p>}

          <div className={s.actions}>
            <Button onClick={submit} disabled={pending || checking || blockedByDiff}>
              {pending ? 'Sending…' : 'Send submission'}
            </Button>
            {blockedByDiff && (
              <Button
                variant="secondary"
                onClick={() => { setHtml(null); setCheck(null); }}
                disabled={pending}
              >
                Drop the file and send scores only
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function describeMark(value: boolean | null): string {
  if (value === null) return 'no answer recorded';
  return value ? 'correct' : 'incorrect';
}

// ── Flow C: the exception-only grid ───────────────────────────────

interface GridEntry {
  correct: boolean;
  chosen?: string;
}

function ManualGridFlow({
  tests, moduleShapes, onDone,
}: {
  tests: TestOption[];
  moduleShapes: Record<string, ModuleShape>;
  onDone: DoneHandler;
}) {
  const [testId, setTestId] = useState('');
  const [counts, setCounts] = useState<Record<ModuleKey, string>>({
    RW1: '', RW2: '', MATH1: '', MATH2: '',
  });
  const [marks, setMarks] = useState<Record<string, GridEntry>>({});
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shape = testId ? moduleShapes[testId] : undefined;
  const countsEntered = MODULE_KEYS.some((k) => counts[k] !== '');

  function reset(nextTestId: string) {
    setTestId(nextTestId);
    setMarks({});
    setError(null);
  }

  function toggle(key: ModuleKey, ordinal: number) {
    const id = `${key}:${ordinal}`;
    setMarks((prev) => {
      const next = { ...prev };
      if (next[id]?.correct === false) delete next[id];
      else next[id] = { correct: false };
      return next;
    });
  }

  function setChosen(key: ModuleKey, ordinal: number, chosen: string | null) {
    const id = `${key}:${ordinal}`;
    setMarks((prev) => {
      const entry = prev[id];
      if (!entry) return prev;
      const next = { ...prev };
      next[id] = chosen ? { correct: false, chosen } : { correct: false };
      return next;
    });
  }

  function wrongCount(key: ModuleKey): number {
    return Object.keys(marks).filter((id) => id.startsWith(`${key}:`)).length;
  }

  // The checksum: declared correct + flipped wrong must account for the
  // whole module. Until they do, the vector and the counts describe
  // different tests — the DB trigger says the same thing, less kindly.
  function moduleStatus(key: ModuleKey): { total: number; declared: number | null; marked: number; ok: boolean } {
    const total = shape?.[key].length ?? 0;
    const declared = counts[key] === '' ? null : Number(counts[key]);
    const marked = wrongCount(key);
    const ok = declared != null && total > 0 && declared + marked === total;
    return { total, declared, marked, ok };
  }

  const activeModules = MODULE_KEYS.filter((k) => (shape?.[k].length ?? 0) > 0 && counts[k] !== '');
  const allModulesBalance = activeModules.length > 0 && activeModules.every((k) => moduleStatus(k).ok);

  function submit() {
    setError(null);
    if (!testId) return setError('Choose which practice test this is.');
    if (!allModulesBalance) {
      return setError('Every module you entered a count for needs its wrong answers marked first.');
    }

    // Build the full vector: everything correct except what was flipped.
    const responses: Record<string, Record<string, GridEntry>> = {};
    for (const key of activeModules) {
      const bucket: Record<string, GridEntry> = {};
      for (const ordinal of shape?.[key] ?? []) {
        bucket[String(ordinal)] = marks[`${key}:${ordinal}`] ?? { correct: true };
      }
      responses[key] = bucket;
    }

    startTransition(async () => {
      const res = await createManualGridSubmission({
        practiceTestId: testId,
        responses,
        counts: {
          rwM1: counts.RW1 === '' ? null : Number(counts.RW1),
          rwM2: counts.RW2 === '' ? null : Number(counts.RW2),
          mathM1: counts.MATH1 === '' ? null : Number(counts.MATH1),
          mathM2: counts.MATH2 === '' ? null : Number(counts.MATH2),
        },
        meta: metaPayload(meta),
      });
      if (!res.ok) return setError(res.error);
      onDone({ id: res.data!.submissionId, flags: res.data!.validationFlags });
    });
  }

  return (
    <div className={s.card}>
      <div className={s.sectionLabel}>Mark the wrong ones</div>

      <p className={s.muted} style={{ margin: '8px 0 16px' }}>
        Enter the number correct for each module from the score report summary first —
        that&rsquo;s the check that catches a slip. Then flip the questions that were
        missed. Everything starts marked correct.
      </p>

      <TestPicker tests={tests} value={testId} onChange={reset} />

      {testId && !shape && (
        <p className={s.muted}>
          We don&rsquo;t have the question list for that test, so the grid can&rsquo;t be
          built. Try the report upload instead.
        </p>
      )}

      {shape && (
        <>
          <div className={s.fieldRow}>
            {MODULE_KEYS.filter((k) => shape[k].length > 0).map((key) => (
              <label key={key} className={s.field}>
                <span className={s.fieldLabel}>{MODULE_LABELS[key]} — correct</span>
                <input
                  type="number" min={0} max={shape[key].length} className={s.input}
                  placeholder={`0–${shape[key].length}`}
                  value={counts[key]}
                  onChange={(e) => setCounts({ ...counts, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>

          {!countsEntered && (
            <p className={s.muted}>Enter at least one module&rsquo;s count to open its grid.</p>
          )}

          {MODULE_KEYS.filter((k) => shape[k].length > 0 && counts[k] !== '').map((key) => {
            const status = moduleStatus(key);
            return (
              <div key={key} className={s.gridModule}>
                <div className={s.gridHead}>
                  <strong>{MODULE_LABELS[key]}</strong>
                  <span className={s.gridCounter}>
                    <span className={status.ok ? s.gridCounterOk : s.gridCounterOff}>
                      {status.marked} marked wrong
                    </span>
                    {' of '}
                    {status.declared != null ? status.total - status.declared : '—'}
                    {' expected'}
                  </span>
                </div>
                <div className={s.gridCells}>
                  {(shape[key] ?? []).map((ordinal) => (
                    <GridCell
                      key={ordinal}
                      ordinal={ordinal}
                      entry={marks[`${key}:${ordinal}`]}
                      onToggle={() => toggle(key, ordinal)}
                      onChoose={(chosen) => setChosen(key, ordinal, chosen)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 16 }}>
            <ScoreFields meta={meta} setMeta={setMeta} />
          </div>

          {error && <p role="alert" className={s.error}>{error}</p>}

          <div className={s.actions}>
            <Button onClick={submit} disabled={pending || !allModulesBalance}>
              {pending ? 'Sending…' : 'Send submission'}
            </Button>
            {!allModulesBalance && countsEntered && (
              <span className={s.muted}>
                Marked answers still need to add up to the counts above.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const CHOICES = ['A', 'B', 'C', 'D', 'omitted'] as const;

function GridCell({
  ordinal, entry, onToggle, onChoose,
}: {
  ordinal: number;
  entry: GridEntry | undefined;
  onToggle: () => void;
  onChoose: (chosen: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrong = entry?.correct === false;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className={`${s.cell} ${wrong ? s.cellWrong : ''}`}
        aria-pressed={wrong}
        aria-label={`Question ${ordinal}: ${wrong ? 'incorrect' : 'correct'}`}
        onClick={() => {
          onToggle();
          // Offer the distractor prompt on the way in only. It is
          // genuinely optional — the whole flow has to stay fast enough
          // that people finish it.
          setOpen(!wrong);
        }}
      >
        {ordinal}
        {entry?.chosen && <span className={s.cellChosen}>{entry.chosen}</span>}
      </button>

      {open && wrong && (
        <div className={s.popover} role="group" aria-label={`What did they pick for question ${ordinal}?`}>
          {CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              className={s.popoverBtn}
              onClick={() => { onChoose(c); setOpen(false); }}
            >
              {c === 'omitted' ? '—' : c}
            </button>
          ))}
          <button type="button" className={s.popoverBtn} onClick={() => setOpen(false)}>
            skip
          </button>
        </div>
      )}
    </div>
  );
}
