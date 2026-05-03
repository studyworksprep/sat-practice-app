// Review → Error Log. Study version of the error log: each entry
// renders alongside the question it's linked to, with the question
// stem / options / rationale fully expanded. Same data as
// /notes/error-log, different presentation: this page is for
// re-reading entries with the question right there; the manage
// page is for skimming the list.
//
// Reachable from the Review hub (/review). The /notes/error-log
// path remains the management view.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { loadErrorNotes } from '@/lib/practice/load-error-notes';
import { NotesIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import s from './ErrorLog.module.css';

export const dynamic = 'force-dynamic';

const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Very Hard', 5: 'Extreme' };

export default async function ReviewErrorLogPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'practice') redirect('/subscribe');

  const rows = await loadErrorNotes({ supabase, userId: user.id });

  return (
    <main className={s.container}>
      <header className={s.header}>
        <Link href="/review" className={s.backLink}>← Back to Review</Link>
        <div className={s.titleRow}>
          <IconTile icon={NotesIcon} palette="amber" size="md" />
          <div>
            <h1 className={s.h1}>Review your error log</h1>
            <p className={s.sub}>
              Each note alongside the question it&apos;s about. Read
              through and revisit what tripped you up. Click a row&apos;s
              link to reopen the question in practice review.
            </p>
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className={s.emptyCard}>
          <h2 className={s.emptyH2}>No error notes yet.</h2>
          <p className={s.emptyBody}>
            After you submit an answer in a practice session, click
            the <strong>Error log</strong> button on the question to
            jot down what tripped you up. Your notes show up here for
            review.
          </p>
          <Link href="/practice/start" className={s.emptyCta}>
            Start a practice session →
          </Link>
        </div>
      ) : (
        <ul className={s.list}>
          {rows.map((r) => (
            <ReviewRow key={r.questionId} r={r} />
          ))}
        </ul>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function ReviewRow({ r }) {
  return (
    <li className={`${s.row} ${s.reviewRow}`}>
      <div className={s.rowHeader}>
        <div className={s.rowMeta}>
          {r.externalId && <span className={s.rowCode}>{r.externalId}</span>}
          {r.domainName && <span className={s.rowDomain}>{r.domainName}</span>}
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

      {/* Two-column layout: question on the left, the student's
          note on the right. Stacks on narrow viewports. */}
      <div className={s.reviewBody}>
        <div className={s.reviewQuestionCol}>
          <div className={s.reviewColLabel}>Question</div>
          {r.preview ? (
            <QuestionPreview preview={r.preview} />
          ) : (
            <div className={s.previewMissing}>
              This question is no longer available in the question bank.
            </div>
          )}
        </div>
        <div className={s.reviewNoteCol}>
          <div className={s.reviewColLabel}>Your note</div>
          <p className={s.reviewNoteBody}>{r.body}</p>
          <div className={s.rowFoot}>
            <span className={s.rowDate}>Updated {formatDate(r.updatedAt)}</span>
          </div>
        </div>
      </div>
    </li>
  );
}

// Static, read-only preview of one question. Same renderer as the
// /notes/error-log page; here it's always expanded (no <details>
// wrapper) because the whole point of this page is studying the
// question alongside the note.
function QuestionPreview({ preview }) {
  const correctOptionId = preview.correctOptionId;
  const studentSelected = preview.studentAnswer?.selectedOptionId ?? null;
  return (
    <div className={s.previewBody}>
      {preview.stimulusHtml && (
        <div
          className={`${s.previewStimulus} sw-prose`}
          dangerouslySetInnerHTML={{ __html: preview.stimulusHtml }}
        />
      )}
      {preview.stemHtml && (
        <div
          className={`${s.previewStem} sw-prose`}
          dangerouslySetInnerHTML={{ __html: preview.stemHtml }}
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
                <span
                  className={`${s.previewOptionContent} sw-option-content`}
                  dangerouslySetInnerHTML={{ __html: opt.content_html }}
                />
                {isCorrect && <span className={s.previewOptionTag}>Correct</span>}
                {isWrongPick && (
                  <span className={s.previewOptionTagWrong}>Your answer</span>
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
        <details className={s.rationaleDetails}>
          <summary className={s.rationaleSummary}>
            <span className={s.rationaleSummaryShow}>Show rationale</span>
            <span className={s.rationaleSummaryHide}>Hide rationale</span>
          </summary>
          <div className={s.previewRationale}>
            <div className={s.previewRationaleLabel}>Rationale</div>
            <div
              className={`${s.previewRationaleBody} sw-prose`}
              dangerouslySetInnerHTML={{ __html: preview.rationaleHtml }}
            />
          </div>
        </details>
      )}
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
