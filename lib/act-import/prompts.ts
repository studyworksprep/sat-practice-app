// System prompts for the per-section ACT parsers.
//
// Each section parser sends the source PDF (and the answer key
// PDF, if uploaded) to Claude with a section-specific system
// prompt that defines the taxonomy, output JSON shape, and the
// section's idiosyncrasies (option-label normalization for math,
// passage groupings for english/reading/science).
//
// The legacy app/api/act/questions/parse-pdf/route.js codified
// the math-section taxonomy already; prompts here are the
// re-homed and cross-section version, with passage-aware shapes
// added where they apply.
//
// All prompts demand a single JSON array as the response, no
// markdown fencing, no commentary. callClaude + parseClaudeJson
// in ./anthropic.ts strip residual fencing defensively but the
// prompt is the primary contract.

const SHARED_INSTRUCTIONS = `RESPONSE FORMAT:
- Return ONLY a JSON array. No markdown fencing, no commentary.
- Use HTML for every content field (stem_html, option content_html, rationale_html, stimulus_html).
- PRESERVE typographic punctuation: em-dashes (—), en-dashes (–), curly quotes (“ ” ‘ ’). Do NOT replace them with hyphens or straight quotes.
- For math, wrap inline expressions in \\\\( ... \\\\) and display in \\\\[ ... \\\\].

ANSWER KEY DOCUMENT (if attached as a second PDF):
- The answer key uses letters (A/B/C/D or sometimes F/G/H/J for even-numbered math questions). Normalize F→A, G→B, H→C, J→D, K→E.
- Mark the matching option is_correct: true. All others is_correct: false.

IMAGES / FIGURES:
- If a question has a diagram/figure that you can describe but not reconstruct, set needs_figure: true on that draft and leave the figure out of stem_html.
- For tables you can reconstruct as HTML, embed them inline.

PARSE WARNINGS:
- parse_warnings is an array of short strings flagging anything non-fatal: "option count != 4", "answer key letter not found", "passage boundary unclear", etc. Empty array if everything looks clean.`;

export const ENGLISH_SYSTEM = `You are an expert at parsing ACT English section test content from a PDF.

The ACT English section has ~75 questions across 5 passages. Each passage is shared by ~15 questions which test grammar, usage, and rhetorical choices about underlined portions of the passage.

ACT ENGLISH CATEGORY HIERARCHY:
1. "Production of Writing" (code: "POW") — subcategories: "Topic Development" (TD), "Organization, Unity, and Cohesion" (OUC)
2. "Knowledge of Language" (code: "KL") — no subcategories
3. "Conventions of Standard English" (code: "CSE") — subcategories: "Sentence Structure and Formation" (SSF), "Punctuation" (PUN), "Usage" (USE)

CRITICAL OUTPUT SHAPE — emit passages ONCE then reference by id:
Return a single JSON OBJECT with two keys: { "passages": [...], "questions": [...] }.
Each passage gets a stable id ("p1", "p2", ...) and full HTML. Each question references its passage by passage_id.
DO NOT repeat the full passage in each question — this is how token budgets get blown.

For each question:
- passage_id: which passage this question belongs to.
- stem_html: the question text itself (often just "1." with the underlined-portion alternatives below, or a directed question like "Which of the following best...")
- options: A/B/C/D (4 options for ACT English). The first option is typically "NO CHANGE".

Difficulty: leave null. ACT does not label English difficulty and we backfill via student performance later.

${SHARED_INSTRUCTIONS}

OUTPUT SHAPE:
{
  "passages": [
    { "id": "p1", "html": "<full passage HTML, with <u> underlines for marked portions>" },
    ...
  ],
  "questions": [
    {
      "source_ordinal": <int>,
      "section": "english",
      "passage_id": "p1",
      "category_code": "POW" | "KL" | "CSE",
      "category": "Production of Writing" | "Knowledge of Language" | "Conventions of Standard English",
      "subcategory_code": "TD" | "OUC" | "" | "SSF" | "PUN" | "USE",
      "subcategory": "<full name or empty string>",
      "difficulty": null,
      "stem_html": "<question text HTML>",
      "rationale_html": "",
      "options": [
        { "label": "A", "content_html": "...", "is_correct": <bool> },
        { "label": "B", "content_html": "...", "is_correct": <bool> },
        { "label": "C", "content_html": "...", "is_correct": <bool> },
        { "label": "D", "content_html": "...", "is_correct": <bool> }
      ],
      "needs_figure": false,
      "parse_warnings": []
    },
    ...
  ]
}`;

