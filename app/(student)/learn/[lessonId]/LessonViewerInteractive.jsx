// Thin client island that wires the shared LessonSlideshow runtime
// to lesson-progress server actions. The runtime maintains its own
// in-memory state (current block index, branch state, force-unlocks,
// etc.) — the server actions just mirror the durable bits
// (completed_blocks / check_answers / completed_at) to the DB so a
// returning student picks up where they left off.

'use client';

import { LessonSlideshow } from '@/lib/ui/LessonSlideshow';
import {
  markBlockComplete,
  submitCheckAnswer,
  submitDesmosResult,
  markLessonComplete,
} from './actions';

export function LessonViewerInteractive({
  lessonId,
  blocks,
  initialCompletedBlockIds,
  initialCheckAnswers,
  initialIsComplete,
  debug,
}) {
  return (
    <LessonSlideshow
      blocks={blocks}
      initialCompletedBlockIds={initialCompletedBlockIds}
      initialCheckAnswers={initialCheckAnswers}
      initialIsComplete={initialIsComplete}
      onMarkBlockComplete={(blockId) => markBlockComplete(lessonId, blockId)}
      onSubmitCheck={(blockId, selected, correct) =>
        submitCheckAnswer(lessonId, blockId, selected, correct)
      }
      onSubmitDesmos={(blockId, correct) =>
        submitDesmosResult(lessonId, blockId, correct)
      }
      onMarkComplete={() => markLessonComplete(lessonId)}
      questionLinkHref={(qid) => `/practice/${qid}`}
      debugMode={debug}
    />
  );
}
