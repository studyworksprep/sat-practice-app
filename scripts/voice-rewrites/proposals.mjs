// Plan 6.2 proposals — the single source for docs/lesson-voice-rewrites-2026-09.md
// and the tutor review page (see build-review.mjs), and the input the
// application pass splices into the specs on approval. "Was" text is NOT stored here: the build script
// reads it from the specs, so the comparison is always against the live copy.
//
// Per lesson:
//   name       { proposed, status: 'named' | 'title' | 'new', why }
//   opener     null (keep) | html — the FULL replacement for block 1's body
//              below the intro card (the <h2> and the card stay as they are)
//   closer     null (keep) | html — the FULL replacement for lesson_complete.html
//   retrieval  null (keep / none) | string — the replacement PROMPT stem for the
//              stock "Without looking back, which…" check (choices unchanged)
//   notes      free text (ending order, blocks to drop, anything tutors decide)

// Set when the owner approved and apply.mjs ran; the builder refuses to
// regenerate after this (both outputs read "Was" from the live specs).
export const APPLIED_ON = '2026-09-03';

export const DECISIONS = [
  {
    id: 'end-hard',
    title: 'End on the item, not the recital',
    body:
      'Today 32 of 36 lessons end retrieval-check → lesson_complete, with the SAT-format item one step earlier. ' +
      'The voice guide says end hard: the last thing a learner does is the "you vs. the SAT" item. Proposal: swap the ' +
      'final two activities so the order is retrieval check → authentic item → sign-off. Already the case in Find Missing ' +
      'Constants; CLEAR and Sliders end on a bank question (fine); Good Cop / Bad Cop ends on its own paired checks (leave). ' +
      'If the team would rather keep "say the routine back" as the final beat, say so — this is one decision for all 32.',
  },
  {
    id: 'summary-blocks',
    title: 'Drop the three "in one glance" summary blocks',
    body:
      'My Numbers, Rhetorical Synthesis, and Odd-One-Out each carry a text block ("My Numbers in one glance", ' +
      '"The strategy in one glance", "The shortcut in one glance") between the retrieval check and the sign-off. ' +
      'It is the summary card the voice retires, and the retrieval check already asks for the routine. Proposal: delete all three.',
  },
  {
    id: 'tails',
    title: 'Delete the twelve "Next, you will…" tails',
    body:
      'Mechanical, no judgment needed: the sentence goes, the explanation keeps its answer. Listed at the end so the team can ' +
      'see them; applied with the rest on approval. The linter (lint_retired_tail) keeps them from coming back.',
  },
  {
    id: 'explanations',
    title: 'Explanation openers are a follow-up, not this pass',
    body:
      '587 of 625 explanations (94%) open "Correct." / "Right." / "Exactly." That is the cadence the guide now retires, but ' +
      'varying 587 lines is a voice pass in its own right, and one the tutors should read rather than approve blind. ' +
      'The corpus report now shows each lesson\'s same-word-opener rate; the generator and skill write new lessons varied. ' +
      'Proposal: schedule it as 6.2b after names are settled, so the rewrites can use the names.',
  },
];

export const TAILS = [
  ['boundaries-punctuation-order', 3, 'exploration_check', 'Next, you will learn the easiest way to perform that test.'],
  ['percentages-and-percent-change', 2, 'exploration_check', 'Next, you will unpack the percent notation that made this entry work.'],
  ['solving-equations-by-graphing-x-intercepts', 3, 'exploration_check', 'Next, you will name the horizontal axis and explain why the second coordinate is zero.'],
  ['solving-equations-by-graphing-x-intercepts', 9, 'solution_connection_check', 'Next, you will turn that idea into a repeatable process for equations that do not already equal zero.'],
  ['solving-equations-by-graphing-x-intercepts', 14, 'full_model_check', 'Next, you will keep the same process when the problem uses a letter other than x.'],
  ['solving-equations-by-graphing-x-intercepts', 17, 'different_variable_check', 'Next, you will match decimal intercepts to exact answer choices.'],
  ['solving-equations-by-graphing-x-intercepts', 20, 'exact_choice_check', 'Next, you will use intercepts to count real solutions.'],
  ['solving-equations-by-graphing-x-intercepts', 27, 'viewport_check', 'Next, you will decide when this graphing tool is a good match for the question.'],
  ['solving-equations-with-regression', 2, 'exploration_check', 'Next, you will learn what the ~ symbol told Desmos to do.'],
  ['solving-equations-with-regression', 19, 'system_meaning_check', 'Next, you will learn the special form Desmos needs for the supporting equation.'],
  ['solving-equations-with-regression', 24, 'system_setup_check', 'Next, you will practice deciding which equation should get each job.'],
  ['solving-systems-of-equations-by-graphing', 3, 'first_observation_check', 'Next, you will connect that shared point to the meaning of an equation.'],
];

