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
<p>Studyworks is your home base for SAT and ACT practice. Everything here is built around three things:</p>
<ul>
  <li><strong>Practice the right questions</strong> — focused sessions on the skills you most need to work on.</li>
  <li><strong>Capture what you got wrong</strong> — every mistake becomes a Note or an Error Log entry you can come back to.</li>
  <li><strong>Take full-length practice tests</strong> — adaptive SAT and ACT simulations so you can track real score progress.</li>
</ul>
<p>You don't need a tutor to use it well. The guides in this Help section walk you through every tab in the top nav, plus a study routine you can run on your own.</p>
        `,
      },
      {
        heading: 'Your first week — do this',
        html: `
<ol>
  <li><strong>Take a baseline practice test.</strong> Open the <a href="/practice/tests"><em>Practice tests</em></a> tab and complete one full-length test. This gives you a starting score and tells the platform what to recommend.</li>
  <li><strong>Check your Dashboard.</strong> Look at your weakest skills in the Performance grid — these are what to work on first.</li>
  <li><strong>Run a Practice session every day.</strong> Open <a href="/practice/start"><em>Practice</em></a>, filter to one of your weak skills, and do 10-15 questions. Build the habit.</li>
  <li><strong>Use Notes after every miss.</strong> When you get a question wrong, the runner lets you write a quick Error Log entry. Do it — it's the difference between forgetting the mistake and fixing it.</li>
  <li><strong>Re-test every two weeks.</strong> Take another practice test to measure progress.</li>
</ol>
<p>That's the whole loop. The rest of this Help section explains each piece in detail.</p>
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
<p>Two columns — <strong>Math</strong> and <strong>Reading &amp; Writing</strong> — each split by domain (Algebra, Advanced Math, Information and Ideas, Standard English Conventions, etc.). Each domain expands to show your accuracy on individual skills.</p>
<p>Color tones:</p>
<ul>
  <li><strong>Green</strong> (80%+): you have this. Maintain.</li>
  <li><strong>Yellow / amber</strong> (50-79%): inconsistent. More reps will fix this.</li>
  <li><strong>Red</strong> (under 50%): a real weakness. Prioritize.</li>
</ul>
<p>Take an ACT? An ACT performance card appears here too, with the same shape. If you've never attempted an ACT question, the ACT card is hidden.</p>
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
<p>Open the <em>Practice</em> tab. On the start page you'll see:</p>
<ul>
  <li><strong>Subject toggle</strong> — Math or Reading &amp; Writing. (Take the ACT? Switch tests at the top.)</li>
  <li><strong>Domain &amp; Skill filters</strong> — narrow to one skill or a cluster of related skills. <em>This is the high-leverage move</em>: 15 questions on one skill teaches more than 15 random questions.</li>
  <li><strong>Difficulty</strong> — Easy, Medium, Hard. Match your level, then push up.</li>
  <li><strong>Score band</strong> — 1 through 7. Score bands tell you which scoring tier the question discriminates (see <a href="/help/scores">Understanding Your Scores</a>).</li>
  <li><strong>Session size + order</strong> — set how many questions, then hit <strong>Start</strong>.</li>
</ul>
<p>If you have a session already in progress, a <strong>Resume</strong> card appears at the top instead — you can pick up where you left off.</p>
        `,
      },
      {
        heading: 'Inside the session — what each control does',
        html: `
<ul>
  <li><strong>Question chips</strong> at the top — jump to any question in the session.</li>
  <li><strong>Mark for review</strong> — flag a question to come back to. The flag persists into the post-session report.</li>
  <li><strong>Desmos</strong> — the embedded calculator (Math). Same one you'll use on the digital SAT. Use it.</li>
  <li><strong>Reference sheet</strong> — formula reference (Math).</li>
  <li><strong>Error Log button</strong> — after you submit an answer, write a quick note about what tripped you up. Stored as a Note tied to that question. <strong>This is the single most useful habit you can build</strong> — see <a href="/help/notes">Notes</a>.</li>
  <li><strong>Rationale</strong> — every question has a written explanation. Read it even when you got it right, especially if you guessed.</li>
