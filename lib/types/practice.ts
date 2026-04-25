// Domain enums + small literal-union types shared across the
// practice + practice-test surfaces. Centralizing them lets a
// component say `subject: SubjectCode` instead of restating the
// `'RW' | 'MATH'` union at every call site, and a typo gets
// flagged at compile time.

/** Practice-test subject. The DB stores it as text with a CHECK
 *  constraint; this union keeps the application code in sync. */
export type SubjectCode = 'RW' | 'MATH';

/** Practice-test module routing. 'std' = non-adaptive; 'easy' /
 *  'hard' = adaptive module-2 routes. */
export type RouteCode = 'easy' | 'hard' | 'std';

/** Difficulty bands authored on questions_v2.difficulty. The DB
 *  column is integer; this union exists so code that branches on
 *  difficulty (the difficulty tint tokens, the OI ease weights)
 *  doesn't accept arbitrary numbers. */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** Question type as stored in questions_v2.question_type. */
export type QuestionType = 'mcq' | 'spr';

/** Practice-session lifecycle status (migration 030). */
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';

/** Practice-test attempt lifecycle status. */
export type TestAttemptStatus = 'in_progress' | 'completed' | 'abandoned';

/** Per-position status the QuestionMap renders. */
export type MapItemStatus = 'unanswered' | 'correct' | 'incorrect' | 'removed';

/** Practice-session mode — disambiguates real practice from
 *  tutor training and review re-runs that share the runner. */
export type SessionMode = 'practice' | 'training' | 'review';
