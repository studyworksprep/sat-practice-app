// Item-quality linter (lesson-improvement plan step 2.1).
//
// The validator (lesson-validation.mjs) asks "is this spec well-formed?";
// this linter asks "do the items measure the skill, or can a test-wise
// student beat them?" Every finding is a WARNING — the rules are
// heuristics with legitimate exceptions, so a human closes or defers
// each one (the punch list in docs/lesson-lint-punch-list-2026-08.md).
// CI prints the report but never fails on lint warnings.
//
// Operates on COMPILED blocks (same shape the validator sees), so all
// authoring kinds — raw_block checks, branching_question — are covered.

const EXTREME_WORDS = ['all', 'every', 'only', 'must', 'proved', 'never', 'always'];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'from',
  'with', 'for', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'it',
  'its', 'this', 'that', 'these', 'those', 'then', 'than', 'into', 'your',
  'you', 'each', 'both', 'first', 'second', 'third', 'answer', 'choice',
  'question', 'questions', 'problem', 'problems', 'lesson', 'use', 'using',
  'used', 'solve', 'solving', 'find', 'finding', 'make', 'every', 'when',
  'what', 'which', 'where', 'how', 'why', 'not', 'they', 'them', 'their',
]);

// Titles contribute the lesson's key terms (rule: key-term echo). Words
// that name techniques generically don't identify a giveaway.
const TITLE_NOISE = new Set([
  ...STOPWORDS, 'sat', 'desmos', 'questions', 'strategy', 'understand',
  'recognize', 'read', 'reason', 'through', 'place', 'choose', 'precise',
]);

// ─── text normalization ───────────────────────────────────────────

