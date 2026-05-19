// Single source of truth for the student Help section.
// Each article is rendered by app/help/[slug]/page.js; the index
// page (app/help/page.js) lists them in `order`.

export const HELP_ARTICLES = [
  {
    slug: 'getting-started',
    title: 'Welcome — Start Here',
    blurb: 'A 2-minute orientation to the platform and what to do first.',
    icon: '👋',
    order: 1,
    sections: [
      {
        heading: 'What this platform is for',
        html: `
<p>This is your home base for SAT practice. Everything here is built around three things:</p>
<ul>
  <li><strong>Practice the right questions</strong> — questions matched to the skills you most need to work on.</li>
  <li><strong>See what you're getting wrong</strong> — so you can stop making the same mistakes.</li>
  <li><strong>Take realistic practice tests</strong> — to track real score progress over time.</li>
</ul>
<p>You don't need a tutor to use it well. The guides in this Help section walk you through every feature, plus a study routine you can run on your own.</p>
        `,
      },
      {
        heading: 'Your first week — do this',
        html: `
<ol>
  <li><strong>Take a baseline practice test.</strong> Open <em>Tests</em> in the top nav and complete one full-length test. This gives you a starting score and tells the platform what to recommend.</li>
  <li><strong>Check your Dashboard.</strong> Look at <em>Focus Areas</em> — the skills with the lowest accuracy. These are what to work on first.</li>
  <li><strong>Practice 15–20 questions a day</strong> from the Question Bank, filtered to your focus areas. Build a day streak.</li>
  <li><strong>Review what you got wrong.</strong> Use Smart Review and the Error Log (in the <em>Review</em> tab) at least every few days.</li>
  <li><strong>Re-test every 2 weeks.</strong> Take another practice test to measure progress and reset your focus areas.</li>
</ol>
<p>That's it. The rest of this Help section explains each piece in detail.</p>
        `,
      },
      {
        heading: 'How to get the most out of Help',
        html: `
<p>You don't need to read every article. The most useful ones to start with:</p>
<ul>
  <li><a href="/help/study-routine"><strong>Study Routine (No Tutor)</strong></a> — exactly what to do each week if you're studying on your own.</li>
  <li><a href="/help/scores"><strong>Understanding Your Scores</strong></a> — what difficulty levels, score bands, and practice test scores actually mean.</li>
  <li><a href="/help/question-bank"><strong>Question Bank</strong></a> — how to filter for the most useful practice.</li>
</ul>
        `,
      },
    ],
  },
  {
    slug: 'dashboard',
    title: 'Your Dashboard',
    blurb: 'Streaks, goals, focus areas, and how to read the activity chart.',
    icon: '📊',
    order: 2,
    sections: [
      {
        heading: 'What the Dashboard is',
        html: `
<p>The Dashboard is the page you land on when you log in. It's a single-screen summary of where you stand and what to work on next.</p>
        `,
      },
      {
        heading: 'Day Streak',
        html: `
<p>Counts consecutive days you've practiced at least one question. Streaks are the single best predictor of score improvement — even 10 questions a day keeps it alive. Miss a day and the streak resets.</p>
<p>If you're going to be away (a busy week of school, a trip), it's better to do a quick 10 questions than to skip — momentum compounds.</p>
        `,
      },
      {
        heading: 'Goal Progress',
        html: `
<p>If a target score has been set on your account, you'll see a progress bar comparing your highest practice-test score to that goal. It only updates after you complete a practice test, so take one every 2 weeks or so to see real movement.</p>
<p>No goal yet? Take one practice test first — a realistic goal is your baseline score + 100–150 points over 3 months of consistent work.</p>
        `,
      },
      {
        heading: 'Focus Areas',
        html: `
<p>These are the skills where your accuracy is lowest across all the questions you've attempted. Each one is a link — clicking it opens the Question Bank pre-filtered to that skill.</p>
<p><strong>This is the most useful thing on the Dashboard.</strong> When you don't know what to practice, click a Focus Area and do 10 questions.</p>
        `,
      },
      {
        heading: 'Performance Breakdown',
        html: `
<p>Two sections — Reading &amp; Writing and Math — each split by domain (Algebra, Advanced Math, Craft and Structure, etc.). Expand a domain to see your accuracy on each skill within it.</p>
<p>Color coding:</p>
<ul>
  <li><strong>Green</strong> (70%+): you have this</li>
  <li><strong>Yellow/amber</strong> (50–69%): inconsistent — needs more reps</li>
  <li><strong>Red</strong> (under 50%): a real weakness — prioritize</li>
</ul>
        `,
      },
      {
        heading: 'Activity Chart',
        html: `
<p>Bars show the last 14 days. Taller = more questions; color = your accuracy that day. Look for gaps (skipped days) and very short bars (a token effort doesn't count).</p>
        `,
      },
      {
        heading: 'Practice Test History',
        html: `
<p>Your recent practice tests and their scores. Click into one to see exactly which questions you got wrong and why.</p>
        `,
      },
    ],
  },
  {
    slug: 'question-bank',
    title: 'Question Bank',
    blurb: 'Filter to the right questions, mark for review, save notes.',
    icon: '📚',
    order: 3,
    sections: [
      {
        heading: 'What the Question Bank is',
        html: `
<p>Every official-style SAT question on the platform, all in one place. Open it from <em>Question Bank</em> in the top nav. Unlike a practice test, you can stop at any time and the platform remembers what you've done.</p>
        `,
      },
      {
        heading: 'How to filter — the high-leverage moves',
        html: `
<p>The filter panel is the whole point of the Question Bank. The filters that actually matter:</p>
<ul>
  <li><strong>Domain &amp; Skill</strong> — narrow down to one weakness at a time. Doing 20 questions on the same skill teaches more than 20 random questions.</li>
  <li><strong>Difficulty</strong> (Easy / Medium / Hard) — match your current level, then push up. If you're getting 90%+ on Medium, switch to Hard.</li>
  <li><strong>Status: Got Wrong</strong> — show only questions you've previously missed. The fastest way to fix recurring mistakes.</li>
  <li><strong>Status: Marked for Review</strong> — questions you flagged for a second look.</li>
  <li><strong>Status: Unattempted</strong> — when you want fresh problems.</li>
</ul>
        `,
      },
      {
        heading: 'Score Bands explained',
        html: `
<p>Each question has a Score Band from 1 to 7. Higher band = harder question, roughly aligned with the score range where students at that level get it right about half the time. See <a href="/help/scores">Understanding Your Scores</a> for the full mapping.</p>
        `,
      },
      {
        heading: 'On a question page',
        html: `
<ul>
  <li><strong>Mark for review</strong> — flag a question to come back to. It'll show up in the "Marked for Review" filter.</li>
  <li><strong>Notes</strong> — write yourself a note about why you missed it. The note saves to that question.</li>
  <li><strong>Desmos</strong> — the embedded calculator is the same one you'll use on the real digital SAT. Use it.</li>
  <li><strong>Explanation</strong> — every question has a written explanation. Read it even when you got the question right, especially if you guessed.</li>
</ul>
        `,
      },
    ],
  },
  {
    slug: 'practice-tests',
    title: 'Practice Tests',
    blurb: 'Full-length, timed, adaptive — how to take them and what to do after.',
    icon: '📝',
    order: 4,
    sections: [
      {
        heading: 'What a practice test is',
        html: `
<p>A full-length, timed simulation of the digital SAT. Two Reading &amp; Writing modules + two Math modules, with the second module of each adapting to how you did on the first — same as the real test.</p>
<p>Open from <em>Tests</em> in the top nav.</p>
        `,
      },
      {
        heading: 'When to take one',
        html: `
<ul>
  <li><strong>Right away.</strong> Take your first one in the first week — this is your baseline.</li>
  <li><strong>Every 2 weeks.</strong> Often enough to see real progress, not so often you burn out.</li>
  <li><strong>Two weeks before the real SAT.</strong> Final dress rehearsal under realistic conditions.</li>
</ul>
        `,
      },
      {
        heading: 'How to take it well',
        html: `
<ul>
  <li><strong>Sit it in one go.</strong> Don't split modules across days — the timing and stamina are the point.</li>
  <li><strong>Quiet room, no phone.</strong> Treat it like the real thing.</li>
  <li><strong>Use the on-screen Desmos calculator.</strong> Don't reach for a separate one.</li>
  <li><strong>Don't look up answers mid-test.</strong> Flag and move on, just like the real exam.</li>
</ul>
        `,
      },
      {
        heading: 'After the test — this is where the score comes from',
        html: `
<p>Most students take a test, look at the score, and stop. The score itself doesn't teach you anything — the review does.</p>
<ol>
  <li>Open the test results.</li>
  <li>Go through every question you got wrong <em>and every question you guessed on, even if you got it right</em>.</li>
  <li>For each one, read the explanation and ask: <em>did I not know the content, or did I make a process mistake?</em></li>
  <li>Mark recurring patterns. If you keep missing the same skill, that becomes your next focus area.</li>
</ol>
<p>A 60-minute review after a test will move your score more than another full test will.</p>
        `,
      },
    ],
  },
  {
    slug: 'review-tools',
    title: 'Review: Smart Review, Error Log, Flashcards',
    blurb: 'The three tools that fix what you got wrong.',
    icon: '🔁',
    order: 5,
    sections: [
      {
        heading: 'Why review matters more than new practice',
        html: `
<p>Forgetting a wrong answer is how it becomes a wrong answer next time. Review tools exist to make sure mistakes turn into corrections.</p>
<p>Open the <em>Review</em> tab in the top nav for all three tools.</p>
        `,
      },
      {
        heading: 'Smart Review',
        html: `
<p>The platform picks the questions you most need to see again — recent mistakes, weak skills, and questions you marked for review. Tell it how many you want; it builds the set.</p>
<p>Best used as a 10-15 question session 2-3 times a week. Don't skip it.</p>
        `,
      },
      {
        heading: 'Error Log',
        html: `
<p>A running list of every question you've gotten wrong, with your answer, the correct answer, and the explanation. Filter by skill, date, or whether you've reviewed it.</p>
<p>Use it when you want to see <em>patterns</em> — "I keep missing inference questions on long passages" is the kind of insight that comes from skimming the error log, not from doing more questions blind.</p>
        `,
      },
      {
        heading: 'Flashcards',
        html: `
<p>Quick recall practice for vocab, formulas, and rules. Cards adapt — ones you miss come back more often (spaced repetition).</p>
<p>Best in short bursts: 5 minutes on the bus, 10 minutes before bed. Not a replacement for question practice, but a real boost on vocab- and formula-heavy content.</p>
        `,
      },
    ],
  },
  {
    slug: 'assignments',
    title: 'Assignments',
    blurb: 'When a teacher has assigned specific work.',
    icon: '📋',
    order: 6,
    sections: [
      {
        heading: 'What an assignment is',
        html: `
<p>If you have a teacher on the platform, they can assign you a set of questions or a practice test. Assignments show up on your Dashboard and in the Question Bank.</p>
<p>Studying on your own? You won't have assignments — skip this article and use <a href="/help/study-routine">Study Routine (No Tutor)</a> instead.</p>
        `,
      },
      {
        heading: 'How to work through one',
        html: `
<ul>
  <li>Open it from the Dashboard or the Assignments link.</li>
  <li>Complete the questions in order — your teacher chose the sequence for a reason.</li>
  <li>Your progress saves automatically. You can leave and come back.</li>
  <li>Your teacher sees your results and can follow up on questions you missed.</li>
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
    order: 7,
    sections: [
      {
        heading: 'The plan, in one paragraph',
        html: `
<p>Each week: <strong>practice four days, review one day, rest two days</strong>. Take a full practice test every other Saturday. Adjust focus areas after each test. Keep this up for 8-12 weeks and you will see 100+ points of improvement.</p>
        `,
      },
      {
        heading: 'A normal weekday (about 30 minutes)',
        html: `
<ol>
  <li><strong>5 minutes:</strong> Open the Dashboard, look at your top Focus Area.</li>
  <li><strong>20 minutes:</strong> Practice 10-15 questions in the Question Bank, filtered to that skill. Read the explanation on every one, even the ones you got right.</li>
  <li><strong>5 minutes:</strong> Flashcards — vocab or formulas, whichever is weaker.</li>
</ol>
        `,
      },
      {
        heading: 'Review day (about 45 minutes)',
        html: `
<p>Once a week, swap out a practice day for review.</p>
<ol>
  <li><strong>20 minutes:</strong> Smart Review — let the platform pick what you most need to see again.</li>
  <li><strong>15 minutes:</strong> Open the Error Log. Scan for patterns. Are you missing the same skill repeatedly? Same question type? Same kind of trap?</li>
  <li><strong>10 minutes:</strong> Pick one pattern and do 5-10 fresh questions on that exact thing.</li>
</ol>
        `,
      },
      {
        heading: 'Practice test weeks',
        html: `
<p>Every other Saturday (or whichever day you can get 3 uninterrupted hours):</p>
<ol>
  <li>Take a full practice test. Real conditions — quiet, no phone, on-screen Desmos only.</li>
  <li>Same day or next day, spend at least an hour reviewing every wrong answer.</li>
  <li>Update what skills you're targeting based on what you missed.</li>
</ol>
        `,
      },
      {
        heading: 'Common mistakes self-studiers make',
        html: `
<ul>
  <li><strong>Doing too many new questions, too little review.</strong> Review is where the score comes from.</li>
  <li><strong>Not timing yourself.</strong> Untimed practice teaches you to be slow. Use the question timer mentally even on single questions.</li>
  <li><strong>Avoiding hard questions.</strong> If everything you do is Easy/Medium, your score won't move past mid-range. Spend at least a third of your practice on Hard.</li>
  <li><strong>Skipping the explanation when you got it right.</strong> Right-for-the-wrong-reason is the most common silent score leak.</li>
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
    order: 8,
    sections: [
      {
        heading: 'The digital SAT score, in plain English',
        html: `
<p>Two section scores, each from 200 to 800: <strong>Reading &amp; Writing</strong> and <strong>Math</strong>. Total: 400-1600. Score released by College Board within about two weeks of the test.</p>
<p>Your practice-test score here is the best estimate available of what you'd get on the real thing today.</p>
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
<p>If you want a 700, you need to be solid on Bands 1-5. Going for 750+? You need Band 6 and at least some Band 7.</p>
        `,
      },
      {
        heading: 'Why the second module adapts',
        html: `
<p>The digital SAT is <strong>section-adaptive</strong>. How you do on the first R&amp;W module determines whether the second module is easier or harder. Same for Math.</p>
<p>This means: <strong>missing easy questions in Module 1 hurts more than missing hard questions in Module 2</strong>, because it caps the difficulty (and therefore the score ceiling) of Module 2. On a practice test, prioritize getting the easy and medium questions right before grinding on the hardest ones.</p>
        `,
      },
      {
        heading: 'Setting a realistic goal',
        html: `
<ul>
  <li>Take a baseline practice test before setting any goal.</li>
  <li>A realistic 3-month goal: <strong>baseline + 100 to 150 points</strong> with consistent work.</li>
  <li>Bigger jumps (200+) are possible but usually need 4-6 months of serious time.</li>
  <li>Your <em>highest</em> practice-test score is a closer match to real-test performance than your <em>average</em>. Track your highest.</li>
</ul>
        `,
      },
      {
        heading: 'What accuracy percentages mean',
        html: `
<p>On the Dashboard, your accuracy on each skill is a percentage. Rough guide:</p>
<ul>
  <li><strong>Below 50%:</strong> you don't have this skill yet. Slow down, read explanations, look up the concept.</li>
  <li><strong>50-70%:</strong> you know it but inconsistently. More reps will fix this.</li>
  <li><strong>70-85%:</strong> solid. Maintain with periodic review.</li>
  <li><strong>85%+:</strong> mastered. Spend your time on weaker skills.</li>
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
    order: 9,
    sections: [
      {
        heading: 'I think a question is marked wrong',
        html: `
<p>It happens. If you're sure the platform is calling your correct answer wrong (or vice versa), use the <strong>Report a Bug</strong> link or contact your teacher. Include the question — admins can review and fix.</p>
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
<p>Practice tests save your progress per module. You should be able to resume from where you left off. If you can't, contact your teacher or support — your answers up to that point are saved.</p>
        `,
      },
      {
        heading: 'I don\'t see any assignments',
        html: `
<p>If you don't have a teacher on the platform, you won't have assignments — that's normal. Use the <a href="/help/study-routine">self-study routine</a> instead.</p>
<p>If you do have a teacher and still see nothing, they may not have assigned anything yet, or your account may not be linked to theirs. Ask them.</p>
        `,
      },
      {
        heading: 'How many questions should I do per day?',
        html: `
<p>10-20 is the sweet spot for a school-day. More than 40 in one sitting is usually counter-productive — you stop processing the explanations. Better to spread practice across more days.</p>
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
<p>If you have a teacher, message them. Otherwise, use Report a Bug for platform issues, or check back here as we add more guides.</p>
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
