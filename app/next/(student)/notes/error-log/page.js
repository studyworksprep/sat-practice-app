// Error Log — management view. Lists every error note the student
// has written, newest first, with the linked question collapsed
// behind a Show question expander. Lives under /notes because the
// Error Log is one of the three "kinds of notes" the student keeps:
// rich-text notes, error notes, and flashcards.
//
// Notes themselves are written from the practice runner — see
// ErrorLogButton + saveErrorNote. This page is read-only; the
// /review/error-log surface is the study version of the same data.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { loadErrorNotes } from '@/lib/practice/load-error-notes';
import { NotesIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { NotesNav } from '../NotesNav';
import s from './ErrorLog.module.css';
import notesS from '../Notes.module.css';

export const dynamic = 'force-dynamic';

const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Very Hard', 5: 'Extreme' };

export default async function StudentErrorLogManagePage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'practice') redirect('/subscribe');

  const rows = await loadErrorNotes({ supabase, userId: user.id });

  // Counts for the header strip.
  const totalNotes = rows.length;
  const wrongLatestCount = rows.filter((r) => r.lastIsCorrect === false).length;
  const fixedCount = rows.filter((r) => r.lastIsCorrect === true).length;

  return (
    <main className={notesS.page}>
      <NotesNav />
      <header className={s.header}>
        <div className={s.titleRow}>
          <IconTile icon={NotesIcon} palette="amber" size="md" />
          <div>
            <h1 className={s.h1}>Error log</h1>
            <p className={s.sub}>
              Your notes on questions you got wrong, newest first.
              Click <strong>Show question</strong> to reopen the
              question alongside what you wrote, or head to{' '}
              <Link href="/review/error-log" className={s.backLink}>
                Review → Error log
              </Link>{' '}
              for an immersive scroll.
            </p>
          </div>
        </div>
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
            After you submit an answer in a practice session, click
            the <strong>Error log</strong> button on the question to
            jot down what tripped you up. Your notes show up here.
          </p>
          <Link href="/practice/start" className={s.emptyCta}>
            Start a practice session →
          </Link>
        </div>
      ) : (
        <ul className={s.list}>
          {rows.map((r) => (
            <ErrorRow key={r.questionId} r={r} />
          ))}
        </ul>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function ErrorRow({ r }) {
  return (
    <li className={s.row}>
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
        <span className={s.rowDate}>Updated {formatDate(r.updatedAt)}</span>
      </div>
    </li>
  );
}

// Static, read-only preview of one question. Server-rendered
// inside a <details> wrapper so the show / hide UX doesn't need
// any client JS.
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
        <div className={s.previewRationale}>
          <div className={s.previewRationaleLabel}>Rationale</div>
          <div
            className={`${s.previewRationaleBody} sw-prose`}
            dangerouslySetInnerHTML={{ __html: preview.rationaleHtml }}
          />
        </div>
      )}
    </div>
  );
}

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
