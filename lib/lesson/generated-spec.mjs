// AI lesson generation → LessonTemplateSpec convergence layer.
//
// The generator's model output IS a LessonTemplateSpec (the same format
// docs/lesson-json-authoring-guide.md defines for Import from JSON),
// extended with four generator-only kinds the model needs because it
// cannot mint URLs, UUIDs, or images:
//
//   - question_suggestion — taxonomy hint, resolved to a real published
//     questions_v2 id (→ question_link) or a text note on a miss.
//   - figure             — declarative geometry spec, rendered to SVG
//     server-side and uploaded (→ text block with an <img>).
//   - graph_image        — Desmos expressions; the server emits a
//     placeholder text block + a PendingGraph the preview client
//     renders, screenshots, and swaps in (Desmos is browser-only).
//   - video_placeholder  — topic only; an admin sources the URL later.
//
// Pipeline: resolveGeneratorKinds → compileLessonTemplateSpec (the
// import compiler — one contract, one compiler) → normalizeCompiledBlocks
// (the model-output trust boundary: sanitize HTML, drop malformed
// blocks with warnings instead of failing the generation, strip
// dangling branch refs, enforce the lesson_complete invariants, and
// disable AI-authored hard gates).
//
// Dependencies with side effects (DB lookup, storage upload, HTML
// sanitizer) are injected so this module stays node --test testable.

import { compileLessonTemplateSpec } from './template-import.mjs';
import {
  parseDesmosInteractiveContent,
  validateLessonCalculatorPresentation,
} from './desmos-interactive.mjs';
import { recomputeSortOrders } from './editor-utils.mjs';
import { renderFigureSvg } from '../figures/figure-renderer.mjs';

const ALLOWED_BLOCK_TYPES = new Set([
  'text',
  'video',
  'check',
  'question_link',
  'desmos_interactive',
  'lesson_complete',
]);

const BRANCH_FIELDS = ['on_correct_block_id', 'on_incorrect_block_id', 'rejoin_at_block_id'];

