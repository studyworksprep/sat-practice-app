import type { TypedSupabaseClient } from '@/lib/supabase/server';
import {
  buildLessonCatalog,
  type CatalogLessonRow,
  type CatalogTopicRow,
  type LessonCatalogItem,
} from './catalog';

interface LoadLessonCatalogOptions {
  status?: string;
  visibility?: string;
  limit?: number;
}

/**
 * Shared server-side catalog loader. Lesson metadata and curriculum
 * tags are fetched in two bounded queries, then normalized once for
 * every library/picker surface.
 */
export async function loadLessonCatalog(
  supabase: TypedSupabaseClient,
  options: LoadLessonCatalogOptions = {},
): Promise<LessonCatalogItem[]> {
  let lessonQuery = supabase
    .from('lessons')
    .select([
      'id',
      'title',
      'description',
      'kind',
      'status',
      'visibility',
      'author_id',
      'created_at',
      'updated_at',
      'foundation_sequence',
    ].join(', '))
    .order('updated_at', { ascending: false })
    .limit(options.limit ?? 1000);

  if (options.status) lessonQuery = lessonQuery.eq('status', options.status);
  if (options.visibility) lessonQuery = lessonQuery.eq('visibility', options.visibility);

  const { data: lessonRows, error: lessonError } = await lessonQuery;
  if (lessonError) throw new Error(`Could not load lessons: ${lessonError.message}`);

  const lessons = (lessonRows ?? []) as unknown as CatalogLessonRow[];
  if (lessons.length === 0) return [];

  // Keep each PostgREST `in` URL comfortably below common proxy URL
  // limits when the admin catalog eventually reaches hundreds of
  // lessons. These run concurrently, so today's smaller libraries
  // still make a single topic request.
  const topicResults = await Promise.all(
    chunk(lessons.map((lesson) => lesson.id), 100).map((lessonIds) => (
      supabase
        .from('lesson_topics')
        .select('lesson_id, section, domain_name, skill_code, pattern_id, question_patterns(name, domain_code, skill_code)')
        .in('lesson_id', lessonIds)
    )),
  );
  const topicError = topicResults.find((result) => result.error)?.error;
  if (topicError) throw new Error(`Could not load lesson topics: ${topicError.message}`);
  const topicRows = topicResults.flatMap((result) => result.data ?? []);

  return buildLessonCatalog(
    lessons,
    topicRows as unknown as CatalogTopicRow[],
  );
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
