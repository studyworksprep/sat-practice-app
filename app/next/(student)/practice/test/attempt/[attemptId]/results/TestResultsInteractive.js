// Practice-test results client island. Server-rendered data
// arrives as props; this file handles:
//   - selected-question state for the per-question review pane
//   - reveal set per question (gold dots on the map)
//   - PDF export trigger (dynamic-imports the generator)
//   - floating Desmos toggle on math questions
//
// Stacks into a long scroll page — the report is meant to be
// readable top-to-bottom. Per-question review sits at the end
// with its own map grid so students can jump around.

'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { recalculateScore } from '@/lib/practice-test/score-actions';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { FloatingCalculator } from '@/lib/ui/FloatingCalculator';
import { ConceptTags } from '@/lib/practice/ConceptTags';
import { DesmosSavedStateButton } from '@/lib/practice/DesmosSavedStateButton';
import { FlashcardsButton } from '@/lib/practice/FlashcardsButton';
import { QuestionNotes } from '@/lib/practice/QuestionNotes';
import { SkillBreakdownCard } from '@/lib/practice/SkillBreakdownCard';
import { formatDuration } from '@/lib/practice/format-duration';
import { QuestionMapGrid } from '@/lib/practice/QuestionMapGrid';
import { BookmarkIcon, CorrectIcon, IncorrectIcon, NotesIcon, TimeSpentIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import s from './TestResults.module.css';

const SUBJECT_NAME = { RW: 'Reading & Writing', MATH: 'Math' };

export function TestResultsInteractive({
  attemptId,
  practiceTestId = null,
  testName,
  testCode,
  status,
  startedAt,
  finishedAt,
  composite,
  sections,
  domains,
  opportunity,
  timing,
  reviewItems,
  pdfData,
  viewerRole = 'student',
  desmosCanSave = false,
  conceptTagsCatalog = null,
  conceptTagsCanTag = false,
  conceptTagsCanDelete = false,
  questionNotesCanView = false,
  questionNotesIsAdmin = false,
  currentUserId = null,
}) {
  const [selectedOrdinal, setSelectedOrdinal] = useState(
    reviewItems.find((r) => !r.missing)?.ordinal ?? reviewItems[0]?.ordinal ?? 1,
  );
  const [revealed, setRevealed] = useState(() => new Set());
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  // Tutor-only "Recalculate Score" affordance. The dialog lets a
  // teacher / manager / admin override the runner-computed scaled
  // scores with whatever Bluebook actually reported, and folds the
  // (m1, m2 → scaled) mapping back into score_conversion so future
  // attempts of the same test hit the lookup. Hidden for students.
  const canRecalculate =
    viewerRole === 'teacher' || viewerRole === 'manager' || viewerRole === 'admin';
  const [showScoreDialog, setShowScoreDialog] = useState(false);
  const router = useRouter();

  // Group items by module once. Items in groups carry a
  // moduleOrdinal field (1..N within their module) for the
  // question-map labels and the per-question detail header. The
  // global `ordinal` stays the source of truth for selection
  // state so URL/back-button behavior is unchanged.
  const moduleGroups = useMemo(() => groupItemsByModule(reviewItems), [reviewItems]);
  const groupedItems = useMemo(
    () => moduleGroups.flatMap((g) => g.items),
    [moduleGroups],
  );

  const selected = groupedItems.find((r) => r.ordinal === selectedOrdinal) ?? groupedItems[0];
  const isRevealed = revealed.has(selected?.ordinal);

  // Live calc handle for the saved-state button. The
  // FloatingCalculator below renders a single panel for the whole
  // results view, so the same ref serves every selected question.
  const calcRef = useRef(null);
  const isMathItem = selected?.subject === 'MATH';

  function reveal(ordinal) {
    setRevealed((prev) => {
      if (prev.has(ordinal)) return prev;
      const next = new Set(prev);
      next.add(ordinal);
      return next;
    });
  }

  async function handleExportPdf() {
    if (exportingPdf) return;
    setExportingPdf(true);
    setPdfError(null);
    try {
      const { generateScoreReportPdf } = await import('@/lib/generateScoreReportPdf');
      const doc = generateScoreReportPdf(pdfData);
      const safe = (pdfData.test_name || 'Practice-Test').replace(/[^a-zA-Z0-9]+/g, '-');
      doc.save(`${safe}-Score-Report.pdf`);
    } catch (err) {
      setPdfError(err?.message ?? String(err));
    } finally {
      setExportingPdf(false);
    }
  }

  // Normalize the test-side {domain_name, skill_name} shape to the
  // shared SkillBreakdownCard's {name, skills:[{name}]} shape, and
  // mark each skill as priority if it sits in the top-N rows of the
  // opportunity index (matched by skill_code, falling back to name).
  // Folds opportunity into the breakdown so we don't render the same
  // signal twice.
  const PRIORITY_TOP_N = 3;
  const priorityKeys = new Set(
    (opportunity ?? [])
      .slice(0, PRIORITY_TOP_N)
      .map((r) => r.skill_code ?? r.skill_name)
      .filter(Boolean),
  );
  const domainsRw = domains
    .filter((d) => d.subject_code === 'RW')
    .map((d) => normalizeDomain(d, priorityKeys));
  const domainsMath = domains
    .filter((d) => d.subject_code === 'MATH')
    .map((d) => normalizeDomain(d, priorityKeys));

  return (
    <main className={s.container}>
      {/* ---------- Header + PDF ---------- */}
      <header className={s.header}>
        <div>
          <div className={s.eyebrow}>Score report</div>
          <h1 className={s.h1}>{testName}</h1>
          <div className={s.sub}>
            {testCode && <span className={s.testCode}>{testCode}</span>}
            {testCode && ' · '}
            {finishedAt
              ? new Date(finishedAt).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'long', day: 'numeric',
                })
              : '—'}
            {status === 'abandoned' && <span className={s.abandonedTag}> · Abandoned</span>}
          </div>
        </div>
        <div className={s.headerActions}>
          <button
            type="button"
            className={s.pdfBtn}
            onClick={handleExportPdf}
            disabled={exportingPdf}
          >
            {exportingPdf ? 'Building PDF…' : '⇩ Export PDF'}
          </button>
          {canRecalculate && (
            <button
              type="button"
              className={s.recalcBtn}
              onClick={() => setShowScoreDialog(true)}
            >
              Recalculate score
            </button>
          )}
        </div>
      </header>

      {pdfError && <p role="alert" className={s.pdfError}>{pdfError}</p>}

      {/* ---------- Composite + section scores ---------- */}
      <section className={s.compositeCard}>
        <div className={s.compositeLabel}>Composite score</div>
        <div className={s.compositeValue}>{composite ?? '—'}</div>
        <div className={s.compositeMax}> / 1600</div>
      </section>

      <section className={s.sectionScoreRow}>
        <SectionTile
          label="Reading & Writing"
          tone="rw"
          scaled={sections.RW?.scaled}
          correct={sections.RW?.correct}
          total={sections.RW?.total}
        />
        <SectionTile
          label="Math"
          tone="math"
          scaled={sections.MATH?.scaled}
          correct={sections.MATH?.correct}
          total={sections.MATH?.total}
        />
      </section>

      {/* ---------- Domain / skill breakdown ----------
          Stacked-skill bars per domain. Skill segments size by
          question count, color by accuracy bucket; the top
          opportunity-index skills carry a 🎯 marker. The card's
          Top Opportunities strip below the bars surfaces the
          OI score + learnability + accuracy for new tutors who
          need the "where do I focus" pointer spelled out. */}
      {(domainsRw.length > 0 || domainsMath.length > 0) && (
        <section className={s.cardRow}>
          <SkillBreakdownCard
            title="Reading & Writing"
            tone="rw"
            domains={domainsRw}
            opportunities={(opportunity ?? []).filter((o) => o.subject_code === 'RW')}
          />
          <SkillBreakdownCard
            title="Math"
            tone="math"
            domains={domainsMath}
            opportunities={(opportunity ?? []).filter((o) => o.subject_code === 'MATH')}
          />
        </section>
      )}

      {/* ---------- Timing overview ---------- */}
      {timing.anyTimed && (
        <section className={s.card}>
          <div className={s.cardHeader}>
            <div className={s.sectionLabel}>
              <IconTile icon={TimeSpentIcon} palette="cyan" size="sm" />
              Timing
            </div>
            <div className={s.cardHeaderHint}>
              Each module bar shows your time per question — segment
              widths are proportional to time spent, colored by
              result. Hover a segment for the question, click to jump
              to it below.
            </div>
          </div>

          {/* Top stat row: total + per-section averages. */}
          <div className={s.timingStatsRow}>
            <TimingStat
              label="Total time"
              value={formatDuration(timing.totalWallMs || timing.totalAnswerMs)}
              subtitle={timing.totalWallMs > 0 ? 'across both sections' : null}
            />
            <TimingStat
              label="RW avg per question"
              value={formatDuration(timing.bySubject.RW.avgMs)}
              subtitle={timing.bySubject.RW.count > 0
                ? `${timing.bySubject.RW.count} answered`
                : 'no data'}
              tone="rw"
            />
            <TimingStat
              label="Math avg per question"
              value={formatDuration(timing.bySubject.MATH.avgMs)}
              subtitle={timing.bySubject.MATH.count > 0
                ? `${timing.bySubject.MATH.count} answered`
                : 'no data'}
              tone="math"
            />
          </div>

          {/* Module-by-module timing. Each module's bar is segmented
              by question — segment width is proportional to the time
              the student spent on that question, colored by status,
              with hover tooltips. The bar's outer width represents
              wall-clock usage vs the module's allotted time, so two
              signals coexist: pacing within the module (segments) and
              pacing against the SAT clock (bar fill).
              Imported attempts (Bluebook) without per-module wall
              times are still drawn; they just lose the % vs allotted
              context and scale relative to the slowest module. */}
          {(() => {
            const usable = timing.byModule.filter((m) => m.usedMs != null);
            if (usable.length === 0) return null;
            const maxUsedMs = Math.max(...usable.map((m) => m.usedMs));
            return (
              <div className={s.moduleTimingList}>
                {usable.map((m, i) => {
                  const groupKey = `${m.subject}__${m.moduleNumber}`;
                  const group = moduleGroups.find((g) => g.key === groupKey);
                  return (
                    <ModuleTimingRow
                      key={i}
                      entry={m}
                      items={group?.items ?? []}
                      maxUsedMs={maxUsedMs}
                      onSelectOrdinal={setSelectedOrdinal}
                    />
                  );
                })}
                <div className={s.modTimingLegend}>
                  <span><span className={`${s.modTimingLegDot} ${s.modTimingSegCorrect}`} /> Correct</span>
                  <span><span className={`${s.modTimingLegDot} ${s.modTimingSegWrong}`} /> Incorrect</span>
                  <span><span className={`${s.modTimingLegDot} ${s.modTimingSegSkipped}`} /> Skipped</span>
                </div>
              </div>
            );
          })()}

          {/* Existing slowest-5 lists */}
          <div className={s.timingGrid}>
            <TimingTile
              label="RW · slowest 5"
              rows={timing.slowestRw}
              onJump={setSelectedOrdinal}
            />
            <TimingTile
              label="Math · slowest 5"
              rows={timing.slowestMath}
              onJump={setSelectedOrdinal}
            />
          </div>

          {/* Optional: by-score-band breakdown if we have enough data. */}
          {timing.byScoreBand.length > 0 && timing.byScoreBand.some((d) => d.count >= 2) && (
            <div className={s.diffTimingRow}>
              {timing.byScoreBand.map((d) => (
                <ScoreBandTimingTile key={d.scoreBand} entry={d} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Per-question review: map on the left, detail on the right
          on wide screens; stacks on narrow. The map column sticks
          to the top of the viewport so it stays reachable as the
          student scrolls through long rationales. */}
      <div className={s.reviewLayout}>
        <section className={`${s.card} ${s.reviewMapCard}`}>
          <div className={s.cardHeader}>
            <div className={s.sectionLabel}>
              <IconTile icon={NotesIcon} palette="navy" size="sm" />
              Per-question review
            </div>
            <div className={s.cardHeaderHint}>
              Click any question to review it. Your initial answer
              is shown; reveal the correct answer + rationale when
              you&apos;re ready.
            </div>
          </div>

          <QuestionMapGrid
            groups={moduleGroups.map((group) => ({
              key: group.key,
              label: (
                <>
                  <span className={s.mapModuleSubject}>
                    {SUBJECT_NAME[group.subject] ?? group.subject}
                  </span>
                  <span className={s.mapModuleDot}>·</span>
                  <span className={s.mapModuleNumber}>
                    Module {group.moduleNumber}
                  </span>
                </>
              ),
              countNote: `${group.correct}/${group.total}`,
              items: group.items.map((it) => ({
                id: it.ordinal,
                ordinalLabel: it.moduleOrdinal,
                status: it.status,
                difficulty: it.taxonomy?.difficulty ?? null,
                marked: !!it.marked,
                missing: it.missing,
                ariaLabel: `Question ${it.moduleOrdinal}, ${it.status}`,
              })),
            }))}
            selectedId={selected?.ordinal}
            onSelect={setSelectedOrdinal}
            revealed={revealed}
          />
        </section>

      {selected && (
        <section className={s.questionCard}>
          <div className={s.questionHeader}>
            <div className={s.questionHeaderLeft}>
              <span className={s.questionNum}>
                Question {selected.moduleOrdinal ?? selected.ordinal}
              </span>
              {selected.externalId && (
                <span className={s.questionCode}>{selected.externalId}</span>
              )}
              <span className={s.questionMeta}>
                {SUBJECT_NAME[selected.subject] ?? selected.subject}
                {` · Module ${selected.moduleNumber}`}
                {selected.taxonomy?.domain_name && ` · ${selected.taxonomy.domain_name}`}
                {selected.taxonomy?.skill_name && ` · ${selected.taxonomy.skill_name}`}
                {selected.taxonomy?.score_band != null &&
                  ` · Band ${selected.taxonomy.score_band}`}
                {selected.studentAnswer?.timeSpentMs != null &&
                  ` · ${formatDuration(selected.studentAnswer.timeSpentMs)}`}
              </span>
            </div>
            <div className={s.questionHeaderRight}>
              {isMathItem && (
                <FloatingCalculator
                  storageKey={`desmos:review:test:${attemptId}`}
                  onCalcReady={(c) => { calcRef.current = c; }}
                />
              )}
              {isMathItem && (desmosCanSave || selected?.desmosSavedState != null) && (
                <DesmosSavedStateButton
                  key={`desmos-${selected.questionId}`}
                  questionId={selected.questionId}
                  initialSavedState={selected.desmosSavedState ?? null}
                  canSave={desmosCanSave}
                  calcRef={calcRef}
                />
              )}
              {questionNotesCanView && !selected.missing && (
                <QuestionNotes
                  key={`notes-${selected.questionId}`}
                  questionId={selected.questionId}
                  initialNotes={selected.questionNotes ?? []}
                  isAdmin={questionNotesIsAdmin}
                  currentUserId={currentUserId}
                  canView={questionNotesCanView}
                />
              )}
              <FlashcardsButton />
              {!isRevealed && !selected.missing && (
                <button
                  type="button"
                  className={s.revealBtn}
                  onClick={() => reveal(selected.ordinal)}
                >
                  Reveal answer &amp; rationale
                </button>
              )}
              {isRevealed && selected.studentAnswer && (
                <span
                  className={selected.studentAnswer.isCorrect
                    ? s.resultBadgeCorrect
                    : s.resultBadgeWrong}
                >
                  {selected.studentAnswer.isCorrect ? 'Correct' : 'Incorrect'}
                </span>
              )}
            </div>
          </div>

          {selected.missing ? (
            <p className={s.missingNote}>
              This question is no longer available in the question bank.
            </p>
          ) : (
            <QuestionRenderer
              key={`rev-${selected.ordinal}-${isRevealed ? 'r' : 'q'}`}
              mode="review"
              layout={selected.layout ?? 'single'}
              question={selected}
              selectedOptionId={selected.studentAnswer?.selectedOptionId ?? null}
              responseText={selected.studentAnswer?.responseText ?? ''}
              result={isRevealed ? {
                isCorrect: selected.studentAnswer?.isCorrect ?? null,
                correctOptionId: selected.reveal.correctOptionId,
                correctAnswerDisplay: selected.reveal.correctAnswerDisplay,
                rationaleHtml: selected.reveal.rationaleHtml,
              } : null}
              controlsNode={
                conceptTagsCanTag && conceptTagsCatalog ? (
                  <div className={s.tutorTools}>
                    <ConceptTags
                      key={`tags-${selected.questionId}`}
                      questionId={selected.questionId}
                      initialTags={conceptTagsCatalog}
                      initialQuestionTagIds={selected.conceptTagIds ?? []}
                      canTag={conceptTagsCanTag}
                      canDelete={conceptTagsCanDelete}
                    />
                  </div>
                ) : null
              }
            />
          )}
        </section>
      )}
      </div>

      <div className={s.footer}>
        <Link href="/review" className={s.footerLink}>← All practice</Link>
        <Link href="/practice/start" className={s.footerLinkPrimary}>
          Start another →
        </Link>
      </div>

      {showScoreDialog && (
        <RecalculateScoreDialog
          attemptId={attemptId}
          practiceTestId={practiceTestId}
          sections={sections}
          onClose={() => setShowScoreDialog(false)}
          onSaved={() => {
            setShowScoreDialog(false);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function RecalculateScoreDialog({
  attemptId,
  practiceTestId,
  sections,
  onClose,
  onSaved,
}) {
  // Seed inputs from the existing attempt + per-module counts. The
  // tutor will typically only need to type the corrected scaled
  // scores; the m1/m2 counts come straight from the runner unless
  // they need correcting too.
  const [form, setForm] = useState(() => ({
    rwScaled:      sections.RW?.scaled != null ? String(sections.RW.scaled) : '',
    mathScaled:    sections.MATH?.scaled != null ? String(sections.MATH.scaled) : '',
    rwM1Correct:   String(sections.RW?.m1Correct ?? 0),
    rwM2Correct:   String(sections.RW?.m2Correct ?? 0),
    mathM1Correct: String(sections.MATH?.m1Correct ?? 0),
    mathM2Correct: String(sections.MATH?.m2Correct ?? 0),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const rwScaledNum = parseInt(form.rwScaled, 10);
  const mathScaledNum = parseInt(form.mathScaled, 10);
  const previewComposite =
    Number.isFinite(rwScaledNum) && Number.isFinite(mathScaledNum)
      ? rwScaledNum + mathScaledNum
      : null;

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await recalculateScore({
        attemptId,
        practiceTestId,
        rwScaled: parseInt(form.rwScaled, 10),
        mathScaled: parseInt(form.mathScaled, 10),
        rwM1Correct: parseInt(form.rwM1Correct, 10) || 0,
        rwM2Correct: parseInt(form.rwM2Correct, 10) || 0,
        mathM1Correct: parseInt(form.mathM1Correct, 10) || 0,
        mathM2Correct: parseInt(form.mathM2Correct, 10) || 0,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.dialogBackdrop} onClick={onClose}>
      <div
        className={s.dialogCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recalc-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.dialogHead}>
          <h2 id="recalc-title" className={s.dialogTitle}>Recalculate score</h2>
          <button type="button" className={s.dialogClose} onClick={onClose}>
            ×
          </button>
        </div>
        <p className={s.dialogIntro}>
          Enter the corrected scaled scores from Bluebook plus the
          per-module correct counts that produced them. The new
          scaled scores overwrite this attempt&apos;s result and the
          (m1, m2 → scaled) mapping is saved to the lookup table for
          future attempts of the same test.
        </p>
        <form onSubmit={handleSubmit} className={s.dialogForm}>
          <fieldset className={s.dialogSection}>
            <legend className={s.dialogLegend}>Reading &amp; Writing</legend>
            <label className={s.dialogField}>
              <span>Scaled (200–800)</span>
              <input
                type="number" min={200} max={800} step={10}
                value={form.rwScaled}
                onChange={(e) => update('rwScaled', e.target.value)}
                required
              />
            </label>
            <label className={s.dialogField}>
              <span>Module 1 correct</span>
              <input
                type="number" min={0}
                value={form.rwM1Correct}
                onChange={(e) => update('rwM1Correct', e.target.value)}
                required
              />
            </label>
            <label className={s.dialogField}>
              <span>Module 2 correct</span>
              <input
                type="number" min={0}
                value={form.rwM2Correct}
                onChange={(e) => update('rwM2Correct', e.target.value)}
                required
              />
            </label>
          </fieldset>
          <fieldset className={s.dialogSection}>
            <legend className={s.dialogLegend}>Math</legend>
            <label className={s.dialogField}>
              <span>Scaled (200–800)</span>
              <input
                type="number" min={200} max={800} step={10}
                value={form.mathScaled}
                onChange={(e) => update('mathScaled', e.target.value)}
                required
              />
            </label>
            <label className={s.dialogField}>
              <span>Module 1 correct</span>
              <input
                type="number" min={0}
                value={form.mathM1Correct}
                onChange={(e) => update('mathM1Correct', e.target.value)}
                required
              />
            </label>
            <label className={s.dialogField}>
              <span>Module 2 correct</span>
              <input
                type="number" min={0}
                value={form.mathM2Correct}
                onChange={(e) => update('mathM2Correct', e.target.value)}
                required
              />
            </label>
          </fieldset>
          {previewComposite != null && (
            <div className={s.dialogComposite}>
              Composite: <strong>{previewComposite}</strong>
            </div>
          )}
          {error && <p role="alert" className={s.dialogError}>{error}</p>}
          <div className={s.dialogActions}>
            <button type="button" className={s.dialogCancel} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={s.dialogSubmit} disabled={saving}>
              {saving ? 'Saving…' : 'Save score'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────

function SectionTile({ label, tone, scaled, correct, total }) {
  const cls = tone === 'rw' ? s.sectionTileRw : s.sectionTileMath;
  return (
    <div className={`${s.sectionTile} ${cls}`}>
      <div className={s.sectionTileLabel}>{label}</div>
      <div className={s.sectionTileScaled}>
        {scaled ?? '—'}
        <span className={s.sectionTileMax}> / 800</span>
      </div>
      <div className={s.sectionTileRaw}>
        {correct ?? 0} correct
        {total > 0 && <span className={s.sectionTileOver}> / {total}</span>}
      </div>
    </div>
  );
}

function normalizeDomain(d, priorityKeys = null) {
  return {
    name: d.domain_name,
    correct: d.correct ?? 0,
    total: d.total ?? 0,
    skills: (d.skills ?? []).map((sk) => ({
      name: sk.skill_name,
      correct: sk.correct ?? 0,
      total: sk.total ?? 0,
      isPriority: priorityKeys
        ? priorityKeys.has(sk.skill_code) || priorityKeys.has(sk.skill_name)
        : false,
    })),
  };
}

function TimingTile({ label, value, rows, onJump }) {
  return (
    <div className={s.timingTile}>
      <div className={s.timingTileLabel}>{label}</div>
      {value && <div className={s.timingTileValue}>{value}</div>}
      {rows && rows.length > 0 && (
        <ul className={s.timingList}>
          {rows.map((r) => (
            <li key={r.ordinal} className={s.timingItem}>
              <button
                type="button"
                className={s.timingItemBtn}
                onClick={() => onJump?.(r.ordinal)}
              >
                <span className={s.timingItemOrdinal}>
                  {r.moduleNumber != null ? `M${r.moduleNumber} · ` : ''}
                  Q{r.modulePosition ?? r.ordinal}
                </span>
                <span className={s.timingItemMs}>{formatDuration(r.ms)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length === 0 && (
        <div className={s.timingEmpty}>No timing data</div>
      )}
    </div>
  );
}

function TimingStat({ label, value, subtitle, tone }) {
  const cls = [
    s.timingStat,
    tone === 'rw'   ? s.timingStatRw   : null,
    tone === 'math' ? s.timingStatMath : null,
  ].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className={s.timingStatLabel}>{label}</div>
      <div className={s.timingStatValue}>{value}</div>
      {subtitle && <div className={s.timingStatSub}>{subtitle}</div>}
    </div>
  );
}

const SUBJECT_FULL = { RW: 'Reading & Writing', MATH: 'Math' };

function ModuleTimingRow({ entry, items, maxUsedMs, onSelectOrdinal }) {
  // Two scaling modes for the bar's outer width:
  //  - When the module's allotted time is known, the bar fills
  //    relative to that (e.g., 84% used). Tight (>= 90%) gets a
  //    warning tint on the % readout.
  //  - When it isn't (imported attempts where we never recorded
  //    the SAT time-limit alongside the per-module rows), scale
  //    against the maximum usedMs in the visible set so the bars
  //    still convey relative pacing across modules.
  // Within the bar, segments map 1:1 to questions. Each segment's
  // width is proportional to its time_spent_ms over the module's
  // summed answer time. Sum-of-segments equals the bar's outer
  // width; the empty space to the right represents the remaining
  // allotted time the student didn't use.
  const pctVsAllotted = entry.usedMs != null && entry.allottedMs > 0
    ? Math.min(100, Math.round((entry.usedMs / entry.allottedMs) * 100))
    : null;
  const pctRelative = entry.usedMs != null && maxUsedMs > 0
    ? Math.min(100, Math.round((entry.usedMs / maxUsedMs) * 100))
    : null;
  const fillPct = pctVsAllotted ?? pctRelative;
  const tight = pctVsAllotted != null && pctVsAllotted >= 90;

  const timedItems = (items ?? []).filter(
    (it) => !it.missing && (it.studentAnswer?.timeSpentMs ?? 0) > 0,
  );
  const summedSegMs = timedItems.reduce(
    (sum, it) => sum + (it.studentAnswer?.timeSpentMs || 0),
    0,
  );
  const hasSegments = summedSegMs > 0;

  const pctCls = [
    s.modTimingPct,
    tight ? s.modTimingPctTight : null,
  ].filter(Boolean).join(' ');

  return (
    <div className={s.modTimingRow}>
      <div className={s.modTimingLabel}>
        <span className={s.modTimingName}>
          {SUBJECT_FULL[entry.subject] ?? entry.subject} · Module {entry.moduleNumber}
        </span>
        <span className={s.modTimingMeta}>
          {entry.usedMs != null
            ? `${formatDuration(entry.usedMs)} used`
            : 'not finished'}
          {entry.allottedMs != null && ` of ${formatDuration(entry.allottedMs)}`}
        </span>
      </div>
      <div className={s.modTimingBar}>
        {hasSegments ? (
          <div
            className={s.modTimingSegRow}
            style={{ width: fillPct != null ? `${fillPct}%` : '100%' }}
          >
            {timedItems.map((it) => {
              const ms = it.studentAnswer.timeSpentMs;
              const widthPct = (ms / summedSegMs) * 100;
              if (widthPct < 0.3) return null;
              const tone =
                it.status === 'correct'
                  ? s.modTimingSegCorrect
                  : it.status === 'incorrect'
                    ? s.modTimingSegWrong
                    : s.modTimingSegSkipped;
              const statusLabel =
                it.status === 'correct'
                  ? 'Correct'
                  : it.status === 'incorrect'
                    ? 'Incorrect'
                    : 'Skipped';
              const ordinalForLabel = it.moduleOrdinal ?? it.ordinal;
              return (
                <button
                  key={it.ordinal}
                  type="button"
                  className={`${s.modTimingSeg} ${tone}`}
                  style={{ width: `${widthPct}%` }}
                  onClick={() => onSelectOrdinal?.(it.ordinal)}
                  aria-label={`Question ${ordinalForLabel}, ${formatDuration(ms)}, ${statusLabel}`}
                >
                  <span className={s.modTimingTooltip} role="tooltip">
                    <strong>
                      Q{ordinalForLabel} · {formatDuration(ms)}
                    </strong>
                    {it.taxonomy?.score_band != null && (
                      <span>
                        Band {it.taxonomy.score_band}
                      </span>
                    )}
                    {it.taxonomy?.domain_name && (
                      <span className={s.modTimingTooltipDim}>
                        {it.taxonomy.domain_name}
                      </span>
                    )}
                    {it.taxonomy?.skill_name &&
                      it.taxonomy.skill_name !== it.taxonomy.domain_name && (
                        <span className={s.modTimingTooltipDim}>
                          {it.taxonomy.skill_name}
                        </span>
                      )}
                    <span
                      className={
                        it.status === 'correct'
                          ? s.modTimingTooltipCorrect
                          : it.status === 'incorrect'
                            ? s.modTimingTooltipWrong
                            : s.modTimingTooltipSkipped
                      }
                    >
                      {statusLabel}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          fillPct != null && (
            <div
              className={`${s.modTimingFill} ${tight ? s.modTimingFillTight : ''}`}
              style={{ width: `${fillPct}%` }}
            />
          )
        )}
      </div>
      <div className={pctCls}>
        {pctVsAllotted != null
          ? `${pctVsAllotted}%`
          : entry.usedMs != null
            ? formatDuration(entry.usedMs)
            : '—'}
      </div>
    </div>
  );
}

// Score bands run 1–7. Color buckets per spec: 1–3 green (easy),
// 4–5 yellow (medium), 6–7 red (hard). The "Band {n}" label
// disambiguates within each bucket.
const BAND_TONE = {
  1: 'diffEasy', 2: 'diffEasy', 3: 'diffEasy',
  4: 'diffMed', 5: 'diffMed',
  6: 'diffHard', 7: 'diffHard',
};

function ScoreBandTimingTile({ entry }) {
  const toneCls = BAND_TONE[entry.scoreBand];
  const cls = [s.diffTimingTile, toneCls ? s[toneCls] : null].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className={s.diffTimingLabel}>
        Band {entry.scoreBand}
      </div>
      <div className={s.diffTimingValue}>{formatDuration(entry.avgMs)}</div>
      <div className={s.diffTimingSub}>
        avg · {entry.count} q{entry.count === 1 ? '' : 's'}
      </div>
    </div>
  );
}

// Group reviewItems by (subject, module) preserving the test
// order they arrive in. Each group also carries the running
// correct/total tally so the module label can show "5/22"
// next to it. Items inside the group also get a per-module
// ordinal — running 1..N within the module — so the question
// map's button labels reset for each module instead of running
// 1..98 across the whole test.
function groupItemsByModule(items) {
  const groups = [];
  const byKey = new Map();
  for (const it of items) {
    const key = `${it.subject}__${it.moduleNumber}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        subject: it.subject,
        moduleNumber: it.moduleNumber,
        items: [],
        correct: 0,
        total: 0,
      };
      byKey.set(key, group);
      groups.push(group);
    }
    const moduleOrdinal = group.items.length + 1;
    group.items.push({ ...it, moduleOrdinal });
    if (!it.missing) {
      group.total += 1;
      if (it.studentAnswer?.isCorrect) group.correct += 1;
    }
  }
  return groups;
}

// formatDuration imported from @/lib/practice/format-duration —
// shared with the assignment report and any other report-style
// surface so durations format consistently.
