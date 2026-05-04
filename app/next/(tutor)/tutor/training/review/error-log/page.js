// Tutor → training Error Log. Mirrors the student
// /review/error-log page with tutor-tree URLs on the empty-state
// CTA. Uses the same data loader (loadErrorNotes) since the
// underlying surface is per-user; mode doesn't matter.
//
// Reuses the student page's CSS module so the two surfaces stay
// visually identical without duplicating styles.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { loadErrorNotes } from '@/lib/practice/load-error-notes';
import { NotesIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { SafeHtml } from '@/lib/ui/SafeHtml';
import s from '../../../../../(student)/review/error-log/ErrorLog.module.css';

export const dynamic = 'force-dynamic';

const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Very Hard', 5: 'Extreme' };

export default async function TutorTrainingErrorLogPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') redirect('/review/error-log');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  const rows = await loadErrorNotes({ supabase, userId: user.id });

  const totalNotes = rows.length;
  const wrongLatestCount = rows.filter((r) => r.lastIsCorrect === false).length;
  const fixedCount = rows.filter((r) => r.lastIsCorrect === true).length;

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Train · Review</div>
        <div className={s.titleRow}>
          <IconTile icon={NotesIcon} palette="amber" size="md" />
          <div>
            <h1 className={s.h1}>Error log</h1>
            <p className={s.sub}>
              Your notes on questions you got wrong, newest first.
            </p>
          </div>
        </div>
        <Link href="/tutor/training/review" className={s.backLink}>
          ← Back to Review
        </Link>
      </header>

      {totalNotes > 0 && (
        <div className={s.statsStrip}>
          <Stat label="Notes recorded" value={totalNotes} />
          <Stat
            label="Latest answer wrong"
            value={wrongLatestCount}
            tone={wrongLatestCount > 0 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Latest answer correct"
            value={fixedCount}
            tone={fixedCount > 0 ? 'good' : 'neutral'}
          />
        </div>
      )}

      {totalNotes === 0 ? (
        <div className={s.emptyCard}>
          <h2 className={s.emptyH2}>No error notes yet.</h2>
          <p className={s.emptyBody}>
            After you submit an answer in a training session, click
            the <strong>Error log</strong> button on the question to
            jot down what tripped you up. Your notes show up here.
          </p>
          <Link href="/tutor/training/practice" className={s.emptyCta}>
            Start a training session →
          </Link>
        </div>
      ) : (
        <ul className={s.list}>
          {rows.map((r) => (
            <li key={r.questionId} className={s.row}>
              <div className={s.rowHeader}>
                <div className={s.rowMeta}>
                  {r.externalId && (
                    <span className={s.rowCode}>{r.externalId}</span>
                  )}
                  {r.domainName && (
                    <span className={s.rowDomain}>{r.domainName}</span>
                  )}
                  {r.skillName && r.skillName !== r.domainName && (
                    <>
                      <span className={s.rowDot}>·</span>
                      <span className={s.rowSkill}>{r.skillName}</span>
                    </>
                  )}
                  {r.difficulty != null && (
                    <span className={`${s.rowDiff} ${diffClass(r.difficulty)}`}>
                      {DIFF_LABEL[r.difficulty] ?? `Difficulty ${r.difficulty}`}
                    </span>
                  )}
                </div>
                <div className={s.rowStatus}>
                  <AccuracyBadge attempts={r.attempts} correct={r.correct} />
                  {r.lastIsCorrect != null && (
                    <span
                      className={r.lastIsCorrect ? s.latestRight : s.latestWrong}
                      title={r.lastIsCorrect
                        ? 'Latest answer was correct'
                        : 'Latest answer was wrong'}
                    >
                      {r.lastIsCorrect ? '✓ latest' : '✕ latest'}
                    </span>
                  )}
                </div>
              </div>
              <p className={s.rowBody}>{r.body}</p>
              {r.preview ? (
                <details className={s.preview}>
                  <summary className={s.previewSummary}>
                    <span className={s.previewSummaryShow}>Show question</span>
                    <span className={s.previewSummaryHide}>Hide question</span>
                  </summary>
                  <QuestionPreview preview={r.preview} />
                </details>
              ) : (
                <div className={s.previewMissing}>
                  This question is no longer available in the question bank.
                </div>
              )}
              <div className={s.rowFoot}>
                <span className={s.rowDate}>
                  Updated {formatDate(r.updatedAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function QuestionPreview({ preview }) {
  const correctOptionId = preview.correctOptionId;
  const studentSelected = preview.studentAnswer?.selectedOptionId ?? null;
  return (
    <div className={s.previewBody}>
      {preview.stimulusHtml && (
        <SafeHtml
          html={preview.stimulusHtml}
          className={`${s.previewStimulus} sw-prose`}
        />
      )}
      {preview.stemHtml && (
        <SafeHtml
          html={preview.stemHtml}
          className={`${s.previewStem} sw-prose`}
        />
      )}

      {!preview.isSpr && preview.options.length > 0 && (
        <ul className={s.previewOptions}>
          {preview.options.map((opt) => {
            const isCorrect = opt.id === correctOptionId;
            const isPicked = studentSelected != null && opt.id === studentSelected;
            const isWrongPick = isPicked && !isCorrect;
            const cls = [
              s.previewOption,
              isCorrect ? s.previewOptionCorrect : null,
              isWrongPick ? s.previewOptionWrong : null,
            ].filter(Boolean).join(' ');
            return (
              <li key={opt.id} className={cls}>
                <span className={s.previewOptionBadge}>{opt.label}</span>
                <SafeHtml
                  as="span"
                  html={opt.content_html}
                  className={`${s.previewOptionContent} sw-option-content`}
                />
                {isCorrect && (
                  <span className={s.previewOptionTag}>Correct</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {preview.isSpr && (
        <div className={s.previewSprBlock}>
          {preview.studentAnswer?.responseText && (
            <div className={s.previewSprAnswer}>
              <span className={s.previewSprLabel}>You wrote:</span>{' '}
              <strong>{preview.studentAnswer.responseText}</strong>
              {preview.studentAnswer.isCorrect === false && (
                <span className={s.previewOptionTagWrong} style={{ marginLeft: 8 }}>
                  Incorrect
                </span>
              )}
            </div>
          )}
          {preview.correctAnswerDisplay && (
            <div className={s.previewSprCorrect}>
              <span className={s.previewSprLabel}>Correct answer:</span>{' '}
              <strong>{preview.correctAnswerDisplay}</strong>
            </div>
          )}
        </div>
      )}

      {preview.rationaleHtml && (
        <div className={s.previewRationale}>
          <div className={s.previewRationaleLabel}>Rationale</div>
          <SafeHtml
            html={preview.rationaleHtml}
            className={`${s.previewRationaleBody} sw-prose`}
          />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────

function Stat({ label, value, tone = 'neutral' }) {
  const cls = [
    s.statTile,
    tone === 'good' ? s.statGood : null,
    tone === 'warn' ? s.statWarn : null,
  ].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className={s.statValue}>{value.toLocaleString()}</div>
      <div className={s.statLabel}>{label}</div>
    </div>
  );
}

function AccuracyBadge({ attempts, correct }) {
  if (!attempts) return null;
  const pct = Math.round((correct / attempts) * 100);
  const tone = pct >= 80 ? s.accGood : pct >= 50 ? s.accOk : s.accBad;
  return (
    <span className={`${s.accBadge} ${tone}`}>
      {correct}/{attempts} · {pct}%
    </span>
  );
}

function diffClass(difficulty) {
  switch (difficulty) {
    case 1: return s.diffEasy;
    case 2: return s.diffMed;
    case 3: return s.diffHard;
    case 4: return s.diffVHard;
    case 5: return s.diffExtreme;
    default: return '';
  }
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
