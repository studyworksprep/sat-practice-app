// Thin client island that wires the shared LessonSlideshow runtime
// to lesson-progress server actions. The runtime maintains its own
// in-memory state (current block index, branch state, force-unlocks,
// etc.) — the server actions just mirror the durable bits
// (completed_blocks / check_answers / completed_at) to the DB so a
// returning student picks up where they left off.

'use client';

import { LessonSlideshow } from '@/lib/ui/LessonSlideshow';
import { LessonPracticeButton } from './LessonPracticeButton';
import {
  createLessonPracticeDrill,
  markBlockComplete,
  markLessonComplete,
} from './actions';

export function LessonViewerInteractive({
  lessonId,
  submitByBlock,
  planTaskId = null,
  blocks,
  initialCompletedBlockIds,
  initialCheckAnswers,
  initialIsComplete,
  canPractice = false,
  debug,
}) {
  // The lesson page checks that this lesson has published drill questions.
  const practiceCta = canPractice ? (
    <LessonPracticeButton
      action={createLessonPracticeDrill.bind(null, lessonId)}
    />
  ) : null;
  return (
    <LessonSlideshow
      blocks={blocks}
      initialCompletedBlockIds={initialCompletedBlockIds}
      initialCheckAnswers={initialCheckAnswers}
      initialIsComplete={initialIsComplete}
      onMarkBlockComplete={(blockId) => markBlockComplete(lessonId, blockId)}
      onSubmitCheck={(blockId, selected, correct, options) =>
        submitByBlock[blockId](selected, correct, options)
      }
      onSubmitDesmos={(blockId, correct, options) =>
        submitByBlock[blockId](null, correct, options)
      }
      onMarkComplete={() => markLessonComplete(lessonId, planTaskId)}
      questionLinkHref={(qid) => `/practice/${qid}`}
      debugMode={debug}
      calculatorStoragePrefix={`lesson-desmos:${lessonId}`}
      reportHref={`/learn/${lessonId}/report`}
      completionHref={planTaskId ? '/plan' : '/learn'}
      completionLabel={planTaskId ? 'Back to Study Plan' : 'Back to Learn'}
      completionPrimary={practiceCta}
    />
  );
}
