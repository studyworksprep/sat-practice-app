// Generate seed SQL for the approved November 2026 lesson drill catalog.
// It can be applied again without replacing any post-import staff edits.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { findSkill, SAT_TAXONOMY } from '../lib/practice/sat-taxonomy.ts';
import { gradeSprAnswer } from '../lib/practice/spr-grade.mjs';
import { sanitizeQuestionHtml } from '../lib/sanitize.ts';

interface Lesson {
  number: number;
  id: string;
  file: string;
  sha256: string;
  question_count: number;
}

interface Drill {
  id: string;
  sequence: number;
  difficulty: number;
  phase: 'practice' | 'later_review';
  task_scope: string;
  response_type: 'mcq' | 'numeric';
  stem_html: string;
  stimulus_html: string | null;
  choices: string[];
  explanation_html: string;
  correct_index?: number;
  accepted_answers?: string[];
  numeric_tolerance?: number;
}

const root = new URL('../content/drill-questions/lesson-bank-2026-11-20/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')) as {
  batch_id: string;
  lessons: Lesson[];
  total_question_count: number;
};

// Broad strategy lessons keep a section for layout and calculator access.
// They do not assign every attempt to a single skill.
const setTaxonomy = [
  'P.A.', 'BOU', 'BOU', 'BOU', 'TRA', 'S.D.', 'S.D.', 'COE', 'P.A.', 'P.A.', 'P.A.',
  'Q.D.', 'P.A.', 'math', 'Q.E.', 'math', 'CID', 'math', 'INI', 'INF', 'FSS', 'CTC',
  'TSP', 'BOU', 'INI', 'Q.A.', 'Q', 'S.B.', 'SYN', 'S.C.', 'H.E.', 'P.B.', 'Q.B.',
  'Q.B.', 'BOU', 'FSS', 'math', 'WIC', 'math', 'math', 'S.C.', 'H.D.', 'P.A.',
  'Q.C.', 'Q.C.', 'math', 'S.A.',
];

function taxonomy(code: string) {
  const domain = SAT_TAXONOMY.find(({ code: domainCode, skills }) =>
    domainCode === code || skills.some(({ code: skillCode }) => skillCode === code),
  );
  assert.ok(domain || code === 'math', code);
  const skill = findSkill(domain?.code, code);
  return {
    domain_code: domain?.code ?? 'math',
    domain_name: domain?.name ?? 'Math',
    skill_code: skill?.code ?? null,
    skill_name: skill?.name ?? null,
  };
}

const ids = new Set<string>();
const rows = manifest.lessons.flatMap((lesson) => {
  const source = readFileSync(new URL(lesson.file, root));
  assert.equal(createHash('sha256').update(source).digest('hex'), lesson.sha256, lesson.file);
  const bank = JSON.parse(source.toString('utf8')) as { id: string; questions: Drill[] };
  assert.equal(bank.id, lesson.id);
  assert.equal(bank.questions.length, lesson.question_count);
  const sequences = new Set<number>();
  return bank.questions.map((question) => {
    const { id, sequence } = question;
    assert.ok(!ids.has(id) && !sequences.has(sequence), id);
    assert.ok(Number.isInteger(sequence) && sequence >= 1 && sequence <= bank.questions.length, id);
    ids.add(id);
    sequences.add(sequence);
    assert.equal(question.task_scope, 'complete_skill_application', id);
    assert.ok([1, 2, 3].includes(question.difficulty), id);
    assert.ok(['practice', 'later_review'].includes(question.phase), id);
    assert.ok(['mcq', 'numeric'].includes(question.response_type), id);

    const options = question.response_type === 'mcq'
      ? question.choices.map((html, index) => ({
          label: String.fromCharCode(65 + index),
          content_html: sanitizeQuestionHtml(html),
        }))
      : null;
    const correctOption = options?.[question.correct_index ?? -1];
    const accepted = question.accepted_answers ?? [];
    if (options) {
      assert.ok(options.length === 4 && correctOption, id);
    } else {
      assert.ok(accepted.length && accepted.every((answer) => /^-?\d+(?:[./]\d+)?$/.test(answer)), id);
      assert.ok(Number.isFinite(question.numeric_tolerance) && question.numeric_tolerance! >= 0, id);
    }
    const correct = correctOption
      ? { option_label: correctOption.label }
      : { text: JSON.stringify(accepted), tolerance: question.numeric_tolerance };
    if (!correctOption) {
      assert.ok(accepted.every((answer) => gradeSprAnswer(answer, correct)), id);
    }

    return {
      lesson_id: lesson.id,
      drill_phase: question.phase,
      drill_sequence: sequence,
      display_code: 'LD-' + id,
      source_external_id: manifest.batch_id + ':' + id,
      ...taxonomy(setTaxonomy[lesson.number - 1]),
      difficulty: question.difficulty,
      question_type: options ? 'mcq' : 'spr',
      stimulus_html: question.stimulus_html ? sanitizeQuestionHtml(question.stimulus_html) : null,
      stem_html: sanitizeQuestionHtml(question.stem_html),
      options,
      correct_answer: correct,
      rationale_html: sanitizeQuestionHtml(question.explanation_html),
    };
  });
});
assert.equal(rows.length, manifest.total_question_count);
assert.equal(manifest.lessons.length, setTaxonomy.length);
const payload = JSON.stringify(rows);
assert.ok(!payload.includes('$lesson_drills$'));

process.stdout.write(
  '-- Generated from the approved draft catalog with scripts/build-lesson-drill-import.ts.\n' +
  'with approved as (\n' +
  '  select * from jsonb_to_recordset($lesson_drills$' + payload + '$lesson_drills$::jsonb) as q(\n' +
  '    lesson_id uuid, drill_phase text, drill_sequence integer, display_code text, source_external_id text,\n' +
  '    domain_code text, domain_name text, skill_code text, skill_name text, difficulty smallint,\n' +
  '    question_type text, stimulus_html text, stem_html text, options jsonb, correct_answer jsonb, rationale_html text\n' +
  '  )\n' +
  ')\n' +
  'insert into public.questions_v2 (\n' +
  '  drill_lesson_id, drill_phase, drill_sequence, display_code, source_external_id,\n' +
  '  domain_code, domain_name, skill_code, skill_name, difficulty, question_type,\n' +
  '  stimulus_html, stem_html, options, correct_answer, rationale_html, source, pool, is_published\n' +
  ')\n' +
  'select l.id, q.drill_phase, q.drill_sequence, q.display_code, q.source_external_id,\n' +
  '  q.domain_code, q.domain_name, q.skill_code, q.skill_name, q.difficulty, q.question_type,\n' +
  "  q.stimulus_html, q.stem_html, q.options, q.correct_answer, q.rationale_html, 'lesson_drill', 'lesson_drill', true\n" +
  'from approved q join public.lessons l on l.id = q.lesson_id and l.status = \x27published\x27\n' +
  'on conflict (source, source_external_id) where source_external_id is not null do nothing;\n',
);
