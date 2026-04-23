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

import { useState } from 'react';
import Link from 'next/link';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { FloatingCalculator } from '@/lib/ui/FloatingCalculator';
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
}) {
  const [selectedOrdinal, setSelectedOrdinal] = useState(
    reviewItems.find((r) => !r.missing)?.ordinal ?? reviewItems[0]?.ordinal ?? 1,
  );
  const [revealed, setRevealed] = useState(() => new Set());
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  const selected = reviewItems.find((r) => r.ordinal === selectedOrdinal) ?? reviewItems[0];
  const isRevealed = revealed.has(selected?.ordinal);
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
          </div>
          <div className={s.timingGrid}>
            <TimingTile label="Total time spent" value={formatDuration(timing.totalMs)} />
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
                />
              )}
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

function formatDuration(ms) {
  if (ms == null) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}
