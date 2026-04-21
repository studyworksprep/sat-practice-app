// Convert College Board "speak-math" alt text to LaTeX.
//
// Background. The question bank includes 560+ <img role="math"
// class="math-img" src="data:image/png;base64,…" alt="…"> elements
// where the alt attribute carries a spelled-out, speech-optimized
// description of the equation (e.g. "the fraction with numerator x
// plus 1, and denominator 5, end fraction, equals 10"). The PNGs
// are ingest-time artifacts that can't scale or be watermarked;
// the alt text is a reversible encoding of the underlying math
// that we can feed back into MathJax as LaTeX.
//
// Strategy. Cascade of pass-based rewriters that each handle one
// grammar feature (named fractions, roots, superscripts, etc.),
// applied in a specific order so inner-to-outer composition works
// without a full recursive-descent parser. Each pass wraps its
// captured sub-expressions in {} so subsequent passes see them as
// atomic LaTeX groups. parseOrNull returns null when a run doesn't
// reduce to clean LaTeX — the caller then falls back to keeping
// the original <img> in place.
//
// Commas in speak-math are decorative (speech pauses) and get
// dropped early so they don't leak into the LaTeX output. The
// exception is "N comma M" appearing as explicit coordinate
// punctuation, which is restored via the coordinate pattern pass.

// ──────────────────────────────────────────────────────────────
// Lookup tables.
// ──────────────────────────────────────────────────────────────

const GREEK = {
  alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta',
  epsilon: '\\epsilon', zeta: '\\zeta', eta: '\\eta', theta: '\\theta',
  iota: '\\iota', kappa: '\\kappa', lambda: '\\lambda', mu: '\\mu',
  nu: '\\nu', xi: '\\xi', pi: '\\pi', rho: '\\rho',
  sigma: '\\sigma', tau: '\\tau', upsilon: '\\upsilon', phi: '\\phi',
  chi: '\\chi', psi: '\\psi', omega: '\\omega',
};

const UNIT_FRACTIONS = {
  'one half': '\\tfrac{1}{2}',
  'one-half': '\\tfrac{1}{2}',
  'one third': '\\tfrac{1}{3}',
  'one fourth': '\\tfrac{1}{4}',
  'one quarter': '\\tfrac{1}{4}',
  'one fifth': '\\tfrac{1}{5}',
  'one sixth': '\\tfrac{1}{6}',
  'one seventh': '\\tfrac{1}{7}',
  'one eighth': '\\tfrac{1}{8}',
  'one ninth': '\\tfrac{1}{9}',
  'one tenth': '\\tfrac{1}{10}',
  'two thirds': '\\tfrac{2}{3}',
  'two fifths': '\\tfrac{2}{5}',
  'three halves': '\\tfrac{3}{2}',
  'three fourths': '\\tfrac{3}{4}',
  'three fifths': '\\tfrac{3}{5}',
  'four fifths': '\\tfrac{4}{5}',
  'four thirds': '\\tfrac{4}{3}',
  'five halves': '\\tfrac{5}{2}',
  'five fourths': '\\tfrac{5}{4}',
  'five sixths': '\\tfrac{5}{6}',
  'seven halves': '\\tfrac{7}{2}',
};

const ORDINALS_TO_NUM = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
};

// Spelled-out digits that can appear inside math expressions (e.g.
// "20 point zero"). Only rewritten when surrounded by math context,
// never as standalone words in prose.
const DIGIT_WORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

const TRIG_MAP = {
  sine: '\\sin', cosine: '\\cos', tangent: '\\tan',
  cosecant: '\\csc', secant: '\\sec', cotangent: '\\cot',
  arcsine: '\\arcsin', arccosine: '\\arccos', arctangent: '\\arctan',
  log: '\\log', ln: '\\ln',
};

// ──────────────────────────────────────────────────────────────
// Normalize: entity decode, whitespace, comma cleanup.
// ──────────────────────────────────────────────────────────────

