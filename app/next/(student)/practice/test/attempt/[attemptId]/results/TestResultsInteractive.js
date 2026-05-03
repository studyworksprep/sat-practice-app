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
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { FloatingCalculator } from '@/lib/ui/FloatingCalculator';
import { ConceptTags } from '@/lib/practice/ConceptTags';
import { DesmosSavedStateButton } from '@/lib/practice/DesmosSavedStateButton';
import { FlashcardsButton } from '@/lib/practice/FlashcardsButton';
import { QuestionNotes } from '@/lib/practice/QuestionNotes';
import { StudentQuestionNotes } from '@/lib/practice/StudentQuestionNotes';
import { DomainBreakdownCard } from '@/lib/practice/DomainBreakdownCard';
import { formatDuration } from '@/lib/practice/format-duration';
import { QuestionMapGrid } from '@/lib/practice/QuestionMapGrid';
import { BookmarkIcon, CorrectIcon, IncorrectIcon, NotesIcon, TargetIcon, TimeSpentIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import s from './TestResults.module.css';

const SUBJECT_NAME = { RW: 'Reading & Writing', MATH: 'Math' };
const DIFF_LABEL   = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Very Hard', 5: 'Extreme' };
const DIFF_CLASS   = { 1: 'diffEasy', 2: 'diffMed', 3: 'diffHard', 4: 'diffVHard', 5: 'diffExtreme' };

export function TestResultsInteractive({
  attemptId,
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
  // shared DomainBreakdownCard's {name, skills:[{name}]} shape.
  // Doing it here keeps the shared component free of the older
  // field names and the rest of this file untouched.
  const domainsRw = domains
    .filter((d) => d.subject_code === 'RW')
    .map(normalizeDomain);
  const domainsMath = domains
    .filter((d) => d.subject_code === 'MATH')
    .map(normalizeDomain);

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

      {/* ---------- Domain / skill breakdown ---------- */}
      {(domainsRw.length > 0 || domainsMath.length > 0) && (
        <section className={s.cardRow}>
          <DomainBreakdownCard title="Reading & Writing" tone="rw"   domains={domainsRw} />
          <DomainBreakdownCard title="Math"             tone="math" domains={domainsMath} />
        </section>
      )}{/* DomainBreakdownCard imported from @/lib/practice. */}

      {/* ---------- Opportunity Index ---------- */}
      {opportunity.length > 0 && (
        <section className={s.card}>
          <div className={s.cardHeader}>
            <div className={s.sectionLabel}>
              <IconTile icon={TargetIcon} palette="amber" size="sm" />
              Opportunity Index
            </div>
            <div className={s.oiDescription}>
              Skills where you have the most room to grow, weighted
              by learnability × wrong-question impact. Start here
              for the biggest score lift.
            </div>
          </div>
          <OpportunityTable rows={opportunity.slice(0, 10)} />
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

          {/* Optional: by-difficulty breakdown if we have enough data. */}
          {timing.byDifficulty.length > 0 && timing.byDifficulty.some((d) => d.count >= 2) && (
            <div className={s.diffTimingRow}>
              {timing.byDifficulty.map((d) => (
                <DifficultyTimingTile key={d.difficulty} entry={d} />
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
                {selected.taxonomy?.difficulty &&
                  ` · ${DIFF_LABEL[selected.taxonomy.difficulty] ?? 'Difficulty ' + selected.taxonomy.difficulty}`}
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
              {!selected.missing && (
                <StudentQuestionNotes
                  key={`mynote-${selected.questionId}`}
                  questionId={selected.questionId}
                  initialNote={selected.studentNote ?? null}
                  questionTaxonomy={selected.taxonomy ?? null}
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
    </main>
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

function normalizeDomain(d) {
  return {
    name: d.domain_name,
    correct: d.correct ?? 0,
    total: d.total ?? 0,
    skills: (d.skills ?? []).map((sk) => ({
      name: sk.skill_name,
      correct: sk.correct ?? 0,
      total: sk.total ?? 0,
    })),
  };
}

function OpportunityTable({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.opportunity_index));
  return (
    <ul className={s.oiList}>
      {rows.map((r, i) => {
        const acc = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
        const barW = Math.max(4, (r.opportunity_index / max) * 100);
        return (
          <li key={`${r.skill_code}-${i}`} className={s.oiRow}>
            <div className={s.oiRowMain}>
              <div className={s.oiRowSkill}>{r.skill_name}</div>
              <div className={s.oiRowDomain}>
                {r.subject_code === 'RW' ? 'Reading & Writing' : 'Math'} · {r.domain_name}
              </div>
            </div>
            <div className={s.oiRowRight}>
              <div className={s.oiRowBar}>
                <div className={s.oiRowFill} style={{ width: `${barW}%` }} />
              </div>
              <div className={s.oiRowScore}>{r.opportunity_index.toFixed(1)}</div>
              <div className={s.oiRowAccuracy}>{acc}% ({r.correct}/{r.total})</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
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
                <span className={s.timingItemOrdinal}>Q{r.ordinal}</span>
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
                    {it.taxonomy?.difficulty != null && (
                      <span>
                        {DIFF_NAMES[it.taxonomy.difficulty] ??
                          `Difficulty ${it.taxonomy.difficulty}`}
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

const DIFF_NAMES = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Very hard', 5: 'Extreme' };
const DIFF_TONE = {
  1: 'diffEasy', 2: 'diffMed', 3: 'diffHard', 4: 'diffVHard', 5: 'diffExtreme',
};

function DifficultyTimingTile({ entry }) {
  const toneCls = DIFF_TONE[entry.difficulty];
  const cls = [s.diffTimingTile, toneCls ? s[toneCls] : null].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className={s.diffTimingLabel}>
        {DIFF_NAMES[entry.difficulty] ?? `Difficulty ${entry.difficulty}`}
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
