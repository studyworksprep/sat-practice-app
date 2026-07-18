// Skill → lesson recommendations (upgrade plan §3.3).
//
// The one shared resolver for "which published lesson teaches this
// skill?". The join key is lesson_topics.skill_code, which shares
// the questions_v2 code space; only skill-level tags on PUBLISHED
// lessons count, mirroring get_plan_inputs.has_lesson (migration
// 20260717190000) — if the coverage rule changes, change both.
//
// Callers: the Review hub's Common Errors card ("Learn it first"),
// the post-session report's missed-skill recommendations, and the
// Today page's lesson-task launcher.
//
// lesson_topics fills in as the §3.4 authoring workstream ships
// lessons, so "no match" is the common case for now: the resolver
// is best-effort (errors → empty map) and every surface degrades
// to simply not recommending anything.

import type { TypedSupabaseClient } from '@/lib/supabase/server';

export interface LessonRecommendation {
  lessonId: string;
  title: string;
}

export interface TopicLessonRow {
  skill_code: string | null;
  lesson_id: string;
  title: string;
}

/**
 * Pure grouping core (unit-tested): topic rows → per-skill
 * recommendation lists, deduped by lesson and deterministically
 * ordered (title, then id, so equal titles can't flip order
 * between renders).
 */
export function buildRecommendationMap(
  rows: TopicLessonRow[],
): Map<string, LessonRecommendation[]> {
  const bySkill = new Map<string, Map<string, LessonRecommendation>>();
  for (const row of rows) {
    if (!row.skill_code || !row.lesson_id) continue;
    let lessons = bySkill.get(row.skill_code);
    if (!lessons) {
      lessons = new Map();
      bySkill.set(row.skill_code, lessons);
    }
    if (!lessons.has(row.lesson_id)) {
      lessons.set(row.lesson_id, { lessonId: row.lesson_id, title: row.title ?? '' });
    }
  }
  const out = new Map<string, LessonRecommendation[]>();
  for (const [skillCode, lessons] of bySkill) {
    out.set(
      skillCode,
      Array.from(lessons.values()).sort(
        (a, b) => a.title.localeCompare(b.title) || a.lessonId.localeCompare(b.lessonId),
      ),
    );
  }
  return out;
}

/**
 * Resolve published lessons for a set of skill codes. Returns a map
 * keyed by skill_code; skills with no published tagged lesson are
 * simply absent. Recommendations are decoration, so a query error
 * returns an empty map rather than throwing.
 */
export async function recommendLessonsForSkills(
  supabase: TypedSupabaseClient,
  skillCodes: readonly (string | null | undefined)[],
): Promise<Map<string, LessonRecommendation[]>> {
  const codes = Array.from(new Set(skillCodes.filter((c): c is string => !!c)));
  if (codes.length === 0) return new Map();

  const { data, error } = await supabase
    .from('lesson_topics')
    .select('skill_code, lessons!inner(id, title)')
    .in('skill_code', codes)
    .eq('lessons.status', 'published');
  if (error || !data) return new Map();

  return buildRecommendationMap(
    data.map((r) => {
      // lesson_id → lessons is many-to-one; guard the array shape
      // anyway (same defensive read as admin/content/units).
      const lesson = Array.isArray(r.lessons) ? r.lessons[0] : r.lessons;
      return {
        skill_code: r.skill_code,
        lesson_id: lesson?.id ?? '',
        title: lesson?.title ?? '',
      };
    }),
  );
}