function normalize(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Commas in speak-math serve two purposes: speech pauses
// (decorative, drop them) and thousands-separators inside real
// numbers like "1,576" (keep them). A literal comma followed by
// whitespace is always a pause; a comma between digits is always
// a thousands separator. The "comma" word is an explicit
// coordinate separator — swap it to a protected sentinel first
// so number-comma heuristics don't touch it.
function dropDecorativeCommas(s) {
  let out = s.replace(/\bcomma\b/g, '§COMMA§');
  out = out.replace(/,\s+/g, ' ');          // pause commas
  out = out.replace(/§COMMA§/g, ',');        // coordinate commas
  return out;
}

// ──────────────────────────────────────────────────────────────
// Named lookups + basic ops.
// ──────────────────────────────────────────────────────────────

function replaceNamed(s) {
  let out = s;
  for (const [phrase, tex] of Object.entries(UNIT_FRACTIONS)) {
    const pattern = phrase.replace(/[- ]/g, '[- ]');
    out = out.replace(new RegExp(`\\b${pattern}\\b`, 'gi'), ` ${tex} `);
  }
  for (const [word, tex] of Object.entries(GREEK)) {
    out = out.replace(new RegExp(`\\b${word}\\b`, 'g'), tex);
  }
  return out;
}

function joinPointNumbers(s) {
  // Normalize digit words (zero, one, …, nine) to numerals BEFORE
  // the point-joining pass so "zero point 4 5" / "zeropoint 4 5"
  // / "zero point four five" all collapse the same way. Only
  // convert when the digit word is in a math context — followed
  // or preceded by a digit, operator, "point", "equals", etc. —
  // so we don't mangle English prose like "two students scored".
  let cur = s;
  // "zeropoint" (no space) is a real CB-authoring artifact.
  cur = cur.replace(/\bzeropoint\b/gi, '0 point');
  const DIGIT_BOUNDARY = '(?=\\s*(?:point|[\\d.]|plus|minus|times|equals|over|comma|[-+=<>]))';
  for (const [word, digit] of Object.entries(DIGIT_WORDS)) {
    cur = cur.replace(new RegExp(`\\b${word}\\b\\s*${DIGIT_BOUNDARY}`, 'gi'), `${digit} `);
  }
  let prev;
  do {
    prev = cur;
    cur = cur.replace(/(\d)\s+point\s+(\d)/g, '$1.$2');
    cur = cur.replace(/(\d\.\d)\s+(\d)(?=\s|$|[^0-9])/g, '$1$2');
  } while (cur !== prev);
  return cur;
}

// Simple word-for-symbol rewrites. Order: multi-word first.
function simpleOps(s) {
  const subs = [
    [/\bis less than or equal to\b/g, ' \\le '],
    [/\bis greater than or equal to\b/g, ' \\ge '],
    [/\bis approximately equal to\b/g, ' \\approx '],
    [/\bis not equal to\b/g, ' \\ne '],
    [/\bis less than\b/g, ' < '],
    [/\bis greater than\b/g, ' > '],
    [/\bis equal to\b/g, ' = '],
    [/\bless than or equal to\b/g, ' \\le '],
    [/\bgreater than or equal to\b/g, ' \\ge '],
    [/\bless than\b/g, ' < '],
    [/\bgreater than\b/g, ' > '],

    [/\bdivided by\b/g, ' \\div '],
    [/\bequals\b/g, ' = '],
    [/\bis\b(?!\s+(?:less|greater|approximately|not|equal))/g, ' = '],
    [/\bplus\b/g, ' + '],
    [/\bminus\b/g, ' - '],
    [/\bthe negative of\b/g, ' -'],
    [/(?:^|[^A-Za-z])negative\s+/g, ' -'],
    [/\btimes\b/g, ' \\cdot '],
    [/\bpercent\b/g, '\\%'],
    [/\bdegrees?\b/g, '^{\\circ}'],
    [/\bwhich equals\b/g, ' = '],
    [/\bwhich is\b/g, ' '],
    [/\bwhich\b/g, ' '],
  ];
  let out = s;
  for (const [re, rep] of subs) out = out.replace(re, rep);
  return out;
}

// ──────────────────────────────────────────────────────────────
// Structural: paired delimiters, subscript/superscript, fractions,
// roots, abs value, function application. Applied iteratively
// until fixed point so inner-to-outer composition works.
// ──────────────────────────────────────────────────────────────

const RE_OPEN_PAREN  = /\bopen parenthesis\b|\bleft parenthesis\b/g;
const RE_CLOSE_PAREN = /\bclose parenthesis\b|\bright parenthesis\b/g;
const RE_OPEN_BRACKET  = /\bopen bracket\b|\bleft bracket\b/g;
const RE_CLOSE_BRACKET = /\bclose bracket\b|\bright bracket\b/g;

const RE_UPPER = /\bupper\s+([A-Z])\b/g;

// A "balanced" match for parenthesized or braced subexpressions.
// Used as a single "atom" inside power/subscript patterns.
const ATOM = `(?:\\{[^{}]*\\}|\\([^()]*\\)|\\\\[A-Za-z]+\\{[^{}]*\\}(?:\\{[^{}]*\\})?|-?[A-Za-z0-9.]+)`;

// Subscripts. "end subscript" form preferred; atomic form (single
// digit/letter after "subscript") is a safe fallback for the
// typical "x subscript 1" / "y subscript 2" cases that don't carry
// an end marker.
const RE_SUB_LONG   = /([A-Za-z])\s+subscript\s+([^,]+?)\s*(?:,\s*)?end subscript\b/g;
const RE_SUB_ATOMIC = /\b([A-Za-z])\s+subscript\s+([A-Za-z0-9])\b(?!\w)/g;
const RE_SUB_SHORT  = /\b([A-Za-z])\s+sub\s+([A-Za-z0-9]+)\b/g;

// Powers.
const RE_SQUARED   = new RegExp(`(${ATOM})\\s+squared\\b`, 'g');
const RE_CUBED     = new RegExp(`(${ATOM})\\s+cubed\\b`, 'g');
const RE_NTH_POWER = new RegExp(`(${ATOM})\\s+(?:raised )?to the\\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\\s+power\\b`, 'g');
const RE_NEG_NTH_POWER = new RegExp(`(${ATOM})\\s+(?:raised )?to the\\s+negative\\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\\s+power\\b`, 'g');
const RE_X_POWER   = new RegExp(`(${ATOM})\\s+(?:raised )?to the\\s+(?:power\\s+of\\s+)?(-?\\d+|[a-z])\\s*(?:power)?\\b`, 'g');
const RE_NAMED_POWER = new RegExp(`(${ATOM})\\s+(?:raised )?to the\\s+(\\\\tfrac\\{[^{}]+\\}\\{[^{}]+\\})\\s+power\\b`, 'g');
const RE_NEG_NAMED_POWER = new RegExp(`(${ATOM})\\s+(?:raised )?to the\\s+negative\\s+(\\\\tfrac\\{[^{}]+\\}\\{[^{}]+\\})\\s+power\\b`, 'g');

// Roots. "end root" form preferred; atomic form (single
// digit/letter/atom) is a safe fallback for short expressions.
const RE_SQRT        = /\bthe square root of\s+([^,]+?)\s*,?\s*end root\b/g;
const RE_CBRT        = /\bthe cube root of\s+([^,]+?)\s*,?\s*end root\b/g;
const RE_SQRT_ATOMIC = new RegExp(`\\bthe square root of\\s+(${ATOM})(?!\\s+(?:end root|\\w))`, 'g');
const RE_CBRT_ATOMIC = new RegExp(`\\bthe cube root of\\s+(${ATOM})(?!\\s+(?:end root|\\w))`, 'g');

// Absolute value.
const RE_ABS  = /\bthe absolute value of\s+([^,]+?)\s*,?\s*end absolute value\b/g;

// Fractions. End-marker form first (tightest binding), then a
// "no-end-marker" variant that terminates at a natural break
// (operator, paren close, comparison, end of string). Nested
// fractions where the numerator itself contains "the fraction"
// will still fail the .+? minimum match — accepted limitation.
const RE_FRAC_FULL = /\bthe fraction with numerator\s+(.+?)\s+and denominator\s+(.+?)\s*end fraction\b/g;
const RE_FRAC_FULL_NOEND = /\bthe fraction with numerator\s+(.+?)\s+and denominator\s+(.+?)(?=\s*(?:=|\+|-|\\cdot|\)|<|>|\\le|\\ge|\\approx|\\ne|$))/g;
const RE_FRAC_OVER = /\bthe fraction\s+(.+?)\s+over\s+(.+?)(?:\s+end fraction\b|(?=\s*(?:=|\+|-|\\cdot|\)|<|>|\\le|\\ge|\\approx|\\ne|$)))/g;
const RE_SIMPLE_OVER = /(?<=^|[\s(])([A-Za-z0-9.]+)\s+over\s+([A-Za-z0-9.]+)(?=\s|$|[),])/g;