function escapeHtml(input) {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function cleanStrings(v) {
  return (Array.isArray(v) ? v : [])
    .filter((s) => typeof s === 'string' && s.trim() !== '')
    .map((s) => s.trim());
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// ── Step 1: resolve generator-only kinds into pure spec entries ──────

async function resolveGeneratorKinds(specBlocks, deps, warnings, pendingGraphs) {
  const out = [];
  let counter = 0;

  for (let i = 0; i < specBlocks.length; i++) {
    const raw = specBlocks[i] ?? {};
    const kind = typeof raw.kind === 'string' ? raw.kind : '';
    const label = `Block ${i + 1} (${kind || 'unknown'})`;
    counter += 1;

    if (kind === 'question_suggestion') {
      const domainName = str(raw.domain_name);
      const skillName = str(raw.skill_name);
      const note = str(raw.note);
      const difficulty =
        Number.isInteger(raw.difficulty) && raw.difficulty >= 1 && raw.difficulty <= 3
          ? raw.difficulty
          : null;

      let questionId = null;
      if (domainName && skillName) {
        questionId = await deps.resolveQuestion({
          domain_name: domainName,
          skill_name: skillName,
          difficulty,
        });
      }

      if (questionId) {
        out.push({
          kind: 'raw_block',
          block_type: 'question_link',
          content: { id: `gen_qlink_${counter}`, question_id: questionId },
        });
      } else {
        const parts = [skillName || domainName || 'a related skill', note].filter(Boolean);
        out.push({
          kind: 'text',
          id: `gen_qnote_${counter}`,
          html: `<p><em>Suggested practice:</em> ${escapeHtml(parts.join(' — '))}</p>`,
        });
        warnings.push(
          `${label}: no published bank question matched "${domainName} / ${skillName}" — inserted a text note instead.`,
        );
      }
      continue;
    }

    if (kind === 'figure') {
      const caption = str(raw.figure_caption);
      try {
        if (!deps.uploadFigureSvg) throw new Error('no figure upload configured');
        const rendered = renderFigureSvg(raw.figure);
        for (const w of rendered.warnings) warnings.push(`${label}: ${w}`);
        const url = await deps.uploadFigureSvg(rendered.svg);
        // Plain p/img/em markup (no <figure> wrapper) so the block
        // round-trips through the TipTap editor unharmed.
        out.push({
          kind: 'text',
          id: `gen_figure_${counter}`,
          html:
            `<p><img src="${escapeHtml(url)}" alt="${escapeHtml(caption || 'Geometry figure')}" width="${rendered.width}" /></p>` +
            (caption ? `<p><em>${escapeHtml(caption)}</em></p>` : ''),
        });
      } catch (e) {
        const note = caption || 'A figure was planned here but could not be rendered.';
        out.push({
          kind: 'text',
          id: `gen_figure_${counter}`,
          html: `<p><em>[Figure: ${escapeHtml(note)}]</em></p>`,
        });
        warnings.push(
          `${label}: figure could not be rendered/uploaded (${e instanceof Error ? e.message : 'unknown'}) — inserted a placeholder note.`,
        );
      }
      continue;
    }

    if (kind === 'graph_image') {
      const expressions = cleanStrings(raw.graph_expressions);
      const caption = str(raw.graph_caption);
      if (expressions.length === 0) {
        warnings.push(`${label}: graph_image with no expressions — dropped.`);
        continue;
      }
      const vp = raw.graph_viewport && typeof raw.graph_viewport === 'object' ? raw.graph_viewport : null;
      const n = (k) => (vp && typeof vp[k] === 'number' && Number.isFinite(vp[k]) ? vp[k] : null);
      const [xmin, xmax, ymin, ymax] = [n('xmin'), n('xmax'), n('ymin'), n('ymax')];
      const viewport =
        xmin !== null && xmax !== null && ymin !== null && ymax !== null && xmin < xmax && ymin < ymax
          ? { xmin, xmax, ymin, ymax }
          : null;

      const id = `gen_graph_${counter}`;
      out.push({
        kind: 'text',
        id,
        html:
          '<p><em>[Rendering graph image…]</em></p>' +
          (caption ? `<p><em>${escapeHtml(caption)}</em></p>` : ''),
      });
      pendingGraphs.push({ blockId: id, expressions, viewport, caption });
      continue;
    }

    if (kind === 'video_placeholder') {
      const topic = str(raw.video_topic);
      out.push({
        kind: 'raw_block',
        block_type: 'video',
        content: {
          id: `gen_video_${counter}`,
          url: '',
          caption: topic ? `Video placeholder: ${topic}` : 'Video placeholder',
        },
      });
      continue;
    }

    out.push(raw);
  }

  return out;
}

// ── Step 3: normalize compiled blocks (the trust boundary) ──────────

function normalizeCheckContent(content, label, warnings) {
  const prompt = str(content.prompt);
  const choices = cleanStrings(content.choices);
  if (!prompt || choices.length < 2) {
    warnings.push(`${label}: check needs a prompt and at least 2 choices — dropped.`);
    return null;
  }
  let correctIndex = content.correct_index;
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
    warnings.push(`${label}: correct_index was out of range — reset to the first choice; review it.`);
    correctIndex = 0;
  }
  const next = { ...content, prompt, choices, correct_index: correctIndex };

  // Guide §3b: retry keeps the learner on the one block; branching
  // routes them elsewhere. The two are mutually exclusive.
  if (next.allow_retry && BRANCH_FIELDS.some((f) => next[f])) {
    for (const f of BRANCH_FIELDS) delete next[f];
    warnings.push(
      `${label}: allow_retry and branch fields cannot be combined — kept the retry, removed the branching.`,
    );
  }
  return next;
}

function normalizeCompiledBlocks(blocks, sanitizeHtml, warnings) {
  const out = [];
  const gatedIds = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] ?? {};
    const content = { ...(block.content || {}) };
    const label = `Block "${content.id || block.id || i + 1}" (${block.block_type})`;

    if (!ALLOWED_BLOCK_TYPES.has(block.block_type)) {
      warnings.push(`${label}: unsupported block_type — dropped.`);
      continue;
    }

    // Calculator presentation is optional sugar — an invalid object
    // must not fail the draft, just fall back to the default pane.
    if (content.calculator !== undefined) {
      const problems = validateLessonCalculatorPresentation(content.calculator);
      if (problems.length > 0) {
        delete content.calculator;
        warnings.push(`${label}: invalid calculator presentation (${problems[0]}) — removed it.`);
      }
    }

    if (block.block_type === 'text') {
      const html = sanitizeHtml(str(content.html));
      if (!html.trim()) {
        warnings.push(`${label}: empty text content after sanitization — dropped.`);
        continue;
      }
      const next = { ...content, html };
      if (typeof next.explanation_html === 'string') {
        next.explanation_html = sanitizeHtml(next.explanation_html);
      }
      out.push({ ...block, content: next });
      continue;
    }

    if (block.block_type === 'check') {
      const next = normalizeCheckContent(content, label, warnings);
      if (!next) continue;
      out.push({ ...block, content: next });
      continue;
    }

    if (block.block_type === 'video') {
      // The model can never know a real URL; anything non-empty is
      // invented and must not reach students.
      if (str(content.url)) {
        warnings.push(`${label}: video URLs cannot be AI-generated — cleared it; an admin adds the URL in the editor.`);
      }
      out.push({
        ...block,
        content: { ...content, url: '', caption: str(content.caption) || 'Video placeholder' },
      });
      continue;
    }

    if (block.block_type === 'question_link') {
      if (!str(content.question_id)) {
        warnings.push(`${label}: question_link without a question_id — dropped.`);
        continue;
      }
      out.push({ ...block, content });
      continue;
    }

    if (block.block_type === 'lesson_complete') {
      out.push({
        ...block,
        content: {
          ...content,
          html: sanitizeHtml(str(content.html)) || '<p>You&rsquo;ve completed the lesson. Great work!</p>',
          button_label: str(content.button_label) || 'Complete Lesson',
        },
      });
      continue;
    }

    // desmos_interactive
    for (const key of ['instructions_html', 'caption_html']) {
      if (typeof content[key] === 'string') content[key] = sanitizeHtml(content[key]);
    }
    if (content.feedback && typeof content.feedback === 'object') {
      const fb = { ...content.feedback };
      for (const key of ['success_message_html', 'retry_message_html', 'solution_html']) {
        if (typeof fb[key] === 'string') fb[key] = sanitizeHtml(fb[key]);
      }
      for (const key of ['targeted_hints', 'attempt_based_hints']) {
        if (Array.isArray(fb[key])) {
          fb[key] = fb[key].map((h) =>
            h && typeof h === 'object' && typeof h.message_html === 'string'
              ? { ...h, message_html: sanitizeHtml(h.message_html) }
              : h,
          );
        }
      }
      content.feedback = fb;
    }

    // An AI-authored equivalence check that is subtly wrong must never
    // hard-block a student. Gates arrive disabled; the warning below
    // tells the admin exactly which blocks to verify and re-enable.
    if (content.progression && typeof content.progression === 'object') {
      if (content.progression.require_success === true) {
        content.progression = { ...content.progression, require_success: false };
        gatedIds.push(String(content.id || block.id || i + 1));
      }
    }

    try {
      parseDesmosInteractiveContent(content);
    } catch (e) {
      const instructions = str(content.instructions_html);
      out.push({
        ...block,
        block_type: 'text',
        content: {
          id: content.id || block.id,
          html: `<p><strong>Try it in Desmos:</strong></p>${instructions || '<p><em>(instructions missing)</em></p>'}`,
        },
      });
      warnings.push(
        `${label}: invalid Desmos activity (${e instanceof Error ? e.message : 'unknown'}) — kept the instructions as a text block.`,
      );
      continue;
    }
    out.push({ ...block, content });
  }

  if (gatedIds.length > 0) {
    warnings.push(
      `Desmos gating (require_success) was disabled on: ${gatedIds.join(', ')}. ` +
        'The lesson intends these to gate progress — verify the expected expressions in the editor, then re-enable the gate there.',
    );
  }

  return out;
}