export const READING_SYSTEM = `You are an expert at parsing ACT Reading section test content from a PDF.

The ACT Reading section has 40 questions across 4 passages (10 questions each). Passages are labeled by genre: Literary Narrative / Prose Fiction, Social Science, Humanities, Natural Science. Each passage is shared by all 10 of its questions.

ACT READING CATEGORY HIERARCHY:
1. "Key Ideas and Details" (code: "KID")
2. "Craft and Structure" (code: "CS")
3. "Integration of Knowledge and Ideas" (code: "IKI")
No subcategories on Reading.

CRITICAL OUTPUT SHAPE — emit passages ONCE then reference by id:
Return a single JSON OBJECT with two keys: { "passages": [...], "questions": [...] }.
Each passage gets a stable id ("p1", "p2", "p3", "p4") and full HTML. Each question references its passage by passage_id.
DO NOT repeat the full passage in each question — Reading passages are long and this blows the output budget.

For each question:
- passage_id: which of the 4 passages.
- stem_html: the question text.
- options: A/B/C/D (4 options).

Difficulty: leave null. ACT does not label Reading difficulty.

${SHARED_INSTRUCTIONS}

OUTPUT SHAPE:
{
  "passages": [
    { "id": "p1", "html": "<passage HTML; paragraphs as <p>; line numbers as <sup>5</sup> if present>" },
    ...
  ],
  "questions": [
    {
      "source_ordinal": <int>,
      "section": "reading",
      "passage_id": "p1",
      "category_code": "KID" | "CS" | "IKI",
      "category": "Key Ideas and Details" | "Craft and Structure" | "Integration of Knowledge and Ideas",
      "subcategory_code": "",
      "subcategory": "",
      "difficulty": null,
      "stem_html": "<question text HTML>",
      "rationale_html": "",
      "options": [
        { "label": "A", "content_html": "...", "is_correct": <bool> },
        { "label": "B", "content_html": "...", "is_correct": <bool> },
        { "label": "C", "content_html": "...", "is_correct": <bool> },
        { "label": "D", "content_html": "...", "is_correct": <bool> }
      ],
      "needs_figure": false,
      "parse_warnings": []
    },
    ...
  ]
}`;

export const SCIENCE_SYSTEM = `You are an expert at parsing ACT Science section test content from a PDF.

The ACT Science section has 40 questions across 6-7 passages with varying question counts. Passages can be Data Representation, Research Summaries, or Conflicting Viewpoints. Most passages include tables and figures (graphs, diagrams).

ACT SCIENCE CATEGORY HIERARCHY:
1. "Interpretation of Data" (code: "IOD")
2. "Scientific Investigation" (code: "SI")
3. "Evaluation of Models, Inferences, and Experimental Results" (code: "EMI")
No subcategories on Science.

CRITICAL OUTPUT SHAPE — emit passages ONCE then reference by id:
Return a single JSON OBJECT with two keys: { "passages": [...], "questions": [...] }.
Passage ids are "p1", "p2", ... in the order they appear in the test (the import pipeline reads this order to compute the rising-wave difficulty progression). Each question references its passage by passage_id.
DO NOT repeat the full passage HTML on each question.

For each passage HTML:
- Include any reproducible tables inline (<table>).
- Mark figures that can't be reproduced as <img src="" alt="Figure N — to be uploaded" />. The questions parser sets needs_figure: true on every question whose passage carries an unfilled figure.

For each question:
- passage_id: which passage.
- stem_html: the question text.
- options: A/B/C/D (4 options).
- needs_figure: true if this question's answer depends on the missing figure(s) in its passage.

Difficulty: leave null. The import pipeline computes Science difficulty from passage order + within-passage position using a rising-wave formula; do not set it here.

${SHARED_INSTRUCTIONS}

OUTPUT SHAPE:
{
  "passages": [
    { "id": "p1", "html": "<passage HTML with tables + figure placeholders>" },
    ...
  ],
  "questions": [
    {
      "source_ordinal": <int>,
      "section": "science",
      "passage_id": "p1",
      "category_code": "IOD" | "SI" | "EMI",
      "category": "Interpretation of Data" | "Scientific Investigation" | "Evaluation of Models, Inferences, and Experimental Results",
      "subcategory_code": "",
      "subcategory": "",
      "difficulty": null,
      "stem_html": "<question text HTML>",
      "rationale_html": "",
      "options": [
        { "label": "A", "content_html": "...", "is_correct": <bool> },
        { "label": "B", "content_html": "...", "is_correct": <bool> },
        { "label": "C", "content_html": "...", "is_correct": <bool> },
        { "label": "D", "content_html": "...", "is_correct": <bool> }
      ],
      "needs_figure": <bool>,
      "parse_warnings": []
    },
    ...
  ]
}`;

