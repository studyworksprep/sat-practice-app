// Scope-aware lesson-brief prefills for /admin/lessons/generate
// (docs/foundations-and-question-patterns.md §3.4 step 2).
//
// The generate page accepts ?skill=<skill_code> or ?pattern=<uuid>
// (from the /admin/content/units worklist and, later, the pattern
// catalog). The prefill carries the SCOPE FACTS — taxonomy names,
// bank depth and difficulty mix, expected minutes, and for patterns
// the recognition cue + process — into the brief textarea as a
// starting point the admin edits. The pedagogy itself stays in the
// shared prompt template, not here.

import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import type { TypedSupabaseClient } from '@/lib/supabase/server';

const MATH_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

interface SkillFacts {
  domainCode: string;
  domainName: string;
  skillCode: string;
  skillName: string;
  section: 'Math' | 'Reading & Writing';
  expectedMinutes: number | null;
  questionCount: number;
  difficultyMix: { easy: number; medium: number; hard: number };
}

function findSkill(skillCode: string) {
  for (const domain of SAT_TAXONOMY) {
    const skill = domain.skills.find((s) => s.code === skillCode);
    if (skill) return { domain, skill };
  }
  return null;
}

function difficultyMixLine(mix: SkillFacts['difficultyMix'], total: number): string {
  if (total === 0) return 'no published questions yet';
  return `${total} published question${total === 1 ? '' : 's'} (${mix.easy} easy, ${mix.medium} medium, ${mix.hard} hard)`;
}

async function loadSkillFacts(
  supabase: TypedSupabaseClient,
  skillCode: string,
): Promise<SkillFacts | null> {
  const found = findSkill(skillCode);
  if (!found) return null;

  const [{ data: unit }, { data: questions }] = await Promise.all([
    supabase
      .from('curriculum_units')
      .select('expected_minutes')
      .eq('test_type', 'sat')
      .eq('skill_code', skillCode)
      .maybeSingle(),
    supabase
      .from('questions_v2')
      .select('difficulty')
      .eq('is_published', true)
      .eq('is_broken', false)
      .is('deleted_at', null)
      .eq('skill_code', skillCode),
  ]);

  const mix = { easy: 0, medium: 0, hard: 0 };
  for (const q of questions ?? []) {
    if (q.difficulty === 1) mix.easy += 1;
    else if (q.difficulty === 2) mix.medium += 1;
    else if (q.difficulty === 3) mix.hard += 1;
  }

  return {
    domainCode: found.domain.code,
    domainName: found.domain.name,
    skillCode,
    skillName: found.skill.name,
    section: MATH_DOMAINS.has(found.domain.code) ? 'Math' : 'Reading & Writing',
    expectedMinutes: unit?.expected_minutes ?? null,
    questionCount: (questions ?? []).length,
    difficultyMix: mix,
  };
}

export function formatSkillBrief(facts: SkillFacts): string {
  const lines = [
    `Lesson for the SAT skill "${facts.skillName}" — ${facts.domainName} domain (unit ${facts.skillCode}, ${facts.section} section).`,
    '',
    `Bank context for calibration: ${difficultyMixLine(facts.difficultyMix, facts.questionCount)}.${
      facts.expectedMinutes ? ` Target length: about ${facts.expectedMinutes} minutes.` : ''
    }`,
    '',
    'Focus: [describe the ONE specific, reusable tool this lesson should teach within the skill — the recognizable question format and the process to run on it]',
  ];
  return lines.join('\n');
}

export async function buildSkillBrief(
  supabase: TypedSupabaseClient,
  skillCode: string,
): Promise<string | null> {
  const facts = await loadSkillFacts(supabase, skillCode);
  return facts ? formatSkillBrief(facts) : null;
}

export async function buildPatternBrief(
  supabase: TypedSupabaseClient,
  patternId: string,
): Promise<string | null> {
  const { data: pattern } = await supabase
    .from('question_patterns')
    .select('domain_code, skill_code, name, recognition_cue, process_summary')
    .eq('id', patternId)
    .maybeSingle();
  if (!pattern) return null;

  const [facts, { count }] = await Promise.all([
    loadSkillFacts(supabase, pattern.skill_code),
    supabase
      .from('questions_v2')
      .select('id', { count: 'exact', head: true })
      .eq('is_published', true)
      .eq('is_broken', false)
      .is('deleted_at', null)
      .eq('pattern_id', patternId),
  ]);

  const skillLabel = facts
    ? `skill ${pattern.skill_code} (${facts.skillName}, ${facts.domainName}, ${facts.section} section)`
    : `skill ${pattern.skill_code}`;

  const lines = [
    `Question-pattern lesson for "${pattern.name}" — a recognizable format under ${skillLabel}.`,
    '',
    `Recognition cue (open the lesson with this): ${pattern.recognition_cue}`,
  ];
  if (pattern.process_summary) {
    lines.push(`Process to teach: ${pattern.process_summary}`);
  }
  lines.push(
    '',
    `Bank context: ${count ?? 0} published question${count === 1 ? '' : 's'} classified to this pattern${
      facts ? ` (of ${facts.questionCount} in the skill)` : ''
    }.${facts?.expectedMinutes ? ` Target length: about ${facts.expectedMinutes} minutes.` : ''}`,
    '',
    'Structure: recognition cue up front ("when you see…"), then the numbered process, one worked example, and 2-3 checks with branch/rejoin remediation on the realistic mistakes.',
  );
  return lines.join('\n');
}