// Function application.
const TRIG_NAMES = Object.keys(TRIG_MAP).join('|');
const RE_TRIG_OF = new RegExp(`\\b(${TRIG_NAMES})\\s+of\\s+(${ATOM})`, 'g');
const RE_FN_OF = new RegExp(`\\b([a-z])\\s+of\\s+(${ATOM})`, 'g');

// Geometry.
const RE_ANGLE_LIST    = /\bangle\s+((?:[A-Z]\s+){1,4}[A-Z])\b/g;
const RE_ANGLE_SINGLE  = /\bangle\s+([A-Z])\b/g;
const RE_LINE_SEGMENT  = /\b(?:the\s+)?line segment\s+([A-Z])\s*,?\s*([A-Z])\b/g;
const RE_LINE_SEG      = /\bline\s+([A-Z])\s+([A-Z])\b/g;
const RE_SIDE          = /\bside\s+([A-Z])\s*,?\s*([A-Z])\b/g;
const RE_TRIANGLE_LIST = /\btriangle\s+((?:[A-Z]\s+){1,3}[A-Z])\b/g;
const RE_LENGTH        = /\bthe length of\s+/g;

// Coordinates. Two shapes:
//   - explicit: "with coordinates N , M" → \left(N, M\right)
//   - implicit: bare "N , M" (or "N comma M" after decorative-
//     comma processing) in contexts that read as a point. We
//     capture the implicit form only when the comma sits between
//     two coordinate-looking atoms AND isn't already inside
//     another paren group. Example: "the y-axis at 0 , -5" →
//     "the y-axis at (0, -5)".
// Both accept optional whitespace between a leading "-" and its
// digit (simpleOps produces "- 5" for "negative 5" before this
// pass runs).
const RE_COORDS = /\bwith coordinates\s+(-?\s*[A-Za-z0-9.]+(?:\s*,\s*-?\s*[A-Za-z0-9.]+)+)/g;
const RE_POINT_WITH = /\bthe\s+points?\s+with coordinates\s+/g;
const RE_IMPLICIT_POINT = /(?<![(\\\w])(-?\s*\d+(?:\.\d+)?|[A-Za-z])\s*,\s*(-?\s*\d+(?:\.\d+)?|[A-Za-z])(?!\s*,)/g;

// Residuals.
const RE_ENDFRAC = /\bend fraction\b/g;
const RE_ENDPAREN = /\bend parenthesis\b/g;

function structuralPass(s) {
  let prev;
  let cur = s;
  let iter = 0;
  do {
    prev = cur;

    // Strip "the length of" prefix so "side A B" / "line P Q" can match.
    cur = cur.replace(RE_LENGTH, '');

    // Delimiters.
    cur = cur.replace(RE_OPEN_PAREN, '(').replace(RE_CLOSE_PAREN, ')');
    cur = cur.replace(RE_OPEN_BRACKET, '[').replace(RE_CLOSE_BRACKET, ']');
    cur = cur.replace(RE_UPPER, '$1');

    // Geometry.
    cur = cur.replace(RE_ANGLE_LIST, (_, letters) => `\\angle ${letters.replace(/\s+/g, '')}`);
    cur = cur.replace(RE_ANGLE_SINGLE, '\\angle $1');
    cur = cur.replace(RE_LINE_SEGMENT, '\\overline{$1$2}');
    cur = cur.replace(RE_LINE_SEG, '\\overleftrightarrow{$1$2}');
    cur = cur.replace(RE_SIDE, '\\overline{$1$2}');
    cur = cur.replace(RE_TRIANGLE_LIST, (_, letters) => `\\triangle ${letters.replace(/\s+/g, '')}`);

    // Roots / abs value. end-marker form first, atomic fallback second.
    cur = cur.replace(RE_SQRT, ' \\sqrt{$1} ');
    cur = cur.replace(RE_CBRT, ' \\sqrt[3]{$1} ');
    cur = cur.replace(RE_SQRT_ATOMIC, ' \\sqrt{$1} ');
    cur = cur.replace(RE_CBRT_ATOMIC, ' \\sqrt[3]{$1} ');
    cur = cur.replace(RE_ABS, ' \\left|$1\\right| ');

    // Subscripts. Long form first, then atomic, then "sub" shorthand.
    cur = cur.replace(RE_SUB_LONG, '$1_{$2}');
    cur = cur.replace(RE_SUB_ATOMIC, '$1_{$2}');
    cur = cur.replace(RE_SUB_SHORT, '$1_{$2}');

    // Powers. Negative variants first so the base pattern doesn't
    // steal them.
    cur = cur.replace(RE_NEG_NAMED_POWER, '$1^{-$2}');
    cur = cur.replace(RE_NAMED_POWER, '$1^{$2}');
    cur = cur.replace(RE_NEG_NTH_POWER, (_, base, ord) => `${base}^{-${ORDINALS_TO_NUM[ord]}}`);
    cur = cur.replace(RE_NTH_POWER, (_, base, ord) => `${base}^{${ORDINALS_TO_NUM[ord]}}`);
    cur = cur.replace(RE_SQUARED, '$1^{2}');
    cur = cur.replace(RE_CUBED, '$1^{3}');
    cur = cur.replace(RE_X_POWER, '$1^{$2}');

    // Fractions — most-specific phrase first. End-marker form
    // before the no-end-marker variant so explicit end fraction
    // binding wins over the natural-break heuristic.
    cur = cur.replace(RE_FRAC_FULL, ' \\frac{$1}{$2} ');
    cur = cur.replace(RE_FRAC_FULL_NOEND, ' \\frac{$1}{$2} ');
    cur = cur.replace(RE_FRAC_OVER, ' \\frac{$1}{$2} ');
    cur = cur.replace(RE_SIMPLE_OVER, '\\frac{$1}{$2}');

    // Functions.
    cur = cur.replace(RE_TRIG_OF, (_, name, arg) => `${TRIG_MAP[name]}(${stripBraces(arg)})`);
    cur = cur.replace(RE_FN_OF, '$1($2)');

    // Coordinates. Implicit pattern first so "N , M" inside any
    // context (including "with coordinates N , M") gets wrapped
    // consistently; the explicit phrase then just strips its
    // now-redundant prefix. Sentinels stay in place across
    // iterations so a later iteration doesn't re-wrap the same
    // body — they're swapped to real delimiters AFTER the
    // structural loop exits.
    cur = cur.replace(RE_POINT_WITH, '');
    cur = cur.replace(RE_IMPLICIT_POINT, (m, a, b) =>
      `§COORD§${a.replace(/-\s+/g, '-').trim()}§C§${b.replace(/-\s+/g, '-').trim()}§CEND§`,
    );
    cur = cur.replace(/\bwith coordinates\s+(?=§COORD§)/g, '');
    cur = cur.replace(RE_COORDS, (_, body) =>
      `§COORD§${body.replace(/-\s+/g, '-').replace(/\s*,\s*/g, '§C§')}§CEND§`,
    );

    // Cleanup.
    cur = cur.replace(RE_ENDFRAC, '').replace(RE_ENDPAREN, ')');

    iter++;
  } while (cur !== prev && iter < 30);

  // Swap coordinate sentinels to real LaTeX delimiters after the
  // loop so intermediate iterations couldn't rewrap them.
  cur = cur
    .replace(/§COORD§/g, '\\left(')
    .replace(/§CEND§/g, '\\right)')
    .replace(/§C§/g, ', ');
  return cur;
}

function stripBraces(s) {
  return s.replace(/^\{(.+)\}$/, '$1');
}

// ──────────────────────────────────────────────────────────────
// Juxtapose: glue "2 x" → "2x", "3 \pi" → "3\pi". Restricted to
// digit+letter / digit+command / single-letter+command — avoids
// gluing English words together.
// ──────────────────────────────────────────────────────────────

function juxtapose(s) {
  let prev;
  let cur = s;
  do {
    prev = cur;
    // digit + letter or command
    cur = cur.replace(/(\d)\s+([A-Za-z]\b|\\[A-Za-z]+)/g, '$1$2');
    // single letter + command (e.g., "r \\theta")
    cur = cur.replace(/(\b[a-z])\s+(\\[A-Za-z]+)\b/g, '$1$2');
    // closing-group + letter (e.g., "}x", ")x")
    cur = cur.replace(/([)}\]])\s+([a-z]\b|\\[A-Za-z]+)/g, '$1$2');
  } while (cur !== prev);
  return cur;
}

