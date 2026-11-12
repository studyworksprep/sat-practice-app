import type { ReactNode } from 'react';
import HtmlBlock from '@/components/HtmlBlock';
import { MathText } from '@/lib/ui/MathText';
import { formatNumericCheckAnswer, isNumericCheck } from '@/lib/lesson/numeric-check.mjs';
import s from './LessonSlideshow.module.css';

type CheckContent = {
  prompt?: string;
  input?: string;
  answer?: string | number;
  accept?: (string | number)[];
  choices?: string[];
  correct_index?: number;
  allow_retry?: boolean;
  hint?: string;
  explanation?: string;
  solution?: string;
};

type DesmosFeedback = {
  success_message_html: string;
  retry_message_html: string;
  solution_html?: string;
  targeted_hints?: { message_html: string }[];
  attempt_based_hints?: { min_attempts: number; message_html: string }[];
};

function FeedbackSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={s.reviewFeedbackSection}>
      <h4 className={s.reviewFeedbackTitle}>{title}</h4>
      {children}
    </div>
  );
}

function FeedbackHtml({ html }: { html: string }) {
  return <HtmlBlock html={html} className="prose lesson-prose" imgMaxWidth="100%" />;
}

export function CheckAnswerReview({ block }: { block: { content?: CheckContent } }) {
  const content = block.content || {};
  const choices = content.choices || [];
  const correctIndex = content.correct_index ?? 0;
  const numeric = isNumericCheck(content);
  const solution = content.solution || (content.allow_retry ? content.explanation : null);
  const answer = numeric
    ? formatNumericCheckAnswer(content)
    : `${String.fromCharCode(65 + correctIndex)}. ${choices[correctIndex] || '—'}`;

  return (
    <div className={`${s.card} ${s.checkCard}`}>
      <div className={s.kicker}>Knowledge Check</div>
      <MathText as="p" className={s.checkPrompt}>{content.prompt}</MathText>
      {!numeric && (
        <div className={s.choiceList}>
          {choices.map((choice, index) => (
            <button
              key={index}
              type="button"
              disabled
              className={`${s.choice} ${index === correctIndex ? s.choiceCorrect : ''}`}
            >
              <span className={s.choiceLetter}>{String.fromCharCode(65 + index)}</span>
              <MathText as="span">{choice}</MathText>
              {index === correctIndex && <span className={s.choiceMark} aria-label="Correct answer">✓</span>}
            </button>
          ))}
        </div>
      )}
      <p className={s.reviewAnswer}>
        <strong>Correct answer:</strong>{' '}<MathText>{answer}</MathText>
      </p>
      <section className={s.reviewFeedback} aria-label="Answer feedback">
        <FeedbackSection title="If correct">
          <p>Correct. Nice work!</p>
          {content.explanation && <MathText as="p" className={s.solutionSteps}>{content.explanation}</MathText>}
        </FeedbackSection>
        <FeedbackSection title="If incorrect">
          {content.allow_retry ? (
            <MathText as="p">{`Try again. ${content.hint || 'Not quite — take another look and try again.'}`}</MathText>
          ) : (
            <>
              <p>The correct answer was <MathText>{answer}</MathText>.</p>
              {content.explanation && <MathText as="p" className={s.solutionSteps}>{content.explanation}</MathText>}
            </>
          )}
        </FeedbackSection>
        {solution && (
          <FeedbackSection title="Worked solution">
            <MathText as="p" className={s.solutionSteps}>{solution}</MathText>
          </FeedbackSection>
        )}
      </section>
    </div>
  );
}

export function DesmosAnswerReview({ content }: { content: { feedback: DesmosFeedback } }) {
  const feedback = content.feedback;
  return (
    <section className={s.reviewFeedback} aria-label="Answer feedback">
      <FeedbackSection title="If correct">
        <FeedbackHtml html={feedback.success_message_html} />
      </FeedbackSection>
      <FeedbackSection title="If incorrect">
        <FeedbackHtml html={feedback.retry_message_html} />
      </FeedbackSection>
      {((feedback.targeted_hints?.length ?? 0) > 0 || (feedback.attempt_based_hints?.length ?? 0) > 0) && (
        <details className={s.reviewFeedbackSection}>
          <summary className={s.reviewFeedbackTitle}>Additional hints</summary>
          {feedback.targeted_hints?.map((hint, index) => (
            <FeedbackHtml key={`targeted-${index}`} html={hint.message_html} />
          ))}
          {feedback.attempt_based_hints?.map((hint, index) => (
            <div key={`attempt-${index}`}>
              <p>After {hint.min_attempts} {hint.min_attempts === 1 ? 'attempt' : 'attempts'}:</p>
              <FeedbackHtml html={hint.message_html} />
            </div>
          ))}
        </details>
      )}
      {feedback.solution_html && (
        <FeedbackSection title="Worked solution">
          <FeedbackHtml html={feedback.solution_html} />
        </FeedbackSection>
      )}
    </section>
  );
}
