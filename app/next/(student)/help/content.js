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
    icon: '📝',
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
<p><strong>📇 Flashcard</strong> — use this when the lesson is a single piece of information you need to remember on demand. A vocabulary word and its definition. A geometry formula. A grammar rule like "semicolons join two independent clauses." Flashcards are best at the small, atomic stuff: one fact per card, drilled into long-term memory through repetition. If you can write it as a question-and-answer pair, it belongs on a flashcard.</p>
<p><strong>🔁 Error Log</strong> — use this when the lesson is about your <em>process</em>: a trap you fell for, a step you skipped, a misread, a wrong assumption. "I assumed 'except' meant the same as 'such as.'" "I solved for x but the question asked for 2x." "I picked the most extreme answer choice without checking." Error Log entries aren't about content you didn't know — they're about the specific habit you want to change. Next time you face the same kind of question, your past note pops up and reminds you not to make the same move.</p>
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
<p>Open <a href="/notes">/notes</a> to see everything you've written. Click <strong>+ New note</strong> to start a new one. The sidebar lets you filter by subject, domain, skill, or any tag you've used.</p>
        `,
      },
      {
        heading: 'Error Log — for fixing your process',
        html: `
<p>When you reveal the answer on a Practice question, you'll see an <strong>Error Log</strong> button. Click it and write a short note about <em>why</em> you missed it — focusing on the move you made, not the content you didn't know. The entry saves to your Error Log, attached to the question.</p>
<p>The magic happens weeks later. The next time that question shows up — in Smart Review, a Common Errors drill, or just by happening across it again — your past note appears alongside it. "Right: I misread 'except' last time." "Right: I forgot to convert the units." That moment of remembering is what actually changes the habit. Without the note, you'd quietly make the same mistake again.</p>
<p>Two places to look at your Error Log:</p>
<ul>
  <li><strong><a href="/notes/error-log">/notes/error-log</a></strong> — the management view. A tight list of every entry, with counts showing where you're now getting things right vs still slipping up. Expand any row to see the original question. Good for "what's in my error log right now?"</li>
  <li><strong><a href="/review/error-log">/review/error-log</a></strong> — the study view. Each entry is fully expanded with the question, options, rationale, and your note side by side. Best for a sit-down review session a few days before the test.</li>
</ul>
<p>One thing to keep in mind: not every wrong answer belongs in the Error Log. If the lesson is "I didn't know what 'apocryphal' means," that's a flashcard, not a process note. The Error Log is most useful when you treat it as a journal of decisions you want to make differently next time.</p>
        `,
      },
      {
        heading: 'Flashcards — for terms, formulas, and rules',
        html: `
<p>The <a href="/notes/flashcards">Flashcards</a> page shows your flashcard sets — both the ones you create and the default vocab and formula sets Studyworks ships with. Each card tracks a 0-5 mastery score; cards you miss come back more often, so the ones you actually need to learn get more reps automatically.</p>
<p>Flashcards work best in short bursts: five minutes on the bus, ten minutes between classes, a few minutes before bed. They're not a replacement for question practice, but for vocab- and formula-heavy content they're the fastest way to lock in the basics.</p>
<p>To create your own set, open <a href="/notes/flashcards">/notes/flashcards</a>, click <strong>+ New set</strong>, give it a name, and start adding cards. A good rule of thumb: one fact per card, written so the front genuinely needs the back to answer it. "What does 'ephemeral' mean?" is a good card. "Tell me about vocabulary" is not.</p>
        `,
      },
    ],
  },
  {
    slug: 'review',
    title: 'The Review Tab',
    blurb: 'Common Errors, Weak Queue, and the pre-test study surface.',
    icon: '🔁',
    order: 6,
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
    icon: '📋',
    order: 7,
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
    icon: '🗓️',
    order: 8,
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
    icon: '🎯',
    order: 9,
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
    slug: 'billing',
    title: 'Billing & Subscription',
    blurb: 'Plans, your free trial, and exactly how to cancel.',
    icon: '💳',
    order: 10,
    sections: [
      {
        heading: 'Plans and the free trial',
        html: `
