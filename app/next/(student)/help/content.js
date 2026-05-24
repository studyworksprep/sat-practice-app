// Single source of truth for the student Help section on the new tree.
// Each article is rendered by app/next/(student)/help/[slug]/page.js;
// the index page (app/next/(student)/help/page.js) lists them in `order`.
//
// Content is hand-authored constant HTML (trusted source), so the article
// page can render it directly via dangerouslySetInnerHTML without
// SafeHtml sanitization. Internal links use href values that match the
// next-tree route names — '/practice/start', '/notes', '/review',
// '/practice/tests' — so the article cross-links navigate within the
// student tree rather than bouncing to legacy.

export const HELP_ARTICLES = [
  {
    slug: 'getting-started',
    title: 'Welcome — Start Here',
    blurb: 'A 2-minute orientation to Studyworks and what to do in your first week.',
    summary: 'New to Studyworks? Read this first. A short orientation to the platform, a five-step plan for your first week, a quick tour of every tab in the top nav, and pointers to the most useful guides for self-study students.',
    icon: '👋',
    order: 1,
    sections: [
      {
        heading: 'What Studyworks is for',
        html: `
<p>Welcome — glad you're here. Studyworks is your home base for SAT and ACT practice, and the goal of this Help section is to make sure you can use it confidently on your own.</p>
<p>The whole platform is built around three things:</p>
<ul>
  <li><strong>Practice the right questions.</strong> Instead of grinding through random sets, you'll run focused sessions on the specific skills that are limiting your score right now.</li>
  <li><strong>Turn each lesson into something you'll remember.</strong> Studyworks gives you three different study tools — Flashcards, Error Log entries, and Notes — so you can capture every kind of learning in the place where it'll be most useful later.</li>
  <li><strong>Measure progress with realistic practice tests.</strong> Full-length, adaptive simulations of the digital SAT and the ACT, so you always know where you actually stand.</li>
</ul>
<p>You don't need a tutor to use any of this well — plenty of students hit big score gains on their own. The articles in this Help section walk you through every tab in the top nav, explain the three study tools and when to use each, and lay out a self-study routine you can follow week by week. Skim what's useful; come back when something new comes up.</p>
        `,
      },
      {
        heading: 'Your first week — do this',
        html: `
<p>This is the simple loop. Don't worry about being perfect — just get the rhythm started.</p>
<ol>
  <li><strong>Take a baseline practice test.</strong> Open the <a href="/practice/tests"><em>Practice tests</em></a> tab and complete one full-length test under realistic conditions. It feels intimidating before you do it, but it's the single most useful thing you can do in week one: it gives you a starting score, tells the platform what to recommend, and makes the rest of your prep concrete.</li>
  <li><strong>Spend half an hour with your Dashboard.</strong> Look at the Performance grid — those segmented bars show your accuracy on every skill. The red and yellow segments are where the points are hiding. Pick two or three skills to focus on first.</li>
  <li><strong>Run a Practice session each weekday.</strong> Open <a href="/practice/start"><em>Practice</em></a>, click the skills you chose, and do 10-15 questions. Some days it'll feel hard — that's the point. The questions you struggle with are the ones teaching you something.</li>
  <li><strong>Capture every miss with the right tool.</strong> Studyworks gives you three ways to save what you learn: <strong>Flashcards</strong> for a term or formula you didn't know, <strong>Error Log</strong> for a process mistake or a trap you fell for, and <strong>Notes</strong> for a topic you need to actually learn. Choosing well takes about ten seconds and pays off for the rest of your prep — see the <a href="/help/notes">Notes guide</a> for examples.</li>
  <li><strong>Re-test every two weeks.</strong> Take another practice test, compare the score, and adjust which skills you're targeting. Real movement shows up over weeks, not days, so don't panic if a single session goes badly.</li>
</ol>
<p>That's the whole loop. Everything else in this Help section explains pieces of it in more detail — read whichever ones feel relevant when a question comes up.</p>
        `,
      },
      {
        heading: 'The tabs in the top nav, briefly',
        html: `
<ul>
  <li><strong><a href="/dashboard">Dashboard</a></strong> — your stats, performance breakdown, and what to do next.</li>
  <li><strong><a href="/practice/start">Practice</a></strong> — start a self-guided session, filtered to whatever you want to work on.</li>
  <li><strong><a href="/practice/tests">Practice tests</a></strong> — launch a full-length, timed, adaptive SAT or ACT.</li>
  <li><strong><a href="/assignments">Assignments</a></strong> — work assigned by your tutor (skip if you don't have one).</li>
  <li><strong><a href="/notes">Notes</a></strong> — rich-text notes, your Error Log, and Flashcards. All your study material in one place.</li>
  <li><strong><a href="/review">Review</a></strong> — drills on your weakest skills + a study surface for the days before the test.</li>
</ul>
        `,
      },
      {
        heading: 'Most useful articles for new students',
        html: `
<ul>
  <li><a href="/help/study-routine"><strong>Study Routine (No Tutor)</strong></a> — exactly what to do each week if you're studying on your own.</li>
  <li><a href="/help/notes"><strong>Notes, Error Log &amp; Flashcards</strong></a> — the new system for capturing and reviewing your mistakes. This is the feature most students underuse.</li>
  <li><a href="/help/scores"><strong>Understanding Your Scores</strong></a> — what difficulty levels, score bands, and practice-test scores actually mean.</li>
</ul>
        `,
      },
    ],
  },
  {
    slug: 'dashboard',
    title: 'Your Dashboard',
    blurb: 'Greeting, stats tiles, recently finished, and the performance grid.',
    summary: 'Your Dashboard is the single-screen summary you land on after logging in. It shows your target, your week-over-week pace, what you most recently completed, and a Performance grid that segments every domain by skill so you can see at a glance where the points are hiding.',
    icon: '📊',
    order: 2,
    sections: [
      {
        heading: 'What the Dashboard is',
        html: `
<p>The <a href="/dashboard">Dashboard</a> is the page you land on when you log in. It's a single-screen summary of where you stand and what to do next.</p>
        `,
      },
      {
        heading: 'The banner — target, accuracy, days to test',
        html: `
<p>Top of the page. Shows your name, your target score (you can change it inline), your overall accuracy, and a countdown to your test date if you've set one. If you have an in-progress practice session, a <strong>Resume</strong> button appears here too.</p>
<p>Set a target score if you haven't yet — having a number on the screen makes the work feel concrete. A realistic 3-month goal is your baseline + 100 to 150 points.</p>
        `,
      },
      {
        heading: 'Pending assignments',
        html: `
<p>If you have a tutor, any open assignments show here, with the newest first. Click in to start. No tutor? You won't see anything here — that's normal.</p>
        `,
      },
      {
        heading: 'Stats tiles',
        html: `
<p>Four numbers, computed from everything you've ever done on the platform:</p>
<ul>
  <li><strong>Total questions</strong> — running count of attempts.</li>
  <li><strong>This week</strong> — what you've done in the last 7 days. The single best leading indicator that you're studying enough.</li>
  <li><strong>Overall accuracy</strong> — the high-level number. Don't chase it as a goal; use the per-skill bars below instead.</li>
  <li><strong>Practice tests taken</strong> — count, and your latest composite.</li>
</ul>
        `,
      },
      {
        heading: 'Recently finished',
        html: `
<p>A unified feed of your most recent completed practice sessions, practice-test attempts, and assignments — newest at top. Click any row to open its report.</p>
<p>This is the fastest path back into a review: finished a session 10 minutes ago and want to see what you got wrong? Click it here.</p>
        `,
      },
      {
        heading: 'Performance grid',
        html: `
<p>This is the most useful section on the Dashboard — the one to come back to whenever you're not sure what to practice next.</p>
<p>You'll see two columns: <strong>Math</strong> and <strong>Reading &amp; Writing</strong>. Each one is broken into domains (Algebra, Advanced Math, Information and Ideas, Standard English Conventions, and so on). Inside each domain bar you'll see <strong>colored segments</strong> — one per skill in that domain. The width of a segment shows how much you've practiced that skill; the color shows how well you're doing on it.</p>
<p>Color tones:</p>
<ul>
  <li><strong>Green</strong> (80%+): you have this skill. Maintain it with the occasional question; don't waste time grinding here.</li>
  <li><strong>Yellow / amber</strong> (50-79%): you know it, but inconsistently. More reps will turn this green — these skills usually give the fastest gains.</li>
  <li><strong>Red</strong> (under 50%): a real weakness. Slow down, read the rationales carefully, and treat anything you don't understand as a topic to actually learn (a Note), not just to re-attempt.</li>
</ul>
<p>Hover or tap a segment to see which skill it represents and your accuracy on it. When you're picking what to practice, scan for the red and yellow segments inside the domains you care about most.</p>
<p>Take ACT questions too? A separate ACT performance card appears here with the same shape. If you've never attempted an ACT question, that card stays hidden so the page doesn't feel cluttered.</p>
        `,
      },
      {
        heading: 'Weekly accuracy trend',
        html: `
<p>A 13-week line chart of your weekly accuracy. Look for the slope — going up is good, flat is fine if you're at a high level, going down means review days are getting skipped.</p>
        `,
      },
    ],
  },
  {
    slug: 'practice',
    title: 'Practice Sessions',
    blurb: 'How to start, run, and review a filtered practice session.',
    summary: 'A Practice session is a set of questions you pick by filter and work through in one sitting — no timer, no adaptive scoring, just focused reps on whatever you want to drill. This guide covers how to choose useful filters, what each control in the runner does, and how to get the most out of the post-session review.',
    icon: '🎯',
    order: 3,
    sections: [
      {
        heading: 'What a Practice session is',
        html: `
<p>A <a href="/practice/start">Practice session</a> is a set of questions you pick by filter, taken in one sitting. Unlike a Practice test, there's no timer or adaptive scoring — just a flexible way to drill the skills you choose.</p>
        `,
      },
      {
        heading: 'Starting a session',
        html: `
<p>Open the <em>Practice</em> tab. The filter panel lays out everything you need to pick what to work on:</p>
<ul>
  <li><strong>Math and Reading &amp; Writing columns</strong> — the two subjects sit side by side. You can pick skills from one column, the other, or both. There's no toggle, so a mixed session (a little Math, a little R&amp;W) is one click away if that's what you want. If you also practice ACT questions, switch tests with the tab at the top.</li>
  <li><strong>Domain &amp; Skill filters</strong> — each domain expands to show its individual skills. <em>This is the high-leverage move</em>: a session of 15 questions on one skill teaches you far more than 15 random questions across the whole test. When in doubt, pick the weakest skill you can see on your Dashboard and click just that one.</li>
  <li><strong>Difficulty</strong> — Easy, Medium, or Hard. Match your current level, then push up when you start getting most questions right. Mixing in one or two harder questions per session is fine; an all-Hard session early on usually just frustrates.</li>
  <li><strong>Score band</strong> — a precise 1-to-7 difficulty rating that lines up with the public Easy/Medium/Hard buckets. See <a href="/help/scores">Understanding Your Scores</a> for the full mapping.</li>
  <li><strong>Session size and order</strong> — pick how many questions and whether you want them randomized, then hit <strong>Start</strong>. A live counter shows how many questions match your filters before you commit.</li>
</ul>
<p>If you already have a session in progress, a <strong>Resume</strong> card appears at the top so you can pick up exactly where you left off. Studyworks remembers your spot, your answers, and any notes you wrote, so it's safe to close the tab whenever you need to.</p>
        `,
      },
      {
        heading: 'Inside the session — what each control does',
        html: `
<p>The runner is intentionally similar to the real digital SAT so the layout feels familiar on test day. Here's what each piece does:</p>
<ul>
  <li><strong>Question chips at the bottom</strong> — small numbered chips along the bottom of the page let you jump to any question in the session. Chips fill in as you answer; flagged questions get a marker so they're easy to find later.</li>
  <li><strong>Mark for review</strong> — flag a question to come back to. The flag persists into the post-session report and into your Marked filter on the Practice page.</li>
  <li><strong>Reveal Answer</strong> — once you've committed to a choice, hitting <strong>Reveal Answer</strong> shows both the correct answer and the full written rationale. Always read the rationale, even on questions you got right — sometimes you'll discover you got there for the wrong reason, which is a silent score leak worth fixing.</li>
  <li><strong>Desmos calculator</strong> — the same embedded calculator you'll use on the digital SAT (Math only). Use it on every practice session; muscle memory matters on test day.</li>
  <li><strong>Reference sheet</strong> — the Math formula sheet, one click away. Keep using it even when you remember the formula — it teaches you to find what you need fast.</li>
  <li><strong>Error Log button</strong> — appears after you reveal the answer. One of three places to capture what you learned from the question (Flashcards and Notes are the other two; see the <a href="/help/notes">Notes guide</a> for which to use when).</li>
</ul>
<p>You can leave a session at any time and come back. Progress saves automatically — your answers, your reveals, and your notes are all preserved.</p>
        `,
      },
      {
        heading: 'Practice history & post-session review',
        html: `
<p>The <strong>Practice history →</strong> link on the Practice page shows every session you've completed, newest first. Each row has accuracy, size, and a <strong>Review</strong> button that opens the full report — every question, your answer, the correct answer, and the rationale, all on one page.</p>
<p>The review page is where the score actually comes from. Skim it after every session. Look for: questions you got right but guessed on, questions where the rationale surprised you, and skills where you missed two or more.</p>
        `,
      },
    ],
  },
  {
    slug: 'practice-tests',
    title: 'Practice Tests',
    blurb: 'Full-length, timed, adaptive — how to take one and what to do after.',
    summary: 'A Practice test is a full-length, timed simulation of the digital SAT or the ACT — the closest thing to the real exam you can do on Studyworks. This guide covers when to take one, how to take it under realistic conditions, and (most importantly) what to do during the post-test review, which is where the actual score gains come from.',
    icon: '📝',
    order: 4,
    sections: [
      {
        heading: 'What a Practice test is',
        html: `
<p>A full-length, timed simulation. The digital SAT version has two R&amp;W modules and two Math modules, with the second module of each adapting to how you did on the first — exactly like the real test. The ACT version has the four ACT sections.</p>
<p>Launch from the <a href="/practice/tests">Practice tests</a> tab.</p>
        `,
      },
      {
        heading: 'When to take one',
        html: `
<ul>
  <li><strong>Right away.</strong> Take your first one in your first week — this is your baseline.</li>
  <li><strong>Every 2 weeks.</strong> Often enough to see real progress, not so often that you burn out.</li>
  <li><strong>Two weeks before the real test.</strong> Final dress rehearsal under realistic conditions.</li>
</ul>
        `,
      },
      {
        heading: 'How to take it well',
        html: `
<ul>
  <li><strong>Sit it in one go.</strong> Don't split modules across days — the timing and stamina are the point.</li>
  <li><strong>Quiet room, no phone.</strong> Treat it like the real thing.</li>
  <li><strong>Use the on-screen Desmos calculator only.</strong> Don't reach for a separate one.</li>
  <li><strong>Don't look up answers mid-test.</strong> Flag and move on, just like the real exam.</li>
</ul>
<p>If you have accommodations (extra time, etc.), set them in the launch panel before you start.</p>
        `,
      },
      {
        heading: 'After the test — this is where the score comes from',
        html: `
<p>Most students take a test, look at the score, and stop. The score doesn't teach you anything — the review does.</p>
<ol>
  <li>The Practice tests page shows a <strong>history table</strong> with your composite, RW, and Math scores per attempt. Click <strong>Review</strong> on the row.</li>
  <li>Go through every question you got wrong <em>and every question you guessed on</em>, even if you got it right.</li>
  <li>For each one, ask: did I not know the content, or did I make a process mistake?</li>
  <li>For any pattern that emerges, write a Note (see the <a href="/help/notes">Notes</a> article). The same mistake twice is a real weakness; capture it.</li>
</ol>
<p>An hour of post-test review will move your score more than another full test will.</p>
        `,
      },
      {
        heading: 'Score trend & best composite',
        html: `
<p>The Practice tests page shows a <strong>mini trend chart</strong> of your recent composites plus your <strong>best composite</strong>. Track the best, not the average — it's a closer match to what you'll get on test day.</p>
        `,
      },
    ],
  },
  {
    slug: 'notes',
    title: 'Notes, Error Log & Flashcards',
    blurb: 'The Notes tab is where you turn mistakes into improvement. Read this.',
    summary: 'The Notes tab is your study hub. It gives you three different tools for capturing what you learn: Flashcards for terms and formulas, Error Log entries for process mistakes and traps, and Notes for concepts that need a real explanation. Choosing the right tool for each lesson is the single highest-leverage habit on the platform — this article walks through when to use which.',
    icon: '📓',
    order: 5,
    sections: [
      {
        heading: 'Why the Notes tab matters more than new questions',
        html: `
<p>The single biggest difference between students who improve fast and students who plateau isn't talent or hours — it's what they do with what they get wrong. Doing more questions while forgetting the same mistakes is a treadmill: a lot of effort, not much movement. Capturing what you learn from each miss is what actually moves the score.</p>
<p>That's what the <a href="/notes">Notes</a> tab is for. It gives you <strong>three different study tools</strong> in one place, and the most important thing to learn is which one to reach for in which situation. Read the next section carefully — this is the part most students miss.</p>
        `,
      },
      {
        heading: 'Choosing the right tool — Flashcards vs Error Log vs Notes',
        html: `
<p>When you get a question wrong (or get it right but feel shaky about it), ask yourself: <em>what specifically did I just learn?</em> The answer points to one of three tools.</p>
<p><strong>📇 Flashcard</strong> — use this when the lesson is a single piece of information you need to remember on demand. A vocabulary word and its definition. A geometry formula. A grammar rule like "semicolons join two independent clauses." Flashcards are best at the small, atomic stuff: one fact per card, drilled into long-term memory through repetition. If you can write it as a question-and-answer pair, it belongs on a flashcard. <a href="/help/flashcards">Full guide to Flashcards →</a></p>
<p><strong>🔍 Error Log</strong> — use this when the lesson is about your <em>process</em>: a trap you fell for, a step you skipped, a misread, a wrong assumption. "I assumed 'except' meant the same as 'such as.'" "I solved for x but the question asked for 2x." "I picked the most extreme answer choice without checking." Error Log entries aren't about content you didn't know — they're about the specific habit you want to change. Next time you face the same kind of question, your past note pops up and reminds you not to make the same move. <a href="/help/error-log">Full guide to the Error Log →</a></p>
<p><strong>📓 Notes</strong> — use this when the lesson is a concept that needs explaining, not just memorizing. A multi-step solution method. A topic you genuinely don't understand yet. Anything with multiple parts, examples, diagrams, or worked steps. Notes are full rich-text documents: you can format text, embed math, draw diagrams, and tag the note with the topic it covers. Use them when a flashcard would feel too small and an Error Log entry wouldn't say enough.</p>
<p>If you're not sure which one applies, ask: <em>could I explain this on a single index card? could I sum it up as "next time, do X instead of Y"? or does it actually need a paragraph?</em> The right tool is usually obvious once you frame it that way.</p>
        `,
      },
      {
        heading: 'Notes — for concepts you need to actually learn',
        html: `
<p>A Note is a full rich-text document. You can format text, embed math notation, draw diagrams with Excalidraw, and tag the note with any labels you like. Each note can be linked to a specific question; when it is, the subject, domain, and skill auto-fill so you can filter on them later.</p>
<p>Good things to make a Note about:</p>
<ul>
  <li>A topic-level summary sheet — "How to handle systems of equations word problems," with the method, two worked examples, and the traps to watch for.</li>
  <li>A vocabulary list with example sentences in context (better than flashcards once the word has multiple shades of meaning).</li>
  <li>A hard problem worked through in your own words, so the explanation makes sense to <em>you</em>.</li>
  <li>A pre-test checklist — strategies, timing notes, reminders to read before a practice test.</li>
</ul>
<p>Open <a href="/notes">/notes</a> to see everything you've written. Click <strong>+ New note</strong> to start a new one. The sidebar lets you filter by subject, domain, skill, or any tag you've used. When you write a Note about something you also want to drill from memory (a formula, a term), make a Flashcard for it as well — the two tools complement each other.</p>
        `,
      },
      {
        heading: 'Where to go next',
        html: `
<p>Each of the three tools has its own dedicated guide with the full details, examples, and common pitfalls:</p>
<ul>
  <li><a href="/help/error-log"><strong>Error Log</strong></a> — how to write entries that actually change your habits, and how to use the two views (manage vs study).</li>
  <li><a href="/help/flashcards"><strong>Flashcards</strong></a> — how the spaced-repetition mastery system works, and how to write cards that actually teach you something.</li>
  <li><a href="/help/study-routine"><strong>Study Routine</strong></a> — how all three tools fit into a weekly self-study plan.</li>
</ul>
        `,
      },
    ],
  },
  {
    slug: 'error-log',
    title: 'Error Log',
    blurb: 'A journal of process mistakes you don\'t want to repeat — one entry per missed question.',
    summary: 'The Error Log is a per-question journal of process mistakes — traps you fell for, steps you skipped, assumptions you made. It\'s most useful for changing your habits over time. This guide covers how to write a good entry, when to use it (and when to reach for a Flashcard or Note instead), and how to use the two Error Log views in your weekly routine.',
    icon: '🔍',
    order: 6,
    sections: [
      {
        heading: 'What the Error Log is',
        html: `
<p>The Error Log is a running journal of what you got wrong — but with a specific focus. Each entry is <strong>tied to a single question</strong> and lives at <a href="/notes/error-log">/notes/error-log</a>. There's one entry per question, so re-attempting the same question later updates the existing entry rather than creating a new one.</p>
<p>You'll create most entries straight from the Practice runner: after you reveal the answer on a question, click the <strong>Error Log</strong> button and write a short note about what happened. You can also edit existing entries later from the management view if you want to add a follow-up thought.</p>
        `,
      },
      {
        heading: 'When to use the Error Log (vs the other tools)',
        html: `
<p>The Error Log is for <strong>process mistakes</strong> — the kind where the lesson is about a decision you'd want to make differently next time. It is <em>not</em> for content gaps. Use the right tool for the right kind of mistake:</p>
<ul>
  <li>"I didn't know what 'cogent' means." → That's a <a href="/help/flashcards">Flashcard</a>, not an Error Log entry.</li>
  <li>"I don't really understand how to solve systems of equations word problems." → That's a <a href="/help/notes">Note</a>, not an Error Log entry.</li>
  <li>"I assumed 'except' meant the same as 'such as.'" ✅ Error Log.</li>
  <li>"I solved for x but the question asked for 2x." ✅ Error Log.</li>
  <li>"I picked the most extreme answer choice without checking the others." ✅ Error Log.</li>
  <li>"I started writing the equation before reading the last sentence of the prompt." ✅ Error Log.</li>
</ul>
<p>If you find yourself writing an Error Log entry that's really about a content gap, copy the lesson into a Flashcard or Note instead. The Error Log gets more useful — not less — when you keep it focused on process.</p>
        `,
      },
      {
        heading: 'How to write a useful entry',
        html: `
<p>An entry doesn't need to be long. Aim for one or two sentences, focused on the move you made (or didn't) — the thing you'd want to do differently next time.</p>
<p>Useful template: <em>"Next time, [do this] instead of [what I did]."</em></p>
<p>Examples:</p>
<ul>
  <li>"Next time, circle the word the question actually asks for before solving — I solved for x but the prompt wanted 2x."</li>
  <li>"Next time, read all four answer choices before committing. I jumped at (A) because it 'looked right' and missed that (C) was exactly what the passage said."</li>
  <li>"Next time, convert the units in the first step. I worked the whole problem in feet and the answer choices were in inches."</li>
</ul>
<p>What to avoid:</p>
<ul>
  <li><strong>Don't just restate the right answer.</strong> "The answer is C" doesn't help you next time. <em>Why</em> you didn't pick C is what matters.</li>
  <li><strong>Don't be vague.</strong> "I was careless" doesn't teach you anything. "I assumed 'few' and 'a few' meant the same thing" does.</li>
  <li><strong>Don't apologize to yourself in the note.</strong> You're writing for your future self in the middle of a study session — they need the lesson, not the guilt.</li>
</ul>
        `,
      },
      {
        heading: 'The two Error Log views',
        html: `
<p>The same entries are surfaced in two places, with different layouts depending on what you're trying to do:</p>
<ul>
  <li><strong><a href="/notes/error-log">/notes/error-log</a> — Manage view.</strong> A tight list of every entry, with three counters at the top: total entries, how many you're still getting wrong on your latest attempt, and how many you've fixed (latest attempt correct). Each row shows the question metadata plus your note; click <strong>Show question</strong> to expand the original question inline. This is the view to scan when you want to ask "what's currently in my Error Log?" or "which entries should I clean up or update?"</li>
  <li><strong><a href="/review/error-log">/review/error-log</a> — Study view.</strong> Each entry is fully expanded with the question stem, answer choices, official rationale, and your note all visible at once. Best for a sit-down review session — make a coffee, open this view, and read top to bottom for half an hour a few days before your test.</li>
</ul>
<p>Both views combine SAT and ACT entries into a single unified list, sorted newest first.</p>
        `,
      },
      {
        heading: 'How to use it in your routine',
        html: `
<p>The Error Log compounds over time — its value grows as you build the habit of contributing to it and re-reading it. Some patterns that work:</p>
<ul>
  <li><strong>Contribute in real time.</strong> Write the entry the moment you reveal the answer, while your reasoning is fresh. If you wait a day, you'll forget what you were thinking.</li>
  <li><strong>Re-read weekly.</strong> Once a week (review day is perfect), open <a href="/review/error-log">/review/error-log</a> and read your most recent entries. You're looking for <em>patterns</em>: the same trap showing up again, the same kind of careless slip, the same content gap leaking through.</li>
  <li><strong>Promote patterns into focused practice.</strong> When you notice a pattern ("I keep falling for absolute-value sign errors"), spend the next Practice session on that exact thing. The Error Log is most useful when it changes what you study next.</li>
  <li><strong>Skim it the night before a practice test.</strong> Not to cram, but to put your most common mistakes back at the top of your mind. Ten minutes is plenty.</li>
</ul>
        `,
      },
    ],
  },
  {
    slug: 'flashcards',
    title: 'Flashcards',
    blurb: 'For terms, formulas, and rules — anything you need to remember on demand.',
    summary: 'Flashcards are for the small, atomic stuff: one fact per card, drilled into long-term memory through spaced repetition. This guide covers how the mastery system works, when to reach for a flashcard vs a Note, how to write cards that actually teach you something, and how to fit a few minutes of card review into your day.',
    icon: '📇',
    order: 7,
    sections: [
      {
        heading: 'What flashcards are good for',
        html: `
<p>Flashcards are best at one thing: turning a small piece of information into something you can recall instantly under test pressure. Use them when the lesson is atomic — a single fact, term, formula, or rule that you need to know cold.</p>
<p>Great flashcard material:</p>
<ul>
  <li>Vocabulary words and their definitions (especially the SAT vocab that shows up in Words in Context questions).</li>
  <li>Math formulas you need to recall without thinking — the quadratic formula, area of a trapezoid, exponent rules.</li>
  <li>Grammar rules with one clean takeaway — "use 'whom' as the object of a verb or preposition."</li>
  <li>Common SAT/ACT conventions — the order of operations on Roman-numeral questions, what "least possible value" implies for the answer choices.</li>
</ul>
<p>Not great flashcard material:</p>
<ul>
  <li>Multi-step procedures (use a <a href="/help/notes">Note</a> instead — flashcards can't carry diagrams or worked examples well).</li>
  <li>"How to think about" a topic — that's a Note, not a card.</li>
  <li>Words with multiple shades of meaning that depend on context — better captured as a Note with example sentences.</li>
  <li>Process mistakes you want to stop making — those belong in the <a href="/help/error-log">Error Log</a>, where they appear next to the question that taught you the lesson.</li>
</ul>
        `,
      },
      {
        heading: 'How the mastery system works',
        html: `
<p>Each card carries a <strong>mastery score from 0 to 5</strong>. Brand-new cards start at 0; correctly answering a card during review raises its mastery, missing it lowers it. The review picker weights cards by mastery — the lower your mastery on a card, the more often it'll come up.</p>
<p>What this means in practice: you don't have to manage which cards to drill. Just review the set and let the system surface the ones you don't know yet. Cards you've mastered will still appear occasionally so the memory stays fresh, but they won't dominate your time.</p>
<p>The Flashcards page shows an <strong>average mastery</strong> for each set as a percentage. It's a useful at-a-glance signal: a set sitting at 30% needs more reps; a set at 90% is mostly maintenance and you might be better off spending time on a different set.</p>
        `,
      },
      {
        heading: 'Your sets and the default sets',
        html: `
<p>Open <a href="/notes/flashcards">/notes/flashcards</a> and you'll see two kinds of sets:</p>
<ul>
  <li><strong>Default sets</strong> — vocabulary and formula sets Studyworks ships with, available to every student. Good starting point for vocab review even before you start making your own cards.</li>
  <li><strong>Your sets</strong> — sets you create yourself, private to your account.</li>
</ul>
<p>For each set, you'll see two actions: <strong>Manage</strong> (add, edit, or delete cards) and <strong>Review</strong> (start a review session — the mastery-weighted picker chooses which cards to show).</p>
        `,
      },
      {
        heading: 'How to write a good flashcard',
        html: `
<p>The single most common flashcard mistake is putting too much on one card. The point of a card is to test recall of one specific thing; bigger cards are harder to remember <em>and</em> harder to actually drill, because you can't tell whether you got "most of it right" or not.</p>
<p>Rules of thumb:</p>
<ul>
  <li><strong>One fact per card.</strong> "What does 'ephemeral' mean?" is a card. "Tell me about vocabulary" is not.</li>
  <li><strong>Make the front genuinely need the back.</strong> If the front of the card is enough to answer itself, the card teaches nothing. "When semicolons are used" is too easy; "Joining two independent clauses without a conjunction requires which punctuation?" is testable.</li>
  <li><strong>Phrase the front as a question or a prompt</strong>, not a label. Pulls your brain into recall mode instead of pattern-matching mode.</li>
  <li><strong>For vocabulary, add an example sentence on the back.</strong> The definition tells you what the word means; an example sentence shows you how it actually behaves.</li>
  <li><strong>For formulas, write the front as a situation, not the formula itself.</strong> "Area of a trapezoid" is fine, but "You're given the two parallel sides and the height of a trapezoid; how do you find the area?" trains the recall you actually need on the test.</li>
</ul>
        `,
      },
      {
        heading: 'Fitting flashcards into your routine',
        html: `
<p>Flashcards work best in short, frequent bursts — much better than one long session per week. Five minutes on the bus, ten minutes between classes, a few minutes before bed: that's the rhythm.</p>
<p>A workable pattern:</p>
<ul>
  <li><strong>Once a week — set creation.</strong> Make new cards from the vocab and formulas you collected in your Practice sessions and Notes that week. Aim for 5-10 new cards per session; resist the urge to mass-import a 500-word list (you won't actually drill them all).</li>
  <li><strong>Most days — short review.</strong> Five to ten minutes on the set you're currently building mastery on. The mastery system handles which cards you see; you just hit Review.</li>
  <li><strong>Before a practice test or the real test.</strong> A few minutes of formula review on test morning is genuinely useful — it loads the formulas into immediate recall while the test is in front of you.</li>
</ul>
<p>One small thing: don't skip a card just because you're not sure. Make a guess, then check. Guessing-and-checking trains recall in a way that "I'll come back to this" never does.</p>
        `,
      },
    ],
  },
  {
    slug: 'review',
    title: 'The Review Tab',
    blurb: 'Common Errors, Weak Queue, and the pre-test study surface.',
    summary: 'The Review tab is a focused study surface for the days before your test. It gives you two active drill tools — Common Errors and the Weak Questions drill — plus links into long-form re-reading of your saved Notes, Error Log, and Flashcards. Lean on it most heavily in the final two weeks before test day.',
    icon: '🔁',
    order: 8,
    sections: [
      {
        heading: 'What the Review tab is for',
        html: `
<p>The <a href="/review">Review</a> tab is a study surface for the days before your test. "I have ten days; what should I do?" — the Review tab answers that. It has two kinds of tools.</p>
        `,
      },
      {
        heading: 'Active drills',
        html: `
<p>These generate fresh questions for you to work through, picked by what you most need.</p>
<ul>
  <li><strong>Common Errors</strong> — the three skills where you've missed the most questions. One click starts a drill on that skill, only on questions you haven't already mastered. The fastest way to fix patterns.</li>
  <li><strong>Weak questions drill</strong> — a mixed session pulling from your weakest questions across every skill. Uses a priority formula (recently wrong + historically bad + stale + hard). Run this once or twice a week.</li>
</ul>
<p>If you've taken both SAT and ACT questions, separate SAT and ACT versions of both tools appear.</p>
        `,
      },
      {
        heading: 'Review materials',
        html: `
<p>Three cards link into the passive-review surfaces:</p>
<ul>
  <li><strong>Review notes</strong> → <a href="/review/notes">/review/notes</a> — long-scroll reader of every note you've written. Filter by subject / domain / skill.</li>
  <li><strong>Review error log</strong> → <a href="/review/error-log">/review/error-log</a> — every Error Log entry with its full question expanded inline. The single best reading material you have.</li>
  <li><strong>Review flashcards</strong> → <a href="/notes/flashcards">/notes/flashcards</a> — your sets and the default vocab sets.</li>
</ul>
        `,
      },
      {
        heading: 'Test countdown',
        html: `
<p>If you've set a test date on your profile, a countdown shows at the top of the Review tab. As the date approaches, lean harder on active drills and your Error Log; new question practice becomes less useful in the final week.</p>
        `,
      },
    ],
  },
  {
    slug: 'assignments',
    title: 'Assignments',
    blurb: 'When a tutor has assigned specific work.',
    summary: 'If you have a tutor on Studyworks, Assignments is where their work for you shows up — pending at the top, completed below. This guide covers how to work through one and what to do if you don\'t have a tutor (short version: skip this article and use the self-study routine).',
    icon: '📋',
    order: 9,
    sections: [
      {
        heading: 'Do you have a tutor on the platform?',
        html: `
<p>If yes, your tutor can assign you specific work — a question set, a practice test, or a reading task. Assignments show up on your Dashboard (top, next to the banner) and in the <a href="/assignments">Assignments</a> tab.</p>
<p>Studying on your own? You won't have assignments — that's expected. Skip this article and use <a href="/help/study-routine">Study Routine (No Tutor)</a>.</p>
        `,
      },
      {
        heading: 'Pending vs Completed',
        html: `
<p>The Assignments page has two sections:</p>
<ul>
  <li><strong>Pending</strong> — assignments still open, newest first. Each row shows the assignment type, title, due date (red if overdue), and your tutor's name. For question-set assignments, a progress bar shows how much you've done.</li>
  <li><strong>Completed</strong> — finished assignments with your final accuracy. Question-set assignments also show a difficulty breakdown (Easy / Medium / Hard accuracy).</li>
</ul>
        `,
      },
      {
        heading: 'How to work through one',
        html: `
<ul>
  <li>Click into the assignment from the Dashboard or the Assignments tab.</li>
  <li>Complete the questions in order — your tutor chose the sequence for a reason.</li>
  <li>Progress saves automatically; you can leave and come back.</li>
  <li>When you finish, the assignment moves to <strong>Completed</strong> and your tutor can see your results.</li>
</ul>
        `,
      },
    ],
  },
  {
    slug: 'study-routine',
    title: 'Study Routine (No Tutor)',
    blurb: 'A concrete weekly plan you can run on your own.',
    summary: 'A concrete weekly routine for students prepping without a tutor: four practice days, one review day, two rest days, with a full-length practice test every other Saturday. This article walks through what a normal weekday looks like, what to do on review day, how to handle practice-test weeks, and the most common mistakes to avoid.',
    icon: '🗓️',
    order: 10,
    sections: [
      {
        heading: 'The plan, in one paragraph',
        html: `
<p>Each week: <strong>practice four days, review one day, rest two days</strong>. Take a full <a href="/practice/tests">practice test</a> every other Saturday. Adjust which skills you target after each test. Stick with this for 8 to 12 weeks and you'll see 100+ points of real improvement on the SAT — not because the plan is magic, but because consistent, focused practice with proper review is what actually works. The rest of this article walks through what each kind of day looks like.</p>
        `,
      },
      {
        heading: 'A normal weekday (about 30 minutes)',
        html: `
<p>Aim for thirty solid minutes most days. Even on busy days, ten focused minutes is better than zero — momentum is the thing that compounds.</p>
<ol>
  <li><strong>5 minutes — pick a skill.</strong> Open the <a href="/dashboard">Dashboard</a> and look at the segmented bars in the Performance grid. Find a red or yellow segment in a skill that matters for your target score, and that's what you're working on today. Don't overthink it; whichever weak skill catches your eye is fine.</li>
  <li><strong>20 minutes — practice it.</strong> Open <a href="/practice/start">Practice</a>, click just that skill, and run a 10-15 question session. Take the questions seriously: read carefully, work them out, then hit <strong>Reveal Answer</strong>. After each question — including the ones you got right — pause and ask: <em>what did I learn?</em>
    <ul>
      <li>If the answer is "a term, formula, or rule I didn't know" → add a Flashcard.</li>
      <li>If the answer is "I made a process mistake or fell for a trap" → write an Error Log entry.</li>
      <li>If the answer is "a concept I need to actually learn" → start a Note.</li>
      <li>If the answer is "I knew it, just made sure" → great, move on.</li>
    </ul>
    Most questions need nothing; the ones that do, capture in the right place. The <a href="/help/notes">Notes guide</a> has more examples if you're not sure which to pick.
  </li>
  <li><strong>5 minutes — flashcards.</strong> A quick burst at <a href="/notes/flashcards">/notes/flashcards</a> — vocab or formulas, whichever is weaker right now. Five minutes a day adds up to real fluency over a couple of months.</li>
</ol>
        `,
      },
      {
        heading: 'Review day (about 45 minutes)',
        html: `
<p>Once a week — Sunday tends to work well — trade a practice day for a review day. The goal here isn't to do new questions; it's to lock in what you've already seen.</p>
<ol>
  <li><strong>20 minutes — Weak Queue drill.</strong> Open <a href="/review">Review</a> and run the <strong>Weak questions drill</strong>. The platform picks the questions you most need to see again, based on what you've recently gotten wrong, what you historically struggle with, and what's gone stale. This is the closest thing to a personal tutor on the platform — let it do its job.</li>
  <li><strong>15 minutes — re-read your Error Log.</strong> Open <a href="/review/error-log">/review/error-log</a> and skim through your last week or two of entries. You're looking for patterns: the same trap showing up multiple times, the same kind of careless slip, the same content gap. Patterns are gold — once you can name a habit, you can change it.</li>
  <li><strong>10 minutes — focused fix.</strong> Pick one pattern you noticed and run a small, targeted Practice session on the exact skill or question type involved. Five well-chosen questions on the thing you keep missing beats fifty random ones.</li>
</ol>
<p>If you also want to spend a few minutes on Notes you've written — re-reading a topic summary, working through a Note on a complex concept — Sunday is a good time for that too.</p>
        `,
      },
      {
        heading: 'Practice test weeks',
        html: `
<p>Every other Saturday (or whichever day you can carve out three uninterrupted hours), take a full <a href="/practice/tests">practice test</a>. Two-week spacing is the sweet spot: often enough to see real movement, not so often that you burn out or stop processing what you've learned in between.</p>
<ol>
  <li><strong>Take it under real conditions.</strong> Quiet room, no phone, on-screen Desmos only, no peeking at your notes. The point is to find out where you actually stand — making it easier on yourself just hides the things you'd most want to know about.</li>
  <li><strong>Review it thoroughly within 24 hours.</strong> Plan at least an hour for review, ideally the same day. Go through every question you got wrong <em>and every question you guessed on but got right</em>. For each one, decide what you learned and capture it with the right tool — flashcard, Error Log entry, or Note. This step is where the actual point-gain comes from.</li>
  <li><strong>Update your focus areas.</strong> Whatever showed up as a weakness becomes one of your priority skills for the next two weeks. Then start the weekly cycle again.</li>
</ol>
        `,
      },
      {
        heading: 'Common mistakes self-studiers make',
        html: `
<p>You're going to make some of these — everyone does. Knowing what they are in advance just makes it easier to course-correct.</p>
<ul>
  <li><strong>Doing too many new questions, too little review.</strong> New questions feel productive — you can count them, you can see the bar fill up — but the actual learning happens when you sit with the questions you already attempted. Aim for at least a quarter of your time spent on review.</li>
  <li><strong>Capturing nothing after a missed question.</strong> A wrong answer you don't reflect on is a wrong answer you'll repeat. Capture each one — but with the right tool (see above), not by reflex into the Error Log.</li>
  <li><strong>Putting everything in the Error Log.</strong> The opposite mistake. If the lesson is "I didn't know what 'cogent' means," that's a flashcard, not an Error Log entry. Each tool gets less useful when you misuse it.</li>
  <li><strong>Not timing yourself.</strong> The SAT is partly a time-management test. Untimed practice quietly teaches you to be slow. Even if you don't run a strict timer, glance at the clock and notice when you're taking too long.</li>
  <li><strong>Avoiding hard questions.</strong> If everything you do is Easy or Medium, your score won't move past the mid-range. Push into Hard at least a third of the time — yes, it feels uncomfortable; that's the part doing the work.</li>
  <li><strong>Skipping the rationale when you got it right.</strong> Right-for-the-wrong-reason is the most common silent score leak. It takes thirty seconds to read; do it.</li>
  <li><strong>Cramming.</strong> Thirty minutes a day for eight weeks beats four hours on a Sunday. Your brain consolidates between sessions, not during them.</li>
</ul>
<p>If you fall off the routine for a few days, just start again. Nobody who improved meaningfully on this test did it with a perfect streak — they did it by getting back to the work after the breaks.</p>
        `,
      },
    ],
  },
  {
    slug: 'scores',
    title: 'Understanding Your Scores',
    blurb: 'What difficulty levels, score bands, and practice-test scores actually mean.',
    summary: 'A plain-English guide to how the SAT and ACT are scored, what difficulty levels and Score Bands (1-7) actually mean, why the digital SAT\'s second module adapts, and how to set a realistic goal based on your baseline.',
    icon: '🎯',
    order: 11,
    sections: [
      {
        heading: 'The digital SAT score, in plain English',
        html: `
<p>Two section scores, each from 200 to 800: <strong>Reading &amp; Writing</strong> and <strong>Math</strong>. Total: 400-1600. The College Board releases your real score about two weeks after the test.</p>
<p>Your practice-test score here is the best estimate available of what you'd get on the real thing today.</p>
        `,
      },
      {
        heading: 'The ACT score',
        html: `
<p>Four section scores (English, Math, Reading, Science), each from 1 to 36. The composite is the average. The Studyworks ACT practice test scores the same way.</p>
        `,
      },
      {
        heading: 'Score Bands (1-7) on questions',
        html: `
<p>Every question on the platform is labeled with both a public difficulty (Easy / Medium / Hard) and a more precise <strong>Score Band</strong> from 1 to 7. Think of the Score Band as a finer-grained ruler for the same thing the Easy/Medium/Hard labels measure — they map to each other directly:</p>
<ul>
  <li><strong>Bands 1-3 — Easy.</strong> Foundational questions most students get right regardless of their target score. Band 1 is the gentlest end of Easy; Band 3 is Easy bordering on Medium.</li>
  <li><strong>Bands 4-5 — Medium.</strong> The core of the test. Band 4 questions differentiate students in the 500-600 range; Band 5 starts to separate 600-700 scorers.</li>
  <li><strong>Bands 6-7 — Hard.</strong> The high-end questions. Band 6 is what separates 650-750 scorers; Band 7 is the hardest material on the test, where 750+ scorers earn their last points.</li>
</ul>
<p>Why bother with the finer scale? Because "Medium" is a wide bucket. A Band 4 question and a Band 5 question can both be labeled Medium, but they behave very differently for your prep: getting consistent on Band 4 will pull a mid-500s student into the 600s, while drilling Band 5 is what carries that same student from the 600s into the 700s. If you can, target the Band right at the edge of where you currently get most questions right — that's the zone where new points get won.</p>
<p>Quick guide: aiming for 700? Get reliably right on Bands 1-5. Aiming for 750+? You need to be solid on Band 6 and start landing some Band 7.</p>
        `,
      },
      {
        heading: 'Why the second module adapts',
        html: `
<p>The digital SAT is <strong>section-adaptive</strong>. How you do on the first R&amp;W module determines whether the second module is easier or harder. Same for Math.</p>
<p>This means: <strong>missing easy questions in Module 1 hurts more than missing hard questions in Module 2</strong>, because it caps the difficulty (and the score ceiling) of Module 2. On a practice test, prioritize getting the easy and medium questions right before grinding on the hardest ones.</p>
        `,
      },
      {
        heading: 'Setting a realistic goal',
        html: `
<ul>
  <li>Take a baseline practice test before setting any goal.</li>
  <li>A realistic 3-month goal: <strong>baseline + 100 to 150 points</strong> on the SAT with consistent work.</li>
  <li>Bigger jumps (200+) are possible but usually need 4-6 months of serious time.</li>
  <li>Your <em>best</em> practice-test composite is a closer match to real-test performance than your average. The Practice tests page shows both.</li>
</ul>
        `,
      },
      {
        heading: 'What accuracy percentages mean',
        html: `
<p>On the Dashboard Performance grid, accuracy on each skill is a percentage. Rough guide:</p>
<ul>
  <li><strong>Below 50%:</strong> you don't have this skill yet. Slow down, read rationales, look up the concept, write a Note.</li>
  <li><strong>50-80%:</strong> you know it but inconsistently. More reps will fix this.</li>
  <li><strong>80%+:</strong> solid. Maintain with periodic review.</li>
</ul>
        `,
      },
    ],
  },
  {
    slug: 'faq',
    title: 'FAQ & Troubleshooting',
    blurb: 'Common questions and what to do when something looks wrong.',
    summary: 'Quick answers to the questions that come up most often: a question marked wrong, the calculator not loading, an interrupted practice test, missing assignments, and a few common what-should-I-do-now questions about pacing and when to take the real SAT.',
    icon: '❓',
    order: 12,
    sections: [
      {
        heading: 'I think a question is marked wrong',
        html: `
<p>It happens occasionally. If you're sure the platform is calling your correct answer wrong (or vice versa), contact your tutor — they can flag it for the admin team. Include the question.</p>
        `,
      },
      {
        heading: 'The Desmos calculator isn\'t loading',
        html: `
<p>Refresh the page. If it still doesn't appear, try a different browser (Chrome, Edge, and Safari all work). Desmos needs JavaScript and a recent browser version.</p>
        `,
      },
      {
        heading: 'My practice test got interrupted',
        html: `
<p>Practice tests save progress per module. Open the Practice tests page — the in-progress attempt will be at the top with a <strong>Resume</strong> button. Your answers up to the point of interruption are saved.</p>
        `,
      },
      {
        heading: 'I don\'t see any assignments',
        html: `
<p>If you don't have a tutor on the platform, you won't have assignments — that's normal. Use the <a href="/help/study-routine">self-study routine</a> instead.</p>
<p>If you do have a tutor and still see nothing, they may not have assigned anything yet, or your account may not be linked to theirs. Ask them.</p>
        `,
      },
      {
        heading: 'How many questions should I do per day?',
        html: `
<p>10-20 is the sweet spot for a school-day. More than 40 in one sitting is usually counter-productive — you stop processing the rationales. Better to spread practice across more days.</p>
        `,
      },
      {
        heading: 'What\'s the difference between /notes/error-log and /review/error-log?',
        html: `
<p>Same data, different layouts. <a href="/notes/error-log">/notes/error-log</a> is a manage view — a tight list you can skim and filter. <a href="/review/error-log">/review/error-log</a> is a study view — each entry is fully expanded with the question, options, rationale, and your note inline, so you can sit down and read.</p>
<p>Use the manage view for "what did I get wrong this week"; use the review view for "let me re-learn this stuff before my test."</p>
        `,
      },
      {
        heading: 'Can I take the ACT here too?',
        html: `
<p>Yes. Switch between SAT and ACT using the toggle at the top of the Practice and Practice tests pages. Your Notes and Error Log are unified — entries from both tests live in the same place.</p>
        `,
      },
      {
        heading: 'When should I take the real SAT?',
        html: `
<p>Take your first attempt at least 3 months after starting serious prep. Plan for two attempts — most students improve on the second sitting. Junior spring + senior fall is the standard rhythm.</p>
        `,
      },
      {
        heading: 'Still stuck?',
        html: `
<p>If you have a tutor, message them. Otherwise, check back here as we add more guides.</p>
        `,
      },
    ],
  },
];

export function getArticle(slug) {
  return HELP_ARTICLES.find((a) => a.slug === slug) || null;
}

export function getOrderedArticles() {
  return [...HELP_ARTICLES].sort((a, b) => a.order - b.order);
}
