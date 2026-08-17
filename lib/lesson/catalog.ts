import { SAT_TAXONOMY, type SatDomain } from '../practice/sat-taxonomy.ts';

export type LessonSection = 'reading_writing' | 'math';
export type LessonTopicGrain = 'section' | 'domain' | 'skill' | 'pattern';

export interface LessonCatalogTopic {
  grain: LessonTopicGrain;
  section: LessonSection | null;
  sectionLabel: string | null;
  domainCode: string | null;
  domainName: string | null;
  skillCode: string | null;
  skillName: string | null;
  patternId: string | null;
  patternName: string | null;
}

export interface LessonCatalogItem {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  status: string;
  visibility: string;
  author_id: string;
  created_at: string | null;
  updated_at: string | null;
  foundation_sequence: number | null;
  topics: LessonCatalogTopic[];
  sections: LessonSection[];
  domains: string[];
  searchText: string;
  isCategorized: boolean;
}

export interface LessonCatalogFilters {
  q?: string;
  section?: string;
  domain?: string;
  kind?: string;
  status?: string;
  categorization?: 'all' | 'categorized' | 'uncategorized' | string;
  sort?: 'updated' | 'title' | 'curriculum' | string;
}

export interface LessonCatalogFacets {
  sections: Array<{ value: LessonSection; label: string }>;
  domains: string[];
  kinds: string[];
  statuses: string[];
}

export interface CatalogLessonRow {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  status: string;
  visibility: string;
  author_id: string;
  created_at: string | null;
  updated_at: string | null;
  foundation_sequence: number | null;
}

export interface CatalogTopicRow {
  lesson_id: string;
  section: string | null;
  domain_name: string | null;
  skill_code: string | null;
  pattern_id: string | null;
  question_patterns:
    | { name: string; domain_code: string; skill_code: string }
    | Array<{ name: string; domain_code: string; skill_code: string }>
    | null;
}

const GRAIN_ORDER: Record<LessonTopicGrain, number> = {
  section: 0,
  domain: 1,
  skill: 2,
  pattern: 3,
};

export function sectionLabel(section: string | null | undefined): string {
  if (normalizeSection(section) === 'reading_writing') return 'Reading & Writing';
  if (normalizeSection(section) === 'math') return 'Math';
  return 'Lesson';
}

