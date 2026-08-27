// Estimated lesson duration (lesson-improvement plan step 3.3).
//
// Computed at read time from the block mix — no migration, no stored
// column. The per-type minutes are the plan's rule of thumb: reading
// a text slide 0.6, answering a check 1, a Desmos activity 2, a
// linked practice question 2. Video assumes the 60–90 s intro
// convention (3.5) plus load time; lesson_complete is a click.
//
// The estimate is deliberately coarse, so the display rounds to the
// nearest 5 minutes ("~25 min") — precision would be false.

const MINUTES_BY_TYPE = {
  text: 0.6,
  check: 1,
  desmos_interactive: 2,
  question_link: 2,
  video: 1.5,
  lesson_complete: 0.3,
};
const DEFAULT_MINUTES = 0.6;

// blocks: anything with a block_type (DB rows, compiled blocks) or
// bare type strings. Returns raw (unrounded) minutes; 0 when empty.
export function estimateLessonMinutes(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  let minutes = 0;
  for (const block of list) {
    const type = typeof block === 'string' ? block : block?.block_type;
    minutes += MINUTES_BY_TYPE[type] ?? DEFAULT_MINUTES;
  }
  return minutes;
}

// "~25 min", rounded to the nearest 5 with a floor of 5; null when
// there is nothing to estimate (callers render nothing).
export function formatLessonDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const rounded = Math.max(5, Math.round(minutes / 5) * 5);
  return `~${rounded} min`;
}
