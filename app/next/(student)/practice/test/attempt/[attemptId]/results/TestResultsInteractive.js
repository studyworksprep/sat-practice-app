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

import { useRef, useState } from 'react';
import Link from 'next/link';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { FloatingCalculator } from '@/lib/ui/FloatingCalculator';
import { ConceptTags } from '@/lib/practice/ConceptTags';
import { DesmosSavedStateButton } from '@/lib/practice/DesmosSavedStateButton';
import { FlashcardsButton } from '@/lib/practice/FlashcardsButton';
import { BookmarkIcon } from '@/lib/ui/icons';
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
}) {
  const [selectedOrdinal, setSelectedOrdinal] = useState(
    reviewItems.find((r) => !r.missing)?.ordinal ?? reviewItems[0]?.ordinal ?? 1,
  );
  const [revealed, setRevealed] = useState(() => new Set());
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  const selected = reviewItems.find((r) => r.ordinal === selectedOrdinal) ?? reviewItems[0];
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

  const domainsRw   = domains.filter((d) => d.subject_code === 'RW');
  const domainsMath = domains.filter((d) => d.subject_code === 'MATH');

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
      )}

      {/* ---------- Opportunity Index ---------- */}
      {opportunity.length > 0 && (
        <section className={s.card}>
          <div className={s.cardHeader}>
            <div className={s.sectionLabel}>Opportunity Index</div>
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
            <div className={s.sectionLabel}>Timing</div>
            <div className={s.cardHeaderHint}>
              Wall-clock time per module above; average time per
              question below comes from active answer time, not
              review-page dwell.
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

          {/* Module-by-module usage against its allotted time. */}
          {timing.byModule.length > 0 && (
            <div className={s.moduleTimingList}>
              {timing.byModule.map((m, i) => (
                <ModuleTimingRow key={i} entry={m} />
              ))}
            </div>
          )}

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

      {/* ---------- Per-question review ---------- */}
      <section className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.sectionLabel}>Per-question review</div>
          <div className={s.cardHeaderHint}>
            Click any question below to review it. Your initial
            answer is shown; reveal the correct answer + rationale
            when you&apos;re ready.
          </div>
        </div>

        <div className={s.mapGrid} role="list">
          {reviewItems.map((it) => {
            const isCurrent = it.ordinal === selected?.ordinal;
            const diffCls = DIFF_CLASS[it.taxonomy?.difficulty] ?? null;
            const cls = [
              s.mapItem,
              diffCls ? s[diffCls] : null,
              isCurrent ? s.mapItemActive : null,
              it.status === 'unanswered' ? s.mapItemUnanswered : null,
              revealed.has(it.ordinal) ? s.mapItemRevealed : null,
            ].filter(Boolean).join(' ');
            return (
              <button
                key={it.ordinal}
                type="button"
                className={cls}
                onClick={() => setSelectedOrdinal(it.ordinal)}
                aria-label={`Question ${it.ordinal}, ${it.status}`}
              >
                <span className={s.mapNum}>{it.ordinal}</span>
                {it.marked && (
                  <BookmarkIcon filled size={10} className={s.mapFlag} />
                )}
                {it.status === 'correct'   && <span className={s.mapTick}>✓</span>}
                {it.status === 'incorrect' && <span className={s.mapX}>✗</span>}
              </button>
            );
          })}
        </div>
      </section>

      {selected && (
        <section className={s.questionCard}>
          <div className={s.questionHeader}>
            <div className={s.questionHeaderLeft}>
              <span className={s.questionNum}>
                Question {selected.ordinal}
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
            />
          )}

          {conceptTagsCanTag && !selected.missing && conceptTagsCatalog && (
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
          )}
        </section>
      )}

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

function DomainBreakdownCard({ title, tone, domains }) {
  if (domains.length === 0) return null;
  const fillCls = tone === 'rw' ? s.barFillRw : s.barFillMath;
  let sectCorrect = 0, sectTotal = 0;
  for (const d of domains) { sectCorrect += d.correct; sectTotal += d.total; }
  const sectPct = sectTotal > 0 ? Math.round((sectCorrect / sectTotal) * 100) : null;
  return (
    <div className={s.domainCard}>
      <div className={s.domainCardHeader}>
        <div className={s.domainCardTitle}>{title}</div>
        <div className={tone === 'rw' ? s.domainCardPctRw : s.domainCardPctMath}>
          {sectPct == null ? '—' : `${sectPct}%`}
        </div>
      </div>
      {domains.map((d) => {
        const pct = d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0;
        return (
          <div key={d.domain_name} className={s.domainRow}>
            <div className={s.domainRowHead}>
              <div className={s.domainRowName}>{d.domain_name}</div>
              <div className={s.domainRowStat}>
                {d.correct}/{d.total}
                <span className={s.domainRowPct}> · {pct}%</span>
              </div>
            </div>
            <div className={s.bar}>
              <div className={fillCls} style={{ width: `${pct}%` }} />
            </div>
            {d.skills.length > 0 && (
              <ul className={s.skillList}>
                {d.skills.map((sk) => {
                  const sp = sk.total > 0 ? Math.round((sk.correct / sk.total) * 100) : 0;
                  return (
                    <li key={sk.skill_name} className={s.skillRow}>
                      <span className={s.skillName}>{sk.skill_name}</span>
                      <span className={s.skillStat}>
                        {sk.correct}/{sk.total}
                        <span className={s.skillPct}> · {sp}%</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
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

function ModuleTimingRow({ entry }) {
  const pct = entry.usedMs != null && entry.allottedMs > 0
    ? Math.min(100, Math.round((entry.usedMs / entry.allottedMs) * 100))
    : null;
  // Tone by how much time was used: gold ≥ 90%, neutral otherwise.
  // Students finishing with lots of time left see a neutral bar;
  // those who went to the wire get a warning tint.
  const barCls = [s.modTimingFill, pct != null && pct >= 90 ? s.modTimingFillTight : null]
    .filter(Boolean).join(' ');
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
        {pct != null && (
          <div className={barCls} style={{ width: `${pct}%` }} />
        )}
      </div>
      <div className={s.modTimingPct}>
        {pct != null ? `${pct}%` : '—'}
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

function formatDuration(ms) {
  if (ms == null) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}
