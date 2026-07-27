import test from 'node:test';
import assert from 'node:assert/strict';
import { generatedSpecToBlocks } from './generated-spec.mjs';
import { validateLessonBlocks } from './lesson-validation.mjs';

const deps = {
  resolveQuestion: async (hint) =>
    hint.skill_name === 'Linear functions' ? 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' : null,
  uploadFigureSvg: async () => 'https://cdn.example/fig.svg',
  sanitizeHtml: (html) => html,
};

function spec(blocks) {
  return { title: 'Test lesson', description: 'A test.', blocks };
}

test('converges a full generated spec into valid lesson blocks', async () => {
  const result = await generatedSpecToBlocks(
    spec([
      { kind: 'text', html: '<p>Intro</p>' },
      {
        kind: 'branching_question',
        question_html: '<p>Is \\(x^2 \\ge 0\\)?</p>',
        choices: [
          { id: 'yes', text: 'Yes' },
          { id: 'no', text: 'No' },
        ],
        correct_choice_id: 'yes',
        correct_html: '<p>Right.</p>',
        incorrect_html: '<p>Square a negative.</p>',
        rejoin_html: '<p>Onward.</p>',
      },
      {
        kind: 'raw_block',
        block_type: 'check',
        content: {
          prompt: 'Slope of \\(y=3x-2\\)?',
          choices: ['2', '3', '-2'],
          correct_index: 1,
          allow_retry: true,
          hint: 'Coefficient of x.',
          explanation: 'The coefficient of x is the slope.',
        },
      },
      {
        kind: 'question_suggestion',
        domain_name: 'Algebra',
        skill_name: 'Linear functions',
        difficulty: 2,
        note: 'Practice the slope tool.',
      },
      { kind: 'graph_image', graph_expressions: ['y=3x-2'], graph_caption: 'The line.' },
      { kind: 'video_placeholder', video_topic: 'Annotating a passage' },
      {
        kind: 'figure',
        figure: {
          points: [
            { name: 'A', x: 0, y: 0 },
            { name: 'B', x: 4, y: 0 },
            { name: 'C', x: 0, y: 3 },
          ],
          segments: [
            { from: 'A', to: 'B' },
            { from: 'B', to: 'C' },
            { from: 'C', to: 'A' },
          ],
        },
        figure_caption: 'Right triangle',
      },
    ]),
    deps,
  );

  const types = result.blocks.map((b) => b.block_type);
  assert.ok(types.includes('question_link'), 'resolved suggestion becomes question_link');
  assert.equal(types[types.length - 1], 'lesson_complete', 'closer appended last');
  assert.equal(result.pendingGraphs.length, 1);
  const graphIds = new Set(result.blocks.map((b) => String(b.content?.id)));
  assert.ok(graphIds.has(result.pendingGraphs[0].blockId), 'pending graph keyed to a real block');

  const video = result.blocks.find((b) => b.block_type === 'video');
  assert.equal(video.content.url, '');
  assert.match(video.content.caption, /Annotating a passage/);

  const figureBlock = result.blocks.find((b) => String(b.content?.html || '').includes('cdn.example/fig.svg'));
  assert.ok(figureBlock, 'figure rendered into an <img> text block');

  const retryCheck = result.blocks.find((b) => b.block_type === 'check' && b.content.allow_retry);
  assert.equal(retryCheck.content.correct_index, 1);

  const branchCheck = result.blocks.find((b) => b.block_type === 'check' && b.content.on_correct_block_id);
  assert.ok(branchCheck, 'branching_question compiled with branch fields');

  const validation = validateLessonBlocks(result.blocks);
  assert.deepEqual(validation.errors, [], 'converged output passes the shared validator');
});

test('strips dangling branch refs instead of failing', async () => {
  const result = await generatedSpecToBlocks(
    spec([
      {
        kind: 'raw_block',
        block_type: 'check',
        content: {
          id: 'q1',
          prompt: 'Pick.',
          choices: ['A', 'B'],
          correct_index: 0,
          on_incorrect_block_id: 'nowhere',
        },
      },
      { kind: 'text', html: '<p>Next</p>' },
    ]),
    deps,
  );
  const check = result.blocks.find((b) => b.block_type === 'check');
  assert.equal(check.content.on_incorrect_block_id, undefined);
  assert.ok(result.warnings.some((w) => w.includes('nowhere')));
  assert.deepEqual(validateLessonBlocks(result.blocks).errors, []);
});

test('allow_retry wins over branch fields on the same check', async () => {
  const result = await generatedSpecToBlocks(
    spec([
      {
        kind: 'raw_block',
        block_type: 'check',
        content: {
          id: 'q1',
          prompt: 'Pick.',
          choices: ['A', 'B'],
          correct_index: 0,
          allow_retry: true,
          on_correct_block_id: 'ok',
          rejoin_at_block_id: 'join',
        },
      },
      { kind: 'raw_block', block_type: 'text', content: { id: 'ok', html: '<p>ok</p>' } },
      { kind: 'raw_block', block_type: 'text', content: { id: 'join', html: '<p>join</p>' } },
    ]),
    deps,
  );
  const check = result.blocks.find((b) => b.block_type === 'check');
  assert.equal(check.content.allow_retry, true);
  assert.equal(check.content.on_correct_block_id, undefined);
  assert.equal(check.content.rejoin_at_block_id, undefined);
  assert.ok(result.warnings.some((w) => w.includes('allow_retry')));
});