<p>Studyworks runs on a simple subscription. Every new account starts with a <strong>7-day free trial</strong> — full access, no charge until the trial ends. You can cancel any time during the trial and you won't be billed.</p>
<ul>
  <li><strong>Student plan</strong> — $12.99 / month. Everything in the platform: unlimited Practice sessions, full-length adaptive practice tests, Notes, Error Log, Flashcards, and Review drills.</li>
  <li><strong>Teacher plan</strong> — $29.99 / month. Adds tutor tools (rosters, assignments, student reports). Not what most students need.</li>
</ul>
<p>If your tutor or school works with Studyworks Prep directly, your account may be <strong>sponsored</strong> — full access at no cost, no subscription required. You'll see "Exempt" on your <a href="/account/billing">Billing</a> page if that applies to you.</p>
        `,
      },
      {
        heading: 'How to cancel your subscription',
        html: `
<p>Cancellation is self-serve and takes about 30 seconds. You won't lose anything you've created — your notes, error log entries, and practice history stay on your account in case you come back later.</p>
<ol>
  <li>Sign in and open <a href="/account/billing"><strong>Billing</strong></a> from your account menu (or go directly to <a href="/account/billing">/account/billing</a>).</li>
  <li>Click the <strong>Manage Subscription</strong> button. This opens our secure billing portal (hosted by Stripe).</li>
  <li>In the portal, click <strong>Cancel plan</strong>. You'll see a confirmation showing the date your access ends.</li>
</ol>
<p>You keep full access until the end of the period you've already paid for. After that, your account becomes read-only — you can still sign in to view your notes and history, but practice sessions and tests are paused until you resubscribe.</p>
<p>To cancel <em>during the free trial</em>, follow the same steps. As long as you cancel before the trial end date shown on the Billing page, no charge is made.</p>
        `,
      },
      {
        heading: 'Updating payment, switching plans, or resubscribing',
        html: `
<p>The same <strong>Manage Subscription</strong> button handles all of these:</p>
<ul>
  <li><strong>Update card</strong> — replace the card on file, fix an expiration, change billing address.</li>
  <li><strong>Switch plans</strong> — student to teacher or back. Prorating is automatic.</li>
  <li><strong>Resume after canceling</strong> — if you're still inside your paid period, the portal lets you reactivate without a new trial. If your access has lapsed, go to <a href="/subscribe">/subscribe</a> and pick a plan again.</li>
</ul>
<p>Invoices and payment receipts are emailed to you automatically. You can also download them from inside the billing portal.</p>
        `,
      },
      {
        heading: "If something looks wrong",
        html: `
<p>A few things to check first if your account status seems off:</p>
<ul>
  <li>The <a href="/account/billing">Billing</a> page shows your live status — plan, next billing date, trial end date, and whether a cancellation is scheduled.</li>
  <li>If you just signed up and the page says "No active subscription," your trial may not have finished setting up — refresh, or sign out and back in.</li>
  <li>If you canceled but were still charged, check the date: cancellations stop the <em>next</em> charge, they don't refund the current period automatically.</li>
</ul>
<p>For anything else — billing questions, accidental charges, account issues — email <a href="mailto:support@studyworksprep.com">support@studyworksprep.com</a> and we'll sort it out.</p>
        `,
      },
    ],
  },
  {
    slug: 'faq',
    title: 'FAQ & Troubleshooting',
    blurb: 'Common questions and what to do when something looks wrong.',
    icon: '❓',
    order: 11,
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
        heading: 'How do I cancel my subscription?',
        html: `
<p>Open <a href="/account/billing">Billing</a>, click <strong>Manage Subscription</strong>, and choose <strong>Cancel plan</strong> in the portal. You keep access through the end of the period you've already paid for. Full walkthrough — including how to cancel during the free trial without being charged — in the <a href="/help/billing">Billing &amp; Subscription</a> article.</p>
        `,
      },
      {
        heading: 'Still stuck?',
        html: `
<p>If you have a tutor, message them. Otherwise, email <a href="mailto:support@studyworksprep.com">support@studyworksprep.com</a> — we read every message.</p>
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