function stripDanglingBranchRefs(blocks, warnings) {
  const idSet = new Set();
  for (const b of blocks) {
    if (b.id != null && String(b.id) !== '') idSet.add(String(b.id));
    const cid = b?.content?.id;
    if (cid != null && String(cid) !== '') idSet.add(String(cid));
  }
  return blocks.map((block, i) => {
    const content = block.content || {};
    const dangling = BRANCH_FIELDS.filter((f) => content[f] && !idSet.has(String(content[f])));
    if (dangling.length === 0) return block;
    const next = { ...content };
    for (const f of dangling) {
      warnings.push(
        `Block "${content.id || block.id || i + 1}": ${f} pointed to a missing block ("${content[f]}") — removed; the lesson continues linearly there.`,
      );
      delete next[f];
    }
    return { ...block, content: next };
  });
}

// At most one lesson_complete, and it must be last (validator errors
// otherwise). Model slips are repaired rather than failing the draft;
// a missing closer gets the default one, preserving today's behavior.
function enforceLessonComplete(blocks, warnings) {
  const completes = blocks.filter((b) => b.block_type === 'lesson_complete');
  const rest = blocks.filter((b) => b.block_type !== 'lesson_complete');
  if (rest.length === 0) return [];

  let closer;
  if (completes.length === 0) {
    closer = {
      id: 'gen_lesson_complete',
      block_type: 'lesson_complete',
      content: {
        id: 'gen_lesson_complete',
        html: '<p>You&rsquo;ve completed the lesson. Great work!</p>',
        button_label: 'Complete Lesson',
      },
    };
  } else {
    closer = completes[completes.length - 1];
    if (completes.length > 1) {
      warnings.push('Multiple lesson_complete blocks — kept only the last one.');
    }
    if (blocks[blocks.length - 1]?.block_type !== 'lesson_complete') {
      warnings.push('The lesson_complete block was not last — moved it to the end.');
    }
  }
  return [...rest, closer];
}

