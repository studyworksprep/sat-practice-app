import { SAT_TAXONOMY, type SatDomain } from '../practice/sat-taxonomy.ts';

export type LessonSection = 'reading_writing' | 'math';
export type LessonTopicGrain = 'section' | 'domain' | 'skill';

export interface LessonCatalogTopic {
  grain: LessonTopicGrain;
  section: LessonSection | null;
  sectionLabel: string | null;
  domainCode: string | null;
  domainName: string | null;
  skillCode: string | null;
  skillName: string | null;
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
}

/** The tag columns shared by lesson_topics and lesson_revision_topics. */
export type LessonTopicFields = Pick<CatalogTopicRow, 'section' | 'domain_name' | 'skill_code'>;

/**
 * One stored tag, the way every tag chip shows it: by the skill's name,
 * never by its code first. A lesson's chips used to read "H.A. · Algebra"
 * on the lesson page, and the library lists folded section and domain
 * names in ahead of skills and cut at four labels, so a stored skill tag
 * could look missing while the Add tag menu, which lists skills by name,
 * refused it as a duplicate.
 */
export interface LessonTopicChip {
  /** Stable per tag: grain, section, domain and skill. */
  key: string;
  /** Null only for a stored row with no section, domain or skill set. */
  grain: LessonTopicGrain | null;
  /** The skill's name for a skill tag, the domain's name for a domain
   *  tag, "Math section" / "Reading & Writing section" for a section tag. */
  label: string;
  /** Secondary text: the skill code (or, for a code outside the
   *  taxonomy, its domain); null for domain and section tags. */
  detail: string | null;
  /** Hover text: the whole tag, name first. */
  title: string;
}

/** A tag chip for one stored row, carrying the row id for removal. */
export interface LessonTopicRowChip extends LessonTopicChip {
  id: string;
}

/** Sections and skills the Add tag menu can still offer a lesson. */
export interface LessonTagMenu {
  sections: Array<{ value: LessonSection; label: string }>;
  domains: Array<{ code: string; name: string; skills: Array<{ code: string; name: string }> }>;
}