</ul>
<p>You can leave a session and come back. Progress saves automatically.</p>
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
        heading: 'Why Notes matters more than new questions',
        html: `
<p>The single biggest difference between students who improve fast and students who plateau is what they do with their wrong answers. Doing more questions while forgetting the same mistakes is a treadmill. Capturing and revisiting mistakes is how the score moves.</p>
<p>The <a href="/notes">Notes</a> tab is the platform's home for that. It has three things in one place:</p>
<ul>
  <li><strong>Notes</strong> — free-form, rich-text notes you write.</li>
  <li><strong>Error Log</strong> — one entry per question you got wrong, with your explanation of what went wrong.</li>
  <li><strong>Flashcards</strong> — vocab, formulas, and rules in a spaced-repetition flow.</li>
</ul>
        `,
      },
      {
        heading: 'Notes — free-form study material',
        html: `
<p>A Note is a rich-text document. You can format text, embed math, draw diagrams (Excalidraw), and tag the note with arbitrary labels. Each note can optionally be linked to a specific question — when it is, the platform auto-fills the subject, domain, and skill so you can filter on them later.</p>
<p>Useful for:</p>
<ul>
  <li>Summary sheets for a topic ("Geometry circle rules")</li>
  <li>Vocabulary lists with example sentences</li>
  <li>Working through hard problems in your own words</li>
  <li>Strategy reminders to read before a practice test</li>
</ul>
<p>Open <a href="/notes">/notes</a> to see all your notes; click <strong>+ New note</strong> to create one. Use the sidebar to filter by subject, domain, skill, or tag.</p>
        `,
      },
      {
        heading: 'Error Log — one entry per missed question',
        html: `
<p>When you get a question wrong in a Practice session, the runner gives you an <strong>Error Log</strong> button. Click it and write a short note about <em>why</em> you missed it — content gap? Misread the question? Bad guess? The note saves to your Error Log, attached to that question.</p>
<p>Why this matters: weeks later, when you see the same question again in Smart Review or a Common Errors drill, your past note pops up. "Right — I misread 'except'. Don't do it this time." That's how a mistake actually stops happening.</p>
<p>Two places to look at the Error Log:</p>
<ul>
  <li><a href="/notes/error-log"><strong>/notes/error-log</strong></a> — the management view. Skim the full list, see latest-correct vs latest-wrong counts, expand any entry to see the original question.</li>
  <li><a href="/review/error-log"><strong>/review/error-log</strong></a> — the study view. Each entry is fully expanded with the question, options, rationale, and your note side by side. Use this for a sit-down review session.</li>
</ul>
<p><strong>Habit to build:</strong> write an Error Log note for every wrong answer for the first month. It feels tedious; it's the highest-leverage habit on the platform.</p>
        `,
      },
      {
        heading: 'Flashcards — short bursts, spaced repetition',
        html: `
<p>The <a href="/notes/flashcards">Flashcards</a> page shows your flashcard sets — both your own and the default vocab sets. Each card tracks a 0-5 mastery score; cards you miss come back more often.</p>
<p>Best used in 5-10 minute bursts: on the bus, between classes, before bed. Not a replacement for question practice, but a real boost on vocab- and formula-heavy content.</p>
<p>To create your own set: open <a href="/notes/flashcards">/notes/flashcards</a>, click <strong>+ New set</strong>, then add cards.</p>
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
<p>Each week: <strong>practice four days, review one day, rest two days</strong>. Take a full <a href="/practice/tests">practice test</a> every other Saturday. Adjust which skills you target after each test. Keep this up for 8-12 weeks and you'll see 100+ points of improvement.</p>
        `,
      },
      {
        heading: 'A normal weekday (about 30 minutes)',
        html: `
<ol>
  <li><strong>5 minutes:</strong> Open the <a href="/dashboard">Dashboard</a>, look at your weakest domain in the Performance grid.</li>
  <li><strong>20 minutes:</strong> Open <a href="/practice/start">Practice</a>, filter to that skill, and run a 10-15 question session. <strong>Write an Error Log note for every question you get wrong</strong> — this is non-negotiable.</li>
  <li><strong>5 minutes:</strong> A quick Flashcards burst (<a href="/notes/flashcards">/notes/flashcards</a>) — vocab or formulas, whichever is weaker.</li>
</ol>
        `,
      },
      {
        heading: 'Review day (about 45 minutes)',
        html: `
<p>Once a week, swap out a practice day for review.</p>
<ol>
  <li><strong>20 minutes:</strong> Open <a href="/review">Review</a> and run a <strong>Weak questions drill</strong> — let the platform pick what you most need to see again.</li>
  <li><strong>15 minutes:</strong> Open <a href="/review/error-log">/review/error-log</a>. Read through your last two weeks of error notes. You'll notice patterns — that's the point.</li>
  <li><strong>10 minutes:</strong> Pick one pattern and run a focused Practice session on that exact skill.</li>
</ol>
        `,
      },
      {
        heading: 'Practice test weeks',
        html: `
<p>Every other Saturday (or whichever day you can get 3 uninterrupted hours):</p>
<ol>
  <li>Take a full <a href="/practice/tests">practice test</a>. Real conditions — quiet, no phone, on-screen Desmos only.</li>
  <li>Same day or next day, spend at least an hour reviewing every wrong answer. Write Error Log notes.</li>
  <li>Update what skills you're targeting based on what you missed.</li>
</ol>
        `,
      },
      {
        heading: 'Common mistakes self-studiers make',
        html: `
<ul>
  <li><strong>Doing too many new questions, too little review.</strong> Review is where the score comes from.</li>
  <li><strong>Skipping the Error Log button.</strong> A wrong answer with no note is a wrong answer you will get wrong again.</li>
  <li><strong>Not timing yourself.</strong> Untimed practice teaches you to be slow.</li>
  <li><strong>Avoiding hard questions.</strong> If everything you do is Easy/Medium, your score won't move past mid-range. Spend at least a third of your practice on Hard.</li>
  <li><strong>Skipping the rationale when you got it right.</strong> Right-for-the-wrong-reason is the most common silent score leak.</li>
  <li><strong>Cramming.</strong> 30 minutes a day for 8 weeks beats 4 hours on a Sunday.</li>
</ul>
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
<p>Every question is labeled with a Score Band that roughly tells you who gets it right:</p>
<ul>
  <li><strong>Band 1-2:</strong> Easy. Most students at any score level get these.</li>
  <li><strong>Band 3-4:</strong> Medium. Differentiates 500-650 scorers.</li>
  <li><strong>Band 5-6:</strong> Hard. Differentiates 650-750 scorers.</li>
  <li><strong>Band 7:</strong> Hardest. What separates 750+ from 700.</li>
</ul>
<p>If you want a 700, be solid on Bands 1-5. Going for 750+? You need Band 6 and at least some Band 7.</p>
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
    icon: '❓',
    order: 10,
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