// Reduce spec text (plain text + LaTeX + occasional HTML) to comparable
// prose: \frac becomes a slash fraction so numeric equivalence can read
// it, then delimiters, commands, braces, and tags drop away.
export function normalizeItemText(text) {
  return String(text ?? '')
    .replace(/\\[td]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1/$2)')
    .replace(/\\operatorname\{([^{}]*)\}/g, '$1')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, ' ')
    .replace(/\\%/g, '%')
    // Keep command NAMES as words — \tan vs \cos is the difference
    // between two choices; deleting them would merge distinct items.
    .replace(/\\([a-zA-Z]+)/g, ' $1 ')
    .replace(/[{}~]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentWords(text) {
  return new Set(
    normalizeItemText(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  );
}

// Key terms a lesson's title contributes: adjacent-word bigrams first
// (\"scale factor\", \"standard deviation\") plus distinctive single words.
export function titleKeyTerms(title) {
  const words = normalizeItemText(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const terms = new Set();
  // Each term also contributes its de-pluralized variant, so a title's
  // "scale factors" still matches a choice's "scale factor".
  const singular = (w) => (w.length >= 5 && w.endsWith('s') ? w.slice(0, -1) : w);
  for (let i = 0; i < words.length - 1; i += 1) {
    if (!TITLE_NOISE.has(words[i]) && !TITLE_NOISE.has(words[i + 1])) {
      terms.add(`${words[i]} ${words[i + 1]}`);
      terms.add(`${singular(words[i])} ${singular(words[i + 1])}`);
    }
  }
  for (const w of words) {
    if (w.length >= 6 && !TITLE_NOISE.has(w)) {
      terms.add(w);
      terms.add(singular(w));
    }
  }
  return [...terms];
}

// A choice's numeric value, when the whole choice is one bare numeric
// token: plain number, fraction, or ratio. Percents are their own kind
// so \"50%\" never equals \"50\". Equations (\"x = 6\") get NO value — the
// variable name and its case are the answer's substance in Desmos
// lessons (\"x = 6\" vs \"X = 6\" are different answers).
export function choiceNumericValue(text) {
  const t = normalizeItemText(text).replace(/[()]/g, '').trim();
  let m = t.match(/^(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)$/);
  if (m && Number(m[2]) !== 0) return { kind: 'ratio', value: Number(m[1]) / Number(m[2]) };
  m = t.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (m && Number(m[2]) !== 0) return { kind: 'number', value: Number(m[1]) / Number(m[2]) };
  m = t.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (m) return { kind: 'percent', value: Number(m[1]) };
  m = t.match(/^-?\d+(?:\.\d+)?$/);
  if (m) return { kind: 'number', value: Number(t) };
  return null;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── the linter ───────────────────────────────────────────────────

const FIGURE_REFERENCE =
  /\b(?:the|this|each) (?:diagram|figure|image|picture)\b|\b(?:first|second|left|right) (?:diagram|figure)\b|\bprevious slide\b|\bshown above\b|\b(?:image|figure|diagram|graph) above\b/i;

export function lintLessonBlocks(blocks, { title = '' } = {}) {
  const warnings = [];
  const list = Array.isArray(blocks) ? blocks : [];
  const keyTerms = titleKeyTerms(title);

  const warn = (code, block, index, message, detail = null) => {
    warnings.push({
      severity: 'warning',
      code,
      blockId: String(block?.id ?? block?.content?.id ?? `index:${index}`),
      step: index + 1,
      message,
      detail,
    });
  };

  const checks = [];
  list.forEach((block, index) => {
    if (block?.block_type === 'check') checks.push({ block, index });
  });

  let keyedLongestCount = 0;
  let measuredChecks = 0;

  for (const { block, index } of checks) {
    const c = block.content || {};
    const choices = Array.isArray(c.choices) ? c.choices : [];
    const correctIdx = c.correct_index ?? 0;
    if (choices.length < 2 || correctIdx < 0 || correctIdx >= choices.length) continue;

    const norm = choices.map((choice) => normalizeItemText(choice));
    const keyed = norm[correctIdx];
    const others = norm.filter((_, i) => i !== correctIdx);
    measuredChecks += 1;

    // (a) keyed choice longest — the length cue.
    const meanOther = others.reduce((n, s) => n + s.length, 0) / others.length;
    if (norm.every((s, i) => i === correctIdx || keyed.length > s.length)) {
      keyedLongestCount += 1;
    }
    if (keyed.length >= 30 && keyed.length >= 1.4 * meanOther) {
      warn('lint_keyed_longest', block, index,
        `Keyed choice is ${(keyed.length / meanOther).toFixed(1)}x the mean length of the distractors.`,
        `keyed ${keyed.length} chars vs mean ${Math.round(meanOther)}`);
    }

    // (b) keyed choice is the only one containing a lesson key term.
    if (keyed.length >= 20) {
      const keyedLower = keyed.toLowerCase();
      for (const term of keyTerms) {
        if (!keyedLower.includes(term)) continue;
        if (others.every((s) => !s.toLowerCase().includes(term))) {
          warn('lint_key_term_echo', block, index,
            `Keyed choice is the only one containing the lesson term "${term}".`);
          break;
        }
      }
    }

    // (c) extreme-word imbalance: absolutes cluster in distractors.
    const extremesIn = (s) =>
      EXTREME_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(s));
    const keyedExtremes = extremesIn(keyed);
    const distractorsWithExtremes = others.filter((s) => extremesIn(s).length > 0);
    if (keyedExtremes.length === 0 && distractorsWithExtremes.length >= 2) {
      warn('lint_extreme_imbalance', block, index,
        `${distractorsWithExtremes.length} distractors carry extreme words (all/every/only/must/never/always/proved); the key carries none.`);
    }

    // (d) hint contains the keyed answer.
    if (c.hint) {
      const hintNorm = normalizeItemText(c.hint).toLowerCase();
      if (keyed.length >= 4 && hintNorm.includes(keyed.toLowerCase())) {
        warn('lint_hint_gives_answer', block, index,
          'Hint contains the keyed choice text.');
      } else {
        const nums = keyed.match(/-?\d+(?:\.\d+)?/g) || [];
        for (const num of nums) {
          if (new RegExp(`=\\s*${escapeRegExp(num)}(?![\\d.])`).test(hintNorm)) {
            warn('lint_hint_gives_answer', block, index,
              `Hint states "= ${num}", the keyed numeric answer.`);
            break;
          }
        }
      }
    }

    // (e) meta prompt: asks about the answer instead of the problem.
    const promptNorm = normalizeItemText(c.prompt);
    if (/^why\b/i.test(promptNorm) && /\b(correct|incorrect|wrong)\b/i.test(promptNorm)) {
      warn('lint_meta_prompt', block, index,
        'Prompt asks why an answer is correct/wrong — the key is given away as the premise.');
    }

    // (f) two numerically equivalent choices.
    const values = norm.map((s) => choiceNumericValue(s));
    outer: for (let i = 0; i < values.length; i += 1) {
      for (let j = i + 1; j < values.length; j += 1) {
        // Case-sensitive: \"4x-9~23\" vs \"4X-9~23\" is a deliberate
        // Desmos variable-naming distinction, not a duplicate.
        const equalText = norm[i].length > 0 && norm[i] === norm[j];
        const equalValue =
          values[i] && values[j] && values[i].kind === values[j].kind &&
          Math.abs(values[i].value - values[j].value) < 1e-9;
        if (equalText || equalValue) {
          warn('lint_equivalent_choices', block, index,
            `Choices ${String.fromCharCode(65 + i)} and ${String.fromCharCode(65 + j)} are equivalent.`,
            `${norm[i]} ≡ ${norm[j]}`);
          break outer;
        }
      }
    }
  }

  // (g) figure references with no <img> on the same slide.
  list.forEach((block, index) => {
    const c = block?.content || {};
    let prose = '';
    if (block?.block_type === 'text') prose = String(c.html || '');
    else if (block?.block_type === 'check') prose = String(c.prompt || '');
    else if (block?.block_type === 'desmos_interactive') {
      prose = `${c.instructions_html || ''} ${c.caption_html || ''}`;
    } else return;
    if (!FIGURE_REFERENCE.test(normalizeItemText(prose)) && !FIGURE_REFERENCE.test(prose)) return;
    // A pinned side-pane figure (content.figure, plan 3.1) satisfies
    // the reference the same way an inline <img> does.
    if (typeof c.figure?.src === 'string' && c.figure.src.trim()) return;
    const ownHtml = `${c.html || ''} ${c.instructions_html || ''} ${c.caption_html || ''}`;
    if (!/<img\b/i.test(ownHtml)) {
      warn('lint_missing_figure', block, index,
        'Prose references a diagram/figure/previous slide, but this slide has no <img> of its own.');
    }
  });

  // (h) final-retrieval distractors with no content-word overlap.
  const retrieval =
    checks.find(({ block }) => /retrieval/i.test(String(block?.id ?? block?.content?.id ?? ''))) ||
    checks[checks.length - 1];
  if (retrieval) {
    const c = retrieval.block.content || {};
    const choices = Array.isArray(c.choices) ? c.choices : [];
    const correctIdx = c.correct_index ?? 0;
    const keyWords = contentWords(choices[correctIdx]);
    if (keyWords.size >= 3) {
      const empty = [];
      choices.forEach((choice, i) => {
        if (i === correctIdx) return;
        const overlap = [...contentWords(choice)].filter((w) => keyWords.has(w));
        if (overlap.length === 0) empty.push(String.fromCharCode(65 + i));
      });
      if (empty.length > 0) {
        warn('lint_retrieval_nonsense_distractor', retrieval.block, retrieval.index,
          `Retrieval distractor${empty.length > 1 ? 's' : ''} ${empty.join(', ')} share${empty.length > 1 ? '' : 's'} no content words with the keyed process — eliminable on sight.`);
      }
    }
  }

  // (i)/(j) pacing runs: 3+ consecutive checks, 3+ consecutive text blocks.
  for (const [type, code, label] of [
    ['check', 'lint_check_run', 'checks'],
    ['text', 'lint_text_run', 'text blocks'],
  ]) {
    let runStart = -1;
    let runLength = 0;
    const flush = (endIndex) => {
      if (runLength >= 3) {
        warn(code, list[runStart], runStart,
          `${runLength} consecutive ${label} (steps ${runStart + 1}–${endIndex}).`);
      }
      runStart = -1;
      runLength = 0;
    };
    list.forEach((block, index) => {
      if (block?.block_type === type) {
        if (runLength === 0) runStart = index;
        runLength += 1;
      } else {
        flush(index);
      }
    });
    flush(list.length);
  }

  return {
    warnings,
    stats: {
      checkCount: measuredChecks,
      keyedLongestCount,
      keyedLongestRate: measuredChecks > 0 ? keyedLongestCount / measuredChecks : 0,
    },
  };
}