// ── Entry point ─────────────────────────────────────────────────────

/**
 * Turns the model's generated LessonTemplateSpec into lesson_blocks
 * rows, warnings, and pending browser-rendered graphs.
 *
 * @param {object} generated  { title, description, blocks } — spec blocks
 *   may include the generator-only kinds documented at the top.
 * @param {object} deps
 * @param {(hint: {domain_name, skill_name, difficulty}) => Promise<string|null>} deps.resolveQuestion
 * @param {(svg: string) => Promise<string>} [deps.uploadFigureSvg]
 * @param {(html: string) => string} deps.sanitizeHtml
 */
export async function generatedSpecToBlocks(generated, deps) {
  const warnings = [];
  const pendingGraphs = [];
  const specBlocks = Array.isArray(generated?.blocks) ? generated.blocks : [];

  const pureBlocks = await resolveGeneratorKinds(specBlocks, deps, warnings, pendingGraphs);
  const compiled = compileLessonTemplateSpec({
    title: generated?.title,
    description: generated?.description,
    blocks: pureBlocks,
  });

  // Compile errors drop their spec block; surface them as warnings so
  // the admin sees the gap, but never fail the whole generation.
  for (const issue of compiled.issues) {
    if (issue.severity === 'error') {
      warnings.push(`Spec ${issue.path}: ${issue.message}${issue.suggestion ? ` ${issue.suggestion}` : ''}`);
    }
  }

  let blocks = normalizeCompiledBlocks(compiled.blocks, deps.sanitizeHtml, warnings);
  blocks = enforceLessonComplete(blocks, warnings);
  blocks = stripDanglingBranchRefs(blocks, warnings);
  blocks = recomputeSortOrders(blocks);

  // The compiler may have renamed a pending graph's content id on
  // collision; re-key by exact match first, then prefix.
  const finalIds = new Set(blocks.map((b) => String(b?.content?.id || '')));
  const keptGraphs = [];
  for (const g of pendingGraphs) {
    if (finalIds.has(g.blockId)) {
      keptGraphs.push(g);
      continue;
    }
    const renamed = [...finalIds].find((id) => id.startsWith(`${g.blockId}_`));
    if (renamed) {
      keptGraphs.push({ ...g, blockId: renamed });
    } else {
      warnings.push(`Graph image block "${g.blockId}" was dropped before rendering.`);
    }
  }

  return { blocks, warnings, pendingGraphs: keptGraphs };
}