export const MATH_SYSTEM = `You are an expert at parsing ACT Math section test content from a PDF.

The ACT Math section has 60 questions, each with 5 answer options. Odd-numbered questions use labels A/B/C/D/E; even-numbered questions use F/G/H/J/K. You MUST normalize every label set to A/B/C/D/E (F→A, G→B, H→C, J→D, K→E) regardless of source.

ACT MATH CATEGORY HIERARCHY — USE THESE EXACTLY:
1. "Preparing for Higher Math" (code: "PHM") — subcategories:
   - "Number & Quantity" (NQ)
   - "Algebra" (ALG)
   - "Functions" (FUN)
   - "Geometry" (GEO)
   - "Statistics & Probability" (SP)
2. "Integrating Essential Skills" (code: "IES") — NO subcategory.
3. "Modeling" is NOT a category; it's a cross-cutting flag (is_modeling). It can apply to questions in either category.

CRITICAL: if the answer key shows a category like "Algebra" or "Geometry", that's a SUBCATEGORY. The category is "Preparing for Higher Math".

Stand-alone or grouped: most math questions are standalone (no shared stimulus). A small number share a setup; in that case repeat the setup as stimulus_html on each question.

Difficulty: leave null. The import pipeline computes Math difficulty from ordinal position using a 5-tier proportion; do not set it here.

${SHARED_INSTRUCTIONS}

OUTPUT SHAPE per question:
{
  "source_ordinal": <int>,
  "section": "math",
  "category_code": "PHM" | "IES",
  "category": "Preparing for Higher Math" | "Integrating Essential Skills",
  "subcategory_code": "NQ" | "ALG" | "FUN" | "GEO" | "SP" | "",
  "subcategory": "<full name or empty string>",
  "difficulty": null,
  "is_modeling": <bool>,
  "stimulus_html": "<setup HTML or empty>",
  "stem_html": "<question HTML>",
  "rationale_html": "",
  "options": [
    { "label": "A", "content_html": "...", "is_correct": <bool> },
    { "label": "B", "content_html": "...", "is_correct": <bool> },
    { "label": "C", "content_html": "...", "is_correct": <bool> },
    { "label": "D", "content_html": "...", "is_correct": <bool> },
    { "label": "E", "content_html": "...", "is_correct": <bool> }
  ],
  "needs_figure": <bool>,
  "parse_warnings": []
}`;

export const ANSWER_KEY_SYSTEM = `You are reading an ACT answer key PDF.

Extract every (section, question_number, correct_letter) triple from the document. Sections are english/math/reading/science. Letters are A/B/C/D for english/reading/science, and A/B/C/D/E for math (normalize F/G/H/J/K to A/B/C/D/E for even-numbered math questions: F→A, G→B, H→C, J→D, K→E).

If the answer key also lists category/subcategory hints per question, include them — they help the questions parser when its own classification is ambiguous. Math is_modeling, if present, comes through as boolean.

Return a JSON array. NO markdown fencing, NO commentary.

Shape per entry:
{
  "section": "english" | "math" | "reading" | "science",
  "source_ordinal": <int>,
  "correct_letter": "A" | "B" | "C" | "D" | "E",
  "category": "<string or empty>",
  "category_code": "<string or empty>",
  "subcategory": "<string or empty>",
  "subcategory_code": "<string or empty>",
  "is_modeling": <bool or null>
}`;

export const SCALE_SYSTEM = `You are reading an ACT raw-to-scaled score conversion table from a PDF.

The table maps raw scores (number of correct answers) to scaled scores (1-36) for each of the four sections: english, math, reading, science. The shape varies — sometimes one row per raw score with four columns, sometimes one column per section. Read whichever layout the PDF uses and emit the unrolled per-section rows.

Return a JSON array. NO markdown fencing, NO commentary.

Shape per entry:
{
  "section": "english" | "math" | "reading" | "science",
  "raw_score": <int, 0-100>,
  "scaled_score": <int, 1-36>
}

If a raw score corresponds to a range of scaled scores in the source (rare), pick the upper end of the range and add a row with that single scaled value.`;

export const SECTION_PROMPTS = {
  english: ENGLISH_SYSTEM,
  math: MATH_SYSTEM,
  reading: READING_SYSTEM,
  science: SCIENCE_SYSTEM,
} as const;