// ──────────────────────────────────────────────────────────────
// Final whitespace/punctuation cleanup.
// ──────────────────────────────────────────────────────────────

function finalize(s) {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s*([=+\-<>])\s*/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,.\s]+|[,.\s]+$/g, '');
}

// ──────────────────────────────────────────────────────────────
// Public.
// ──────────────────────────────────────────────────────────────

/**
 * Parse CB speak-math alt text → LaTeX (no delimiters).
 * Returns null when the text contains unhandled speak-math tokens,
 * so the caller can fall back to keeping the original image.
 */
export function parseOrNull(alt) {
  if (alt == null || typeof alt !== 'string' || alt.trim() === '') return null;

  let cur = normalize(alt);
  cur = dropDecorativeCommas(cur);
  cur = replaceNamed(cur);
  cur = joinPointNumbers(cur);
  cur = simpleOps(cur);
  cur = structuralPass(cur);
  cur = juxtapose(cur);
  cur = finalize(cur);

  // If any speak-math tokens remain, the parse failed. The check
  // is designed to stay narrow: every token listed here is
  // unambiguously part of speak-math and never appears in valid
  // LaTeX output. "angle" is excluded because \\angle still
  // contains the substring; structural pass converts "angle X"
  // exclusively. Similarly for "\\sqrt" (contains "sqrt"), etc.
  const RESIDUAL = /\b(squared|cubed|superscript|numerator|denominator|parenthesis|bracket|end root|square root|cube root|absolute value|upper|power|raised|less than|greater than|approximately|divided by|plus|minus|times|equals|percent|degrees|negative|zeropoint)\b/i;
  if (RESIDUAL.test(cur)) return null;

  // Separate check: "fraction", "the fraction", "subscript"
  // without backslash — would indicate structural pass missed.
  if (/(?<!\\)\b(fraction|subscript)\b/i.test(cur)) return null;

  // Unit words that leaked into math mode. CB alt text sometimes
  // reads "1 degree Fahrenheit" as a whole phrase, and the
  // "degrees" → ^{\circ} rewrite leaves "Fahrenheit" as a bare
  // word stuck next to the circle. These ambiguous cases are
  // safer flagged for human review than silently emitted: the
  // reader wouldn't know whether "°Fahrenheit" was intended as
  // "°F" or if the whole clause belongs in \\text{}.
  if (/\b(fahrenheit|celsius|kelvin|farad|ampere|kilogram|meter|kilometer|millimeter|centimeter|mile|foot|feet|inch|inches|gallon|liter|milliliter|pound|ounce|second|minute|hour)\b/i.test(cur)) {
    return null;
  }

  // Ambiguous short-form fractions where an operator follows
  // immediately. "N over M + P" could be \frac{N}{M}+P or
  // \frac{N}{M+P}; without an explicit end-fraction marker in the
  // source we can't tell. Safer to leave these for human review.
  if (/\\frac\{[^{}]+\}\{[^{}]+\}\s*[+\-]\s*[A-Za-z0-9]/.test(cur)
      && !/end fraction/i.test(alt)) {
    // Only flag when the source ALSO lacked an end marker —
    // "the fraction … end fraction, plus …" is genuinely
    // unambiguous and should pass.
    if (/\bover\b/i.test(alt) && !/\bwith numerator\b/i.test(alt)) {
      return null;
    }
  }

  // Sanity: must be reasonably LaTeX-looking. Empty / purely
  // English tokens are rejected.
  if (cur.length === 0) return null;
  if (/^[A-Za-z\s]+$/.test(cur) && !/\b[a-z]\b/.test(cur)) return null;

  return cur;
}

export const parseSpeakMath = parseOrNull;