const GRAIN_ORDER: Record<LessonTopicGrain, number> = {
  section: 0,
  domain: 1,
  skill: 2,
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

/** One chip per tag, skills first in curriculum order, then whole
 *  domains, then whole sections. Empty for an uncategorized lesson. */
export function getLessonScopeChips(lesson: LessonCatalogItem): LessonTopicChip[] {
  return [...lesson.topics].sort(compareTopicsForChips).map(topicChip);
}

/** Describe one stored tag row (lesson_topics or lesson_revision_topics). */
export function describeLessonTopic(row: LessonTopicFields): LessonTopicChip | null {
  const topic = normalizeTopic(row);
  return topic ? topicChip(topic) : null;
}

/**
 * The lesson editor's chips: every stored row, in chip order, each with
 * its row id. A row that names nothing still gets an "Unknown tag" chip
 * so it can be seen and removed; no stored tag is ever left off.
 */
export function describeLessonTopicRows(
  rows: ReadonlyArray<LessonTopicFields & { id: string }>,
): LessonTopicRowChip[] {
  const known: Array<{ id: string; topic: LessonCatalogTopic }> = [];
  const unknown: LessonTopicRowChip[] = [];
  for (const row of rows) {
    const topic = normalizeTopic(row);
    if (topic) {
      known.push({ id: row.id, topic });
    } else {
      unknown.push({ id: row.id, key: `unknown|${row.id}`, grain: null, label: 'Unknown tag', detail: null, title: 'A tag with no section, domain or skill set' });
    }
  }
  return [
    ...known
      .sort((a, b) => compareTopicsForChips(a.topic, b.topic))
      .map(({ id, topic }) => ({ ...topicChip(topic), id })),
    ...unknown,
  ];
}

/**
 * What the Add tag menu may still offer: the sections and skills the
 * lesson is not tagged with yet. The database allows each tag once per
 * lesson, so offering one it already has can only fail. A skill counts
 * as tagged whatever its stored domain spelling is.
 */
export function untaggedLessonTagOptions(rows: ReadonlyArray<LessonTopicFields>): LessonTagMenu {
  const taggedSections = new Set<string>();
  const taggedSkills = new Set<string>();
  for (const row of rows) {
    const topic = normalizeTopic(row);
    if (!topic) continue;
    if (topic.grain === 'section' && topic.section) taggedSections.add(topic.section);
    if (topic.grain === 'skill' && topic.skillCode) taggedSkills.add(`${topic.domainCode ?? ''}|${topic.skillCode}`);
  }
  return {
    sections: (['math', 'reading_writing'] as LessonSection[])
      .filter((section) => !taggedSections.has(section))
      .map((value) => ({ value, label: sectionLabel(value) })),
    domains: SAT_TAXONOMY
      .map((domain) => ({
        code: domain.code,
        name: domain.name,
        skills: domain.skills
          .filter((skill) => !taggedSkills.has(`${domain.code}|${skill.code}`))
          .map((skill) => ({ code: skill.code, name: skill.name })),
      }))
      .filter((domain) => domain.skills.length > 0),
  };
}

function topicChip(topic: LessonCatalogTopic): LessonTopicChip {
  const key = topicKey(topic);
  if (topic.grain === 'skill') {
    const label = topic.skillName ?? topic.skillCode ?? 'Unknown skill';
    const detail = topic.skillName ? topic.skillCode : topic.domainName;
    const title = unique([label, topic.domainName, topic.skillCode].filter((v): v is string => !!v)).join(' · ');
    return { key, grain: 'skill', label, detail, title };
  }
  if (topic.grain === 'domain') {
    const label = topic.domainName ?? 'Unknown domain';
    return { key, grain: 'domain', label, detail: null, title: `Every skill in ${label}` };
  }
  const name = topic.sectionLabel ?? 'Unknown';
  return { key, grain: 'section', label: `${name} section`, detail: null, title: `Applies to the whole ${name} section` };
}

/** Curriculum position of each domain and skill, from the taxonomy. */
const CURRICULUM_RANK = new Map<string, number>();
SAT_TAXONOMY.forEach((domain, d) => {
  CURRICULUM_RANK.set(domain.code, d * 100);
  domain.skills.forEach((skill, s) => CURRICULUM_RANK.set(`${domain.code}|${skill.code}`, d * 100 + s + 1));
});

const CHIP_GRAIN_ORDER: Record<LessonTopicGrain, number> = { skill: 0, domain: 1, section: 2 };

function curriculumRank(topic: LessonCatalogTopic): number {
  const rank =
    topic.grain === 'skill'
      ? CURRICULUM_RANK.get(`${topic.domainCode ?? ''}|${topic.skillCode ?? ''}`)
      : topic.grain === 'domain'
        ? CURRICULUM_RANK.get(topic.domainCode ?? '')
        : topic.section === 'math' ? 0 : 1;
  return rank ?? Number.MAX_SAFE_INTEGER;
}

/** Chip order: skills first in curriculum order, then whole domains,
 *  then whole sections; tags outside the taxonomy after the rest. */
function compareTopicsForChips(a: LessonCatalogTopic, b: LessonCatalogTopic): number {
  return CHIP_GRAIN_ORDER[a.grain] - CHIP_GRAIN_ORDER[b.grain]
    || curriculumRank(a) - curriculumRank(b)
    || topicChipLabel(a).localeCompare(topicChipLabel(b));
}

function topicChipLabel(topic: LessonCatalogTopic): string {
  return topic.skillName ?? topic.skillCode ?? topic.domainName ?? topic.sectionLabel ?? '';
}

function normalizeTopic(row: LessonTopicFields): LessonCatalogTopic | null {
  const grain: LessonTopicGrain | null = row.skill_code
    ? 'skill'
    : row.domain_name
      ? 'domain'
      : row.section
        ? 'section'
        : null;
  if (!grain) return null;

  const domain = findTopicDomain(row);
  const section = domain
    ? subjectToSection(domain.subjectCode)
    : normalizeSection(row.section);
  const skillCode = row.skill_code;
  const skill = domain?.skills.find((candidate) => candidate.code === skillCode) ?? null;

  return {
    grain,
    section,
    sectionLabel: section ? sectionLabel(section) : null,
    domainCode: domain?.code ?? null,
    domainName: domain?.name ?? row.domain_name,
    skillCode: skillCode ?? null,
    skillName: skill?.name ?? null,
  };
}

function findTopicDomain(row: LessonTopicFields): SatDomain | null {
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
  ]).filter((value): value is string => !!value);
}

function topicKey(topic: LessonCatalogTopic): string {
  return [topic.grain, topic.section, topic.domainCode ?? topic.domainName, topic.skillCode].join('|');
}

function compareTopics(a: LessonCatalogTopic, b: LessonCatalogTopic): number {
  return GRAIN_ORDER[a.grain] - GRAIN_ORDER[b.grain]
    || (a.domainName ?? '').localeCompare(b.domainName ?? '')
    || (a.skillName ?? '').localeCompare(b.skillName ?? '');
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