export function buildLessonCatalog(
  lessons: CatalogLessonRow[],
  topicRows: CatalogTopicRow[],
): LessonCatalogItem[] {
  const topicsByLesson = new Map<string, LessonCatalogTopic[]>();

  for (const row of topicRows) {
    const topic = normalizeTopic(row);
    if (!topic) continue;
    const bucket = topicsByLesson.get(row.lesson_id) ?? [];
    const key = topicKey(topic);
    if (!bucket.some((candidate) => topicKey(candidate) === key)) bucket.push(topic);
    topicsByLesson.set(row.lesson_id, bucket);
  }

  return lessons.map((lesson) => {
    const topics = (topicsByLesson.get(lesson.id) ?? []).sort(compareTopics);
    const sections = unique(
      topics.map((topic) => topic.section).filter((value): value is LessonSection => !!value),
    );
    const domains = unique(
      topics.map((topic) => topic.domainName).filter((value): value is string => !!value),
    ).sort((a, b) => a.localeCompare(b));
    const labels = getTopicSearchLabels(topics);
    const searchText = [
      lesson.title,
      lesson.description,
      lesson.kind,
      lesson.status,
      lesson.visibility,
      ...labels,
      ...topics.flatMap((topic) => [topic.domainCode, topic.skillCode]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();

    return {
      ...lesson,
      topics,
      sections,
      domains,
      searchText,
      isCategorized: topics.length > 0,
    };
  });
}

export function filterLessonCatalog(
  lessons: readonly LessonCatalogItem[],
  filters: LessonCatalogFilters,
): LessonCatalogItem[] {
  const tokens = (filters.q ?? '')
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const filtered = lessons.filter((lesson) => {
    if (tokens.length > 0 && !tokens.every((token) => lesson.searchText.includes(token))) return false;
    if (filters.section && !lesson.sections.includes(filters.section as LessonSection)) return false;
    if (filters.domain && !lesson.domains.includes(filters.domain)) return false;
    if (filters.kind && lesson.kind !== filters.kind) return false;
    if (filters.status && lesson.status !== filters.status) return false;
    if (filters.categorization === 'categorized' && !lesson.isCategorized) return false;
    if (filters.categorization === 'uncategorized' && lesson.isCategorized) return false;
    return true;
  });

  return [...filtered].sort((a, b) => compareLessons(a, b, filters.sort));
}

export function getLessonCatalogFacets(
  lessons: readonly LessonCatalogItem[],
): LessonCatalogFacets {
  const sectionSet = new Set(lessons.flatMap((lesson) => lesson.sections));
  return {
    sections: (['reading_writing', 'math'] as LessonSection[])
      .filter((section) => sectionSet.has(section))
      .map((value) => ({ value, label: sectionLabel(value) })),
    domains: unique(lessons.flatMap((lesson) => lesson.domains)).sort((a, b) => a.localeCompare(b)),
    kinds: unique(lessons.map((lesson) => lesson.kind)).sort((a, b) => a.localeCompare(b)),
    statuses: unique(lessons.map((lesson) => lesson.status)).sort((a, b) => a.localeCompare(b)),
  };
}

export function getLessonScopeLabels(lesson: LessonCatalogItem): string[] {
  if (!lesson.isCategorized) return ['Uncategorized'];
  return unique([
    ...lesson.topics.map((topic) => topic.sectionLabel),
    ...lesson.topics.map((topic) => topic.domainName),
    ...lesson.topics.map((topic) => topic.skillName),
    ...lesson.topics.map((topic) => topic.patternName),
  ].filter((value): value is string => !!value));
}

function normalizeTopic(row: CatalogTopicRow): LessonCatalogTopic | null {
  const pattern = Array.isArray(row.question_patterns)
    ? row.question_patterns[0] ?? null
    : row.question_patterns;
  const grain: LessonTopicGrain | null = row.pattern_id
    ? 'pattern'
    : row.skill_code
      ? 'skill'
      : row.domain_name
        ? 'domain'
        : row.section
          ? 'section'
          : null;
  if (!grain) return null;

  const domain = findTopicDomain(row, pattern);
  const section = domain
    ? subjectToSection(domain.subjectCode)
    : normalizeSection(row.section);
  const skillCode = pattern?.skill_code ?? row.skill_code;
  const skill = domain?.skills.find((candidate) => candidate.code === skillCode) ?? null;

  return {
    grain,
    section,
    sectionLabel: section ? sectionLabel(section) : null,
    domainCode: domain?.code ?? pattern?.domain_code ?? null,
    domainName: domain?.name ?? row.domain_name,
    skillCode: skillCode ?? null,
    skillName: skill?.name ?? null,
    patternId: row.pattern_id,
    patternName: pattern?.name ?? null,
  };
}

function findTopicDomain(
  row: CatalogTopicRow,
  pattern: { domain_code: string; skill_code: string } | null,
): SatDomain | null {
  if (pattern?.domain_code) {
    return SAT_TAXONOMY.find((domain) => domain.code === pattern.domain_code) ?? null;
  }
  if (row.domain_name) {
    const normalizedName = row.domain_name.toLocaleLowerCase();
    const byName = SAT_TAXONOMY.find((domain) => domain.name.toLocaleLowerCase() === normalizedName);
    if (byName) return byName;
  }
  if (row.skill_code) {
    return SAT_TAXONOMY.find((domain) => (
      domain.skills.some((skill) => skill.code === row.skill_code)
    )) ?? null;
  }
  return null;
}

function normalizeSection(value: string | null | undefined): LessonSection | null {
  if (value === 'math') return 'math';
  if (value === 'reading_writing' || value === 'rw' || value === 'reading-writing') {
    return 'reading_writing';
  }
  return null;
}

function subjectToSection(subject: SatDomain['subjectCode']): LessonSection {
  return subject === 'rw' ? 'reading_writing' : 'math';
}

function getTopicSearchLabels(topics: LessonCatalogTopic[]): string[] {
  return topics.flatMap((topic) => [
    topic.sectionLabel,
    topic.domainName,
    topic.skillName,
    topic.patternName,
  ]).filter((value): value is string => !!value);
}

function topicKey(topic: LessonCatalogTopic): string {
  return [topic.grain, topic.section, topic.domainCode, topic.skillCode, topic.patternId].join('|');
}

function compareTopics(a: LessonCatalogTopic, b: LessonCatalogTopic): number {
  return GRAIN_ORDER[a.grain] - GRAIN_ORDER[b.grain]
    || (a.domainName ?? '').localeCompare(b.domainName ?? '')
    || (a.skillName ?? '').localeCompare(b.skillName ?? '')
    || (a.patternName ?? '').localeCompare(b.patternName ?? '');
}

function compareLessons(
  a: LessonCatalogItem,
  b: LessonCatalogItem,
  sort: LessonCatalogFilters['sort'],
): number {
  if (sort === 'title') return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  if (sort === 'curriculum') {
    const foundation = Number(a.kind !== 'foundation') - Number(b.kind !== 'foundation');
    return foundation
      || (a.foundation_sequence ?? Number.MAX_SAFE_INTEGER) - (b.foundation_sequence ?? Number.MAX_SAFE_INTEGER)
      || (a.sections[0] ?? '').localeCompare(b.sections[0] ?? '')
      || (a.domains[0] ?? '').localeCompare(b.domains[0] ?? '')
      || a.title.localeCompare(b.title)
      || a.id.localeCompare(b.id);
  }
  return (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
    || a.title.localeCompare(b.title)
    || a.id.localeCompare(b.id);
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}