export const LESSONS = [
  {
    slug: 'advanced-factoring-non-monic-trinomials-and-cubes',
    name: { proposed: 'Outside-Inside Check', status: 'new', why: 'The check that decides every trial: the outside and inside products must add to the middle term.' },
    opener:
      '<p>A leading coefficient that isn\'t \\(1\\) stops most people cold: \\(6x^2+11x+3\\) doesn\'t split by the sum-and-product habit. It still factors — by organized trial, checked by one number.</p>' +
      '<blockquote><p><strong>No new trick:</strong> every trial comes from the multiplication you\'re reversing, and the middle term tells you whether it worked.</p></blockquote>',
    closer:
      '<h2>The middle term decides it</h2>' +
      '<p>Non-monic trinomial, cube, or a mix of both — the outside-inside products have to add to the middle term, and the cube identities come back from cancellation whenever you forget them. Before you grind, ask whether the question wanted a factored form at all.</p>',
    retrieval: null,
    notes: 'Retrieval check already has its own stem — keep.',
  },
  {
    slug: 'boundaries-punctuation-order',
    name: { proposed: 'Stop, Colon, Dash, Comma', status: 'new', why: 'The order itself is the move; saying it out loud is the routine.' },
    opener:
      '<p>Boundaries questions are the fastest points in Reading and Writing — if you test the punctuation in a fixed order instead of asking which choice sounds right. Sound is exactly what the test exploits.</p>' +
      '<ol><li><strong>Full stop:</strong> semicolon, period, or comma plus FANBOYS</li><li><strong>Colon</strong></li><li><strong>Dash</strong></li><li><strong>Comma</strong></li></ol>' +
      '<p>You stop the moment one answer is the only one that works. First, see how the test dresses these up.</p>',
    closer:
      '<h2>Sound is the trap. Order is the move.</h2>' +
      '<p>Full stop, colon, dash, comma — the same four tests in the same order, and two choices that do the identical job are both out. That\'s the whole routine, and it runs the same way with two minutes left.</p>',
    retrieval: 'Cover the screen. A Boundaries question is in front of you and the clock is running — in order, what do you test?',
    notes: '',
  },
  {
    slug: 'boundaries-transition-word-placement-and-logic',
    name: { proposed: 'Which Two Ideas?', status: 'new', why: 'The question that settles placement when both spots are grammatical.' },
    opener:
      '<p>Some SAT Boundaries questions give you two choices that are both grammatically possible:</p>' +
      '<ul><li>a transition just <strong>before</strong> a semicolon or period</li><li>the same transition just <strong>after</strong> that semicolon or period</li></ul>' +
      '<p>Punctuation alone will not separate them, and the test is betting you\'ll settle it by ear. You\'ll settle it by asking which two ideas the transition actually connects — starting with a sentence where both placements look legal.</p>',
    closer:
      '<h2>Placement is a logic question</h2>' +
      '<p>When both spots are grammatical, the transition belongs with the two ideas it links — and a sentence is allowed to end with one. That\'s the read that separates two legal-looking choices.</p>',
    retrieval: 'Two choices, both grammatical: the transition before the period in one, after it in the other. From memory, what\'s the process that decides between them?',
    notes: '',
  },
  {
    slug: 'circle-toolkit-measure-arcs-and-equations',
    name: { proposed: 'Radius First', status: 'new', why: 'Every circle fact hangs off one measurement; naming the first step names the move.' },
    opener: null,
    closer:
      '<h2>Everything hangs off the radius</h2>' +
      '<p>Circumference, area, arc, tangent, equation — find the radius or the center first and the rest is one formula away. Only the area formula squares it; that\'s the swap the test is counting on.</p>',
    retrieval: null,
    notes: 'Opener body already sets up the three clues without an agenda — keep. Final check has its own stem — keep.',
  },
  {
    slug: 'command-of-evidence-clear-the-claim',
    name: { proposed: 'CLEAR', status: 'named', why: 'Already the lesson\'s name and its routine.' },
    opener:
      '<p>Command of Evidence questions hand you a claim and four quotations, findings, or graph patterns that all sound like support. Three of them are true statements that don\'t support the claim — the SAT\'s favorite kind of wrong.</p>' +
      '<p>CLEAR makes you predict the evidence before the choices start competing for your attention. Start with a claim and no choices at all.</p>',
    closer:
      '<h2>Evidence is a match, not a hunt</h2>' +
      '<p>Predict what the claim needs, then let the four choices audition for it. A true statement that doesn\'t do the claim\'s job is the trap — CLEAR is how you keep saying no to it.</p>',
    retrieval: 'Spell it out from memory: what does each letter of CLEAR tell you to do, in order?',
    notes: 'Goal callout dropped from the opener — the intro card carries it.',
  },
  {
    slug: 'custom-regression-from-data',
    name: { proposed: 'Fill the Constant', status: 'new', why: 'You type the form; Desmos fills the constant. Distinguishes it from the Regression-button lesson.' },
    opener:
      '<blockquote><p><strong>Prerequisite:</strong> Do not begin this lesson until you have completed <em>Find a Standard Regression Equation from Data</em>.</p></blockquote>' +
      '<p>This lesson assumes you already know how to:</p>' +
      '<ul><li>turn information from a table, graph, or word problem into input-output points;</li><li>enter those points in a Desmos table; and</li><li>use the Regression button to fit a standard linear, quadratic, or exponential model.</li></ul>' +
      '<p>This time the question tells you the equation\'s form and hides a constant in it. You\'ll type the form and let Desmos fill the constant — starting with a case the Regression button can\'t do.</p>',
    closer:
      '<h2>Type the form; Desmos finds the constant</h2>' +
      '<p>Points in a table, the required form with \\(\\sim\\), extra facts as definition lines — and read only the constants Desmos actually solved for. A constant you defined yourself never shows in the readout.</p>',
    retrieval: 'A question gives you three points and says the function has the form \\(y=ab^x\\). No scrolling back — what\'s the Desmos routine, first line to last?',
    notes: 'Only the last sentence of the opener changes; the prerequisite gate and the assumed-knowledge list stay.',
  },
  {
    slug: 'desmos-list-tools',
    name: { proposed: 'One Command, Whole List', status: 'new', why: 'The review\'s own rewrite of this opener is the register example in the guide.' },
    opener:
      '<p>Some SAT data questions hand you nine numbers and ask what happens to the mean if every value goes up by 4. You could retype nine numbers. Or you could type <strong>A+4</strong>. This lesson is the "or."</p>',
    closer:
      '<h2>Store it once, operate on all of it</h2>' +
      '<p>Name the list, and one command — <strong>A+2</strong>, <strong>join</strong>, <strong>mean</strong>, <strong>median</strong>, <strong>total</strong> — does the whole set\'s work. The Bluebook calculator isn\'t full Desmos: stick to what the testing calculator actually has.</p>',
    retrieval: 'No notes: what do square brackets, list arithmetic, join, and mean / median / total each do in Desmos?',
    notes: 'This lesson is queued for a Phase 4 rebuild (4.1); the opener and closer carry over to it.',
  },
  {
    slug: 'factor-out-greatest-common-factor',
    name: { proposed: 'Pull the Biggest Piece', status: 'new', why: 'What a tutor says at the board: pull the biggest shared piece out front.' },
    opener:
      '<p>Nearly every factoring problem on the test starts here: find the biggest piece every term shares — number and variables — and pull it out front. \\(12x^3+18x^2\\) becomes \\(6x^2(2x+3)\\), and the polynomial is suddenly short.</p>' +
      '<p>First, the number half of that shared piece.</p>',
    closer:
      '<h2>Pull it out, then look inside</h2>' +
      '<p>Biggest shared coefficient, smallest shared power of each variable, divide every term. Then check the parentheses again — "factored" and "fully factored" are different answers, and the half-factored one is sitting in the choices.</p>',
    retrieval: 'Say it back without looking: how do you factor out a GCF, and how do you know you\'re done?',
    notes: 'The four-item "you will learn how to" list and the goal callout go; the card states the move.',
  },
  {
    slug: 'factoring-polynomials-gcf-trinomials-difference-of-squares',
    name: { proposed: 'Multiplication Backwards', status: 'new', why: 'The lesson\'s own principle, and the reason a forgotten pattern can be rebuilt.' },
    opener:
      '<p>Factoring is multiplication run backwards — which is why two patterns cover most of what the SAT asks, and why you can rebuild either one under pressure instead of recalling a rule.</p>' +
      '<p>A short GCF check comes first; if it\'s shaky, the lesson pauses to rebuild it. Otherwise you\'ll move fast.</p>' +
      '<blockquote><p><strong>Scope:</strong> We will factor trinomials whose \\(x^2\\)-coefficient is \\(1\\). Trinomials such as \\(2x^2+7x+3\\) require a later method.</p></blockquote>',
    closer:
      '<h2>Run the multiplication backwards</h2>' +
      '<p>Sum-and-product for trinomials, difference of squares on sight, GCF first every time — and when no integer pair works, "prime" is a real answer. Distribute your factors to check; the original polynomial should come back.</p>',
    retrieval: null,
    notes: 'Retrieval check already has its own stem — keep.',
  },
  {
    slug: 'find-missing-constants-in-equivalent-expressions-with-regression',
    name: { proposed: 'List the Input', status: 'new', why: 'The one step that makes the regression work; also the tell when it\'s missing.' },
    opener: null,
    closer:
      '<h2>Define the input, then regress</h2>' +
      '<p>Rename the input to \\(x_1\\), give it a list of allowed values, swap \\(=\\) for \\(\\sim\\), and read the constants. If Desmos starts assigning a value to your input, you forgot the list — that\'s the tell.</p>',
    retrieval: 'From memory — the expression is equivalent "for all values of x" and two constants are missing. What\'s the Desmos routine, in order?',
    notes: 'Cold-open lesson: block 1 is the exploration and stays. Already ends on the authentic item.',
  },
  {
    slug: 'find-the-equation-with-my-numbers',
    name: { proposed: 'One Honest Story', status: 'new', why: 'Builds on My Numbers; the story-first discipline is the distinct move.' },
    opener: null,
    closer:
      '<h2>Story first. Equations second.</h2>' +
      '<p>Build one honest situation from the story before you read a single equation, then test every choice against it. Read the choices first and they quietly bend your numbers toward one of them.</p>',
    retrieval: 'A friend texts you a Find the Equation question. Without checking the lesson, what do you tell them to do — start to finish?',
    notes: 'Opener body is already in voice — keep. Closer keeps its heading and loses the five-step recap.',
  },
  {
    slug: 'functions-and-function-notation',
    name: { proposed: 'Notation Is a Point', status: 'new', why: 'The translation that makes \\(f(3)=6\\) usable.' },
    opener: null,
    closer:
      '<h2>Read the notation as a point</h2>' +
      '<p>\\(f(3)=6\\) is the point \\((3,6)\\) — something you can plot, substitute, or solve from. When a condition determines a missing constant, check it against your answer: a fit can return two values, and the problem accepts one.</p>',
    retrieval: 'Cover the screen. What does \\(f(a)=b\\) tell you, how do you evaluate and solve with it, and how do you find a missing constant in Desmos?',
    notes: 'Opener body lists what notation communicates without an agenda — keep.',
  },
  {
    slug: 'good-cop-bad-cop-reading-answers',
    name: { proposed: 'Good Cop / Bad Cop', status: 'named', why: 'Already the name students and tutors use.' },
    opener: null,
    closer:
      '<h2>One choice, two questions</h2>' +
      '<p>Good Cop asks what matches your target; Bad Cop hunts for the one word that makes it wrong. Keep a choice only when its whole meaning works — and don\'t cross out "all" or "never" on sight. Compare the strength of the choice to the strength of the text.</p>',
    retrieval: null,
    notes: 'Opener is a prerequisite gate — keep. Ends on its own paired final checks — leave the order.',
  },
  {
    slug: 'inference-minimum-supported-conclusion',
    name: { proposed: 'Smallest Leap', status: 'title', why: 'Already in the title ("Make the Smallest Supported Leap"); shortened to what a tutor says.' },
    opener:
      '<p>Inference questions end a text with a blank and four conclusions. The interesting one is almost always wrong — it adds a dot the passage never gave you. The right one is the smallest step the sentences already support.</p>' +
      '<blockquote><p><strong>Core rule:</strong> Connect the dots the text gives you. Do not add new dots.</p></blockquote>',
    closer:
      '<h2>Take the smallest supported step</h2>' +
      '<p>Soundbite each sentence, combine them, and stop at the conclusion the text already earns. If you\'re defending a choice with something you know instead of something the text says, it\'s the wrong choice.</p>',
    retrieval: '"Which choice most logically completes the text?" — from memory, what do you do before you look at the four choices?',
    notes: '',
  },
  {
    slug: 'initial-modifiers-match-the-noun-after-the-comma',
    name: { proposed: 'Noun After the Comma', status: 'title', why: 'Already in the title; it is the whole move.' },
    opener: null,
    closer:
      '<h2>Ask what the phrase describes</h2>' +
      '<p>The opening phrase reaches across the comma for its noun. Ask what it describes before you read a single choice — read them first and several of them start to sound fine.</p>',
    retrieval: null,
    notes: 'Cold-open lesson: block 1 is the exploration and stays. Final check has its own stem — keep.',
  },
  {
    slug: 'my-numbers-strategy',
    name: { proposed: 'My Numbers', status: 'named', why: 'Already the name.' },
    opener: null,
    closer:
      '<h2>Your numbers, your answer</h2>' +
      '<p>Pick easy values that obey every condition, solve your concrete version, and test the choices with the same values. If the problem ties two variables together, you only get to choose one — the other is calculated, never picked.</p>',
    retrieval: 'Test day. The variables have no fixed values and the choices are expressions. From memory, what\'s the My Numbers routine?',
    notes: 'Drop the "My Numbers in one glance" summary block (decision above).',
  },
  {
    slug: 'percentages-and-percent-change',
    name: { proposed: 'Type the Sentence', status: 'new', why: 'The move is literal: type the percent sentence and let regression solve it.' },
    opener: null,
    closer:
      '<h2>Translate the sentence; let regression do the rest</h2>' +
      '<p>Type the percent sentence almost word for word — Desmos writes "of" the moment you type % — and the base stays where the sentence put it. The value after "than" is the old value. Get that backwards and every step after it is wrong.</p>',
    retrieval: '"\\(p\\) is 40% greater than 65." Without looking back: how do you translate that, what goes after "than", and what do you check in the Desmos readout?',
    notes: 'Cold-open lesson: block 1 is the exploration and stays.',
  },
  {
    slug: 'probability-from-tables-favorable-over-total',
    name: { proposed: 'Total First', status: 'new', why: 'The review\'s suggestion; already the lesson\'s first instruction.' },
    opener:
      '<p>Most SAT probability questions don\'t ask you to count arrangements. They give you a table and bet that you\'ll count the favorable outcomes before you\'ve decided what you\'re drawing from. Nearly every wrong answer is a right count over the wrong total.</p>' +
      '<p>So: Total first. One event at a time — no <strong>and</strong>, no <strong>or</strong> in this lesson.</p>',
    closer:
      '<h2>Total first</h2>' +
      '<p>Decide the group you\'re drawing from before you count anything favorable — "given that" restricts the total, and it can name a row or a column. Favorable over Total, in that order.</p>',
    retrieval: 'A two-way table and the words "given that." No scrolling back — what do you do first, and then what?',
    notes: '',
  },
  {
    slug: 'rates-and-units-in-two-variable-equations',
    name: { proposed: 'Read the Units', status: 'title', why: 'Already in the title.' },
    opener: null,
    closer:
      '<h2>Units tell you what a term means</h2>' +
      '<p>Rate × the quantity it matches = a subtotal; subtotal + subtotal = the total. When a question asks what a coefficient means, check what the variable counts first — \\(9r\\) is a different sentence depending on whether \\(r\\) is hours or trips.</p>',
    retrieval: '"What does \\(9r\\) represent?" From memory: how do you read a term like that, and what do you check before you answer?',
    notes: 'Opener body is already in voice — keep.',
  },
  {
    slug: 'reading-comprehension-process-and-pre-answer',
    name: { proposed: 'Answer First', status: 'new', why: 'The pre-answer is the move; "Answer First" is how a tutor would say it.' },
    opener:
      '<p>Four polished choices are built to look reasonable one at a time. Arrive with your own rough answer and you\'re matching instead of being persuaded — that\'s the whole difference on main-idea, detail, function, and inference questions.</p>' +
      '<blockquote><p><strong>Core habit:</strong> Think before you look at the answer choices.</p></blockquote>',
    closer:
      '<h2>Think before the choices can</h2>' +
      '<p>Name the job, build a usable read, say the answer in your own words, then prove the match from the text. Keep your target rough — polish it into something that sounds like a choice and you\'ll talk yourself into one. Good Cop / Bad Cop sharpens the last step.</p>',
    retrieval: 'Your tutor asks you to teach the reading routine in twenty seconds. Which version is right?',
    notes: '',
  },
  {
    slug: 'rhetorical-synthesis-goal-first',
    name: { proposed: 'Let the Goal Lead', status: 'title', why: 'Already in the title.' },
    opener:
      '<p>The notes look like the task. They aren\'t — the student\'s stated goal is the decision-maker, and most choices are perfectly true statements from the notes that fail it. Start with the goal and no notes at all.</p>' +
      '<blockquote><p><strong>Core move:</strong> Start with "The student wants to..." — not with the notes.</p></blockquote>',
    closer:
      '<h2>The goal is a contract</h2>' +
      '<p>Turn "the student wants to…" into a requirement list, then eliminate. A goal joined by "and" has two halves; a choice that nails one and drops the other is out. The notes only break a tie.</p>',
    retrieval: 'Notes, a goal, four choices. From memory, what\'s the order of operations — and when, if ever, do you read the notes?',
    notes: 'Drop the "strategy in one glance" summary block (decision above).',
  },
  {
    slug: 'right-triangle-trigonometry-sohcahtoa',
    name: { proposed: 'Sketch and Label', status: 'new', why: 'The move that turns named vertices into a trig equation.' },
    opener: null,
    closer:
      '<h2>Sketch it; label from the angle you\'re using</h2>' +
      '<p>The SAT names vertices, not "opposite" and "adjacent" — your sketch does that translating, and then sine, cosine, or tangent is a mechanical pick. Adjacent is never the hypotenuse, and the calculator is in degrees before you press anything.</p>',
    retrieval: 'Triangle \\(DEF\\), right angle at \\(F\\), and the question asks for \\(\\tan D\\). No looking back: what do you draw, what do you label, and what do you check before computing?',
    notes: 'Opener body is already in voice — keep.',
  },
  {
    slug: 'scale-factor-and-similar-shapes',
    name: { proposed: 'One Factor, Three Powers', status: 'new', why: 'The lesson\'s own heading, in tutor-length.' },
    opener:
      '<p>When two shapes are <strong>similar</strong>, every length changes by one scale factor — and areas and volumes don\'t change by that same number. Scale factor \\(2\\): lengths and perimeters double, areas quadruple, volumes multiply by \\(8\\).</p>' +
      '<p>That\'s the whole lesson: one linear factor, raised to the power the question needs, in either direction.</p>',
    closer:
      '<h2>One linear factor, three powers</h2>' +
      '<p>Lengths by \\(s\\), areas by \\(s^2\\), volumes by \\(s^3\\) — and roots to go backward. Never cube an area ratio: get back to the linear factor first, then raise it.</p>',
    retrieval: 'Two similar solids, surface areas in the ratio \\(4:49\\), and the question wants volumes. Without looking back: what\'s the rule, and what\'s the trap?',
    notes: '',
  },
  {
    slug: 'similar-triangles',
    name: { proposed: 'Rank the Sides', status: 'new', why: 'The review\'s suggestion; the cross-check that stops the mental rotation.' },
    opener: null,
    closer:
      '<h2>Match the angles, rank the sides</h2>' +
      '<p>Equal angles say which vertices correspond; smallest side to smallest, largest to largest — and the proportion writes itself without rotating anything. The ranking is a cross-check: when the figure says "not drawn to scale," the angles decide.</p>',
    retrieval: 'Two triangles share two angles and you need a missing side. From memory: how do you pair the sides, and what stops you from mentally rotating the triangles?',
    notes: 'Opener body is already in voice — keep.',
  },
  {
    slug: 'solving-equations-by-graphing-x-intercepts',
    name: { proposed: 'Zero, Graph, Click', status: 'new', why: 'The review\'s "Zero-Graph-Click", as three words a tutor can say.' },
    opener:
      '<p>This turns a two-minute algebra problem into a twenty-second graph read: zero on one side, graph the other, click every place the curve touches the x-axis. Fractions, radicals, absolute values, a quartic — you never have to know what kind of equation it is.</p>' +
      '<blockquote><p><strong>Start with the graph on the next screen.</strong> You do not need to know the term <em>x-intercept</em> yet.</p></blockquote>',
    closer:
      '<h2>Zero, graph, click</h2>' +
      '<p>Get zero on one side, graph what\'s left, and every x-intercept is a solution — all of them, which is what "how many solutions" is really asking. When the choices are radicals and your intercept is a decimal, type the choice in and compare decimals.</p>',
    retrieval: 'Cover the screen. An equation with a square root and a fraction in it. What\'s the Desmos routine, start to finish?',
    notes: 'Six of the twelve retired tails are in this lesson.',
  },
  {
    slug: 'solving-equations-with-regression',
    name: { proposed: 'Tilde Swap', status: 'new', why: 'One equals sign becomes a tilde — the move in two words.' },
    opener: null,
    closer:
      '<h2>One equals sign becomes a tilde</h2>' +
      '<p>Swap \\(=\\) for \\(\\sim\\), use a variable Desmos can adjust, and read the assignment. One assigned value is one solution — when the question asks how many solutions exist, switch to graphing.</p>',
    retrieval: 'Say it back: how do you solve an equation with \\(\\sim\\), what do you read in the panel, and when is regression the wrong tool?',
    notes: 'Cold-open lesson: block 1 is the exploration and stays. Three of the retired tails are here.',
  },
  {
    slug: 'solving-systems-of-equations-by-graphing',
    name: { proposed: 'Type It, Click It', status: 'new', why: 'Both equations as written, then the crossing.' },
    opener:
      '<p>For essentially every SAT system, graphing is the default: type both equations exactly as written and click where they cross. No elimination, no substitution, and no sign slip to make.</p>' +
      '<blockquote><p><strong>Start by exploring.</strong> On the next screen, click the point where the two lines meet.</p></blockquote>',
    closer:
      '<h2>Type both, click the crossing</h2>' +
      '<p>Enter the equations as written — no simplifying — and every intersection is a solution. Then read the question again: it usually wants \\(x+y\\), or just \\(y\\), not the point you clicked.</p>',
    retrieval: 'A system with \\(t\\) and \\(u\\) instead of \\(x\\) and \\(y\\), and the question wants \\(t+u\\). From memory: the Desmos routine, in order.',
    notes: '',
  },
  {
    slug: 'special-right-triangles-45-45-90-and-30-60-90',
    name: { proposed: 'See the Triangle', status: 'title', why: 'The lesson\'s heading ("See the triangle before the angles appear"), shortened.' },
    opener: null,
    closer:
      '<h2>See the triangle before the angles appear</h2>' +
      '<p>A square\'s diagonal, half an equilateral triangle, "isosceles right" — none of them print \\(45\\) or \\(30\\), and one side gives you all three. The ratio is fixed; the size isn\'t. Find \\(k\\) before you write any side down.</p>',
    retrieval: null,
    notes: 'Opener body is already in voice — keep. Retrieval check already has its own stem — keep.',
  },
  {
    slug: 'special-systems-no-solution-and-infinitely-many',
    name: { proposed: 'Same Slope', status: 'new', why: 'Two words that decide both special cases.' },
    opener:
      '<p>In the previous lesson, you solved systems by graphing both equations and clicking their intersections. This lesson focuses on two special results:</p>' +
      '<ul><li><strong>No solution:</strong> the graphs never intersect.</li><li><strong>Infinitely many solutions:</strong> the two equations graph as the same line.</li></ul>' +
      '<p>On the SAT, a question often tells you which result a system must have and asks you to find one or more missing constants. It looks like heavy algebra. It collapses to matching one slope — and a slider will show you why before the algebra does.</p>',
    closer:
      '<h2>Same slope decides it</h2>' +
      '<p>Parallel lines never meet; identical lines overlap everywhere — so the question is only ever about slope, and then intercept. The slider is for seeing it, not answering: at \\(A=1.9\\) and \\(A=2\\) the lines look identical. Confirm with the slope or the ratio.</p>',
    retrieval: '"The system has infinitely many solutions. What is \\(k\\)?" — no scrolling back: what does that sentence tell you about the two lines, and how do you get \\(k\\)?',
    notes: 'Only the goal callout goes; the two-case list stays.',
  },
  {
    slug: 'standard-deviation',
    name: { proposed: 'Spread Meter', status: 'new', why: 'Reads standard deviation as what it is, not as a formula.' },
    opener: null,
    closer:
      '<h2>Read the spread; don\'t compute it</h2>' +
      '<p>Standard deviation is how far values typically sit from their own center — compare it by eye, and when a value moves, ask whether it moved away from the middle or toward it. A bigger mean does not mean a bigger spread.</p>',
    retrieval: 'From memory: what does standard deviation measure, what makes it bigger, and how do you ask Desmos for it?',
    notes: 'Opener body is already in voice — keep.',
  },
  {
    slug: 'standard-regression-from-data',
    name: { proposed: 'Table, Then Button', status: 'new', why: 'The two moves, in order; pairs with Fill the Constant.' },
    opener:
      '<p>Some SAT questions give you data — a table, a graph, a sentence — and four equations. You could test all four. Or you could type the points into a table and press one button, and Desmos hands you the equation.</p>',
    closer:
      '<h2>Points in a table, then the Regression button</h2>' +
      '<p>Turn the data into input-output pairs, enter them, press Regression, and translate the equation back to the problem. The order of each pair is the whole game: "after 2 hours there were 180 bacteria" is \\((2,180)\\), never \\((180,2)\\).</p>',
    retrieval: 'A word problem describes an exponential situation and the choices are four equations. Cover the screen: what\'s the table-and-button routine, in order?',
    notes: '',
  },
  {
    slug: 'subject-verb-agreement-odd-one-out',
    name: { proposed: 'Odd One Out', status: 'named', why: 'Already the name.' },
    opener:
      '<p>Some verb questions never make you find the subject. Put each choice after <strong>he</strong> and after <strong>they</strong>: when three choices go one way and one goes the other, the odd one out is the answer — and the interrupting phrase the test buried in the sentence never mattered.</p>' +
      '<blockquote><p><strong>The safety rule matters:</strong> use the trick only when every answer fits exactly one of <strong>he</strong> or <strong>they</strong>.</p></blockquote>',
    closer:
      '<h2>The odd one out — when the gate is open</h2>' +
      '<p>He or they, three to one, done. If the four choices differ in tense instead of number, the gate is closed: read the sentence the long way.</p>',
    retrieval: 'A verb question with four choices. From memory: how do you run the odd-one-out test, and what has to be true before you\'re allowed to?',
    notes: 'Drop the "shortcut in one glance" summary block (decision above).',
  },
  {
    slug: 'surveys-sampling-and-margin-of-error',
    name: { proposed: 'Sample, Then Scope', status: 'new', why: 'Check who was asked, then limit who you can talk about.' },
    opener:
      '<p>Survey questions look statistical and are almost entirely about scope: who was asked, and who you\'re therefore allowed to talk about. The arithmetic is a plus-or-minus at most.</p>' +
      '<p>Four decisions run every one of them — start with the first.</p>',
    closer:
      '<h2>Check the sample, then limit the claim</h2>' +
      '<p>Who was asked decides who the conclusion can be about — and margin of error measures sampling uncertainty only. It doesn\'t certify a survey was unbiased, and it doesn\'t guarantee the true value.</p>',
    retrieval: 'A survey question with a margin of error in it. No looking back: what four decisions do you make, and what does the margin of error <em>not</em> tell you?',
    notes: '',
  },
  {
    slug: 'testing-equivalent-expressions-with-desmos-sliders',
    name: { proposed: 'Slider Match', status: 'new', why: 'Match it, don\'t expand it — the lesson\'s own line, as a handle.' },
    opener:
      '<p>Some SAT questions hand you a messy expression with two or more variables — like \\(3a(2a-b)+b(a+5)\\) — and ask which answer choice is <em>equivalent</em>. Expand it by hand and you\'re one sign slip from the wrong answer. Or give every variable a slider and let the numbers pick the choice.</p>',
    closer: null,
    retrieval: null,
    notes: 'Closer is already a sign-off in voice ("You\'ve got it") — keep. No retrieval check; ends on a bank question.',
  },
  {
    slug: 'transitions-bracket-the-pivot',
    name: { proposed: 'Bracket the Pivot', status: 'named', why: 'Already the name and the title.' },
    opener: null,
    closer:
      '<h2>Bracket the pivot</h2>' +
      '<p>Shrink each side to a short statement, predict the relationship, then match — the topic stops mattering. Never start with the choices: four polished transition words become four competing interpretations if you haven\'t predicted first.</p>',
    retrieval: null,
    notes: 'Opener is already the test-day payoff — keep. Retrieval check already has its own stem — keep.',
  },
  {
    slug: 'words-in-context-read-predict-match',
    name: { proposed: 'Read, Predict, Match', status: 'title', why: 'Already in the title.' },
    opener:
      '<p>Every choice in a Words in Context question is a real word that fits the grammar. Nothing separates them except a prediction you make before you see them — from the whole text, not just the sentence with the blank.</p>',
    closer:
      '<h2>Read, predict, match</h2>' +
      '<p>Decide what the blank must mean before you see a single word, then match. The blank\'s sentence tells you where the answer goes; the whole text tells you what it means. If nothing matches your prediction, make a second pass rather than settling.</p>',
    retrieval: 'Cover the screen. A Words in Context blank. What do you do before you read the choices, and what do you do if none of them fits your prediction?',
    notes: '',
  },
];