test('disables AI-authored require_success gates and records which', async () => {
  const result = await generatedSpecToBlocks(
    spec([
      { kind: 'text', html: '<p>Intro</p>' },
      {
        kind: 'desmos_enter_expression',
        id: 'transfer',
        title: 'Build it',
        instructions_html: '<p>Type y=2x+1</p>',
        expression: 'y=2x+1',
        test_values: [-2, 0, 2],
        require_success: true,
      },
    ]),
    deps,
  );
  const desmos = result.blocks.find((b) => b.block_type === 'desmos_interactive');
  assert.equal(desmos.content.progression.require_success, false);
  assert.ok(result.warnings.some((w) => w.includes('require_success')));
});

test('falls back to a text block when a raw desmos_interactive is malformed', async () => {
  const result = await generatedSpecToBlocks(
    spec([
      { kind: 'text', html: '<p>Intro</p>' },
      {
        kind: 'raw_block',
        block_type: 'desmos_interactive',
        content: { id: 'bad', instructions_html: '<p>Type something</p>' },
      },
    ]),
    deps,
  );
  assert.ok(!result.blocks.some((b) => b.block_type === 'desmos_interactive'));
  const fallback = result.blocks.find((b) => String(b.content?.html || '').includes('Type something'));
  assert.equal(fallback.block_type, 'text');
  assert.ok(result.warnings.some((w) => w.includes('invalid Desmos activity')));
});

test('repairs lesson_complete placement and multiplicity', async () => {
  const result = await generatedSpecToBlocks(
    spec([
      { kind: 'raw_block', block_type: 'lesson_complete', content: { html: '<p>First closer</p>' } },
      { kind: 'text', html: '<p>Middle</p>' },
      { kind: 'raw_block', block_type: 'lesson_complete', content: { html: '<p>Real closer</p>' } },
      { kind: 'text', html: '<p>Tail</p>' },
    ]),
    deps,
  );
  const closers = result.blocks.filter((b) => b.block_type === 'lesson_complete');
  assert.equal(closers.length, 1);
  assert.match(closers[0].content.html, /Real closer/);
  assert.equal(result.blocks[result.blocks.length - 1].block_type, 'lesson_complete');
  assert.deepEqual(validateLessonBlocks(result.blocks).errors, []);
});

test('unresolved question_suggestion degrades to a text note', async () => {
  const result = await generatedSpecToBlocks(
    spec([
      { kind: 'text', html: '<p>Intro</p>' },
      { kind: 'question_suggestion', domain_name: 'Algebra', skill_name: 'Unknown skill', note: 'why' },
    ]),
    deps,
  );
  assert.ok(!result.blocks.some((b) => b.block_type === 'question_link'));
  const note = result.blocks.find((b) => String(b.content?.html || '').includes('Suggested practice'));
  assert.ok(note);
  assert.ok(result.warnings.some((w) => w.includes('Unknown skill')));
});

test('clamps out-of-range correct_index and drops unknown block types', async () => {
  const result = await generatedSpecToBlocks(
    spec([
      {
        kind: 'raw_block',
        block_type: 'check',
        content: { prompt: 'Pick.', choices: ['A', 'B'], correct_index: 7 },
      },
      { kind: 'raw_block', block_type: 'mystery', content: { html: '<p>?</p>' } },
    ]),
    deps,
  );
  const check = result.blocks.find((b) => b.block_type === 'check');
  assert.equal(check.content.correct_index, 0);
  assert.ok(result.warnings.some((w) => w.includes('correct_index')));
  assert.ok(!result.blocks.some((b) => b.block_type === 'mystery'));
  assert.ok(result.warnings.some((w) => w.includes('unsupported block_type')));
});

test('sanitizer runs on text and desmos HTML', async () => {
  const scrub = { ...deps, sanitizeHtml: (html) => html.replaceAll('<script>x</script>', '') };
  const result = await generatedSpecToBlocks(
    spec([
      { kind: 'text', html: '<p>Safe</p><script>x</script>' },
      {
        kind: 'desmos_enter_expression',
        title: 'Try',
        instructions_html: '<p>Do</p><script>x</script>',
        expression: 'y=x',
      },
    ]),
    scrub,
  );
  const text = result.blocks.find((b) => b.block_type === 'text');
  assert.equal(text.content.html, '<p>Safe</p>');
  const desmos = result.blocks.find((b) => b.block_type === 'desmos_interactive');
  assert.equal(desmos.content.instructions_html, '<p>Do</p>');
});
