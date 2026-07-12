// Static onboarding tutorial. Same content as the legacy
// /learn/getting-started, ported to the next tree with shared
// next-tokens styling. Pure client component — there's no progress
// tracking or branching, just blocks rendered top-to-bottom.

'use client';

import { useState } from 'react';
import HtmlBlock from '@/components/HtmlBlock';
import { Card } from '@/lib/ui/Card';
import s from '../Learn.module.css';

const LESSON = {
  title: 'Getting Started: Your Guide to SAT Practice',
  description:
    'Learn how to use every feature of this platform — from practice sets and full practice tests to review drills, the error log, and flashcards — so you can make the most of your study time and improve your scores.',
};

const BLOCKS = [
  {
    id: 'welcome',
    block_type: 'text',
    content: {
      html: `
<h2>Welcome to Your SAT Practice Platform</h2>
<p>This lesson walks you through every tool available to help you prepare for the SAT. By the end you'll know exactly how to use each feature to build an effective study routine.</p>
<p>Here's what we'll cover, matching the tabs in your navigation bar:</p>
<ul>
  <li><strong>Dashboard</strong> — Your home base for tracking progress</li>
  <li><strong>Practice</strong> — Build custom practice sets with powerful filters</li>
  <li><strong>Practice tests</strong> — Full-length, timed, adaptive SAT simulations</li>
  <li><strong>Assignments</strong> — Work assigned by your tutor</li>
  <li><strong>Review</strong> — Targeted drills built from your mistakes</li>
  <li><strong>Notes</strong> — Your notes, error log, and flashcards</li>
  <li><strong>Tips</strong> — How to build a study routine that actually works</li>
</ul>
<p>Let's get started!</p>`.trim(),
    },
  },
  {
    id: 'dashboard',
    block_type: 'text',
    content: {
      html: `
<h2>Your Dashboard</h2>
<p>The <strong>Dashboard</strong> is your home base. Here's what you'll find there:</p>

<h3>Start / Resume Banner</h3>
<p>The banner at the top is your fastest way into work: <strong>Start practice</strong> opens the practice-set builder, and if you left a session unfinished you'll see a <strong>Resume session</strong> button that drops you right back where you stopped.</p>

<h3>Pending Assignments</h3>
<p>If you work with a tutor, your open assignments appear near the top with their due dates and completion progress, so you always know what's expected of you first.</p>

<h3>Your Stats</h3>
<p>Stat tiles summarize your recent work — questions answered, accuracy, and your activity this week — and a <strong>weekly trend</strong> shows how your accuracy is moving over time.</p>

<h3>Performance Breakdown</h3>
<p>You'll see your accuracy broken down by <strong>Reading &amp; Writing</strong> and <strong>Math</strong> domains and skills (Algebra, Advanced Math, Craft and Structure, etc.). Color coding makes it easy to spot where you're strong and where you need work.</p>

<h3>Target Score &amp; Countdown</h3>
<p>Set your <strong>target score</strong> right on the dashboard, and if a test date is on file you'll see a countdown with a suggested split of your remaining study time. Recently finished sessions and your practice-test scores are listed here too, so you can watch your progress build.</p>`.trim(),
    },
  },
  {
    id: 'check-dashboard',
    block_type: 'check',
    content: {
      prompt: 'What does the Performance Breakdown on your Dashboard show you?',
      choices: [
        'Only your practice-test composite scores',
        'Your accuracy by domain and skill, color-coded to reveal weak areas',
        'A list of every question on the platform',
        "Your tutor's recommended study schedule",
      ],
      correct_index: 1,
      explanation:
        'The performance grid breaks your accuracy down by Reading & Writing and Math domains and skills, with color coding that makes your weakest areas easy to spot — so you always know what to work on next.',
    },
  },
  {
    id: 'question-bank',
    block_type: 'text',
    content: {
      html: `
<h2>Practice Sets</h2>
<p>The <strong>Practice</strong> tab is your main practice tool. Instead of browsing questions one by one, you build a <strong>practice set</strong>: choose your filters, see how many questions match, and start a focused session.</p>

<h3>Building a Set</h3>
<p>Narrow down the question pool by:</p>
<ul>
  <li><strong>Domain:</strong> Major categories like Algebra, Advanced Math, Problem-Solving and Data Analysis, Geometry (Math) or Information and Ideas, Craft and Structure, Expression of Ideas, Standard English Conventions (R&amp;W)</li>
  <li><strong>Skill:</strong> Fine-grained skills within each domain</li>
  <li><strong>Difficulty:</strong> Easy, Medium, or Hard</li>
  <li><strong>Score Band:</strong> Levels 1–7, corresponding to estimated score ranges</li>
  <li><strong>Unattempted only:</strong> Skip questions you've already seen</li>
</ul>
<p>The page shows a live count of matching questions as you adjust filters, so you always know how much material is available before you start.</p>

<h3>Answering Questions</h3>
<p>Inside a session — laid out to feel like the real digital SAT — you'll see:</p>
<ul>
  <li>The question stem (and a reading passage for R&amp;W questions)</li>
  <li>Multiple-choice options with a <strong>cross-out</strong> feature to eliminate choices, just like on test day</li>
  <li>A <strong>Submit</strong> button — after you submit, you're told whether you were correct and shown the full explanation</li>
  <li>A question map to jump between questions, plus <strong>mark for review</strong> to flag ones you want to come back to</li>
</ul>

<h3>Tools</h3>
<p>For Math questions you have access to:</p>
<ul>
  <li><strong>Desmos Graphing Calculator</strong> — The same calculator available on the real digital SAT. You can resize, minimize, and drag it around the screen.</li>
  <li><strong>SAT Math Reference Sheet</strong> — Contains all the formulas provided on test day (area, volume, circle equations, etc.)</li>
</ul>

<h3>Error Log Notes</h3>
<p>When you review a finished session, you can add an <strong>error log</strong> note on any question — what you got wrong and why. This forces you to reflect on your mistake, which is one of the most powerful study techniques. Your notes collect in the error log under the Notes tab.</p>`.trim(),
    },
  },
  {
    id: 'check-qbank',
    block_type: 'check',
    content: {
      prompt: 'Which of these is NOT a filter available when building a practice set?',
      choices: [
        'Difficulty (Easy, Medium, Hard)',
        'Unattempted only',
        'Teacher rating',
        'Domain and skill',
      ],
      correct_index: 2,
      explanation:
        'Practice-set filters include domain, skill, difficulty, score band, and "unattempted only" — but there\'s no "teacher rating" filter.',
    },
  },
  {
    id: 'practice-tests',
    block_type: 'text',
    content: {
      html: `
<h2>Practice Tests</h2>
<p>Click <strong>"Practice tests"</strong> in the navigation to access full-length SAT practice tests. These simulate the real digital SAT experience as closely as possible.</p>

<h3>Test Structure</h3>
<p>Each practice test follows the real SAT format:</p>
<ul>
  <li><strong>Reading &amp; Writing:</strong> Two modules (Module 1 → adaptive routing → Module 2)</li>
  <li><strong>Math:</strong> Two modules (Module 1 → adaptive routing → Module 2)</li>
  <li><strong>Timed:</strong> Each module has a countdown timer matching real SAT time limits (~32 min for R&amp;W, ~35 min for Math)</li>
</ul>

<h3>Adaptive Routing</h3>
<p>Just like the real digital SAT, your performance on Module 1 determines the difficulty of Module 2. Do well on Module 1 and you'll get harder (but higher-scoring) questions in Module 2.</p>

<h3>Taking a Test</h3>
<ol>
  <li>Click <strong>"Start Test"</strong> on any available test</li>
  <li>Answer questions using the navigation chips at the top to jump between questions</li>
  <li>Mark questions for review within the test (to come back to before submitting)</li>
  <li>Keep an eye on the timer — it turns red when you have 5 minutes or less</li>
  <li>You can <strong>pause</strong> a test and resume later — your progress is saved</li>
</ol>

<h3>After the Test</h3>
<p>When you finish, you'll see a full results breakdown:</p>
<ul>
  <li><strong>Composite score</strong> (200–1600 scale)</li>
  <li><strong>Section scores</strong> for Math and Reading &amp; Writing</li>
  <li><strong>Module-by-module</strong> results showing which questions you got right and wrong</li>
</ul>
<p>Your scores are tracked over time on your Dashboard, so you can see your progress across multiple tests.</p>

<p><strong>Pro tip:</strong> Take a practice test every 1–2 weeks to measure your progress. Review every question you got wrong afterward — this is where the real learning happens.</p>`.trim(),
    },
  },
  {
    id: 'check-tests',
    block_type: 'check',
    content: {
      prompt: 'What happens if you do well on Module 1 of a practice test section?',
      choices: [
        'You skip Module 2 entirely',
        'Module 2 is easier so you can finish faster',
        'Module 2 has harder but higher-scoring questions',
        'Your score is automatically set to 800 for that section',
      ],
      correct_index: 2,
      explanation:
        'The digital SAT uses adaptive routing: strong performance on Module 1 gives you a harder Module 2 with access to higher score bands — just like the real test.',
    },
  },
  {
    id: 'review-tools',
    block_type: 'text',
    content: {
      html: `
<h2>Review &amp; Notes</h2>
<p>The <strong>Review</strong> page is where you turn mistakes into improvement. Its most powerful tools are the two drills at the top:</p>

<h3>Common Errors</h3>
<p>The skills where you've missed the most questions, each with a <strong>one-click drill</strong> — click a skill and the app builds a practice session targeting exactly that weakness.</p>

<h3>Weak Questions Drill</h3>
<p>A mixed drill built from the questions you should revisit most. The app prioritizes them using:</p>
<ul>
  <li><strong>Correctness:</strong> Questions you got wrong recently rank highest</li>
  <li><strong>Accuracy:</strong> Questions you've historically struggled with get more weight</li>
  <li><strong>Time decay:</strong> Questions you haven't seen in a while rise in priority</li>
  <li><strong>Difficulty:</strong> Harder questions get a slight bonus (they're worth more on the real test)</li>
</ul>
<p>Once you've shown you can answer a question reliably, it graduates out of the drill — so the queue always reflects your <em>current</em> weaknesses.</p>

<h3>Review Materials</h3>
<p>Below the drills, Review links to your study materials, which you manage under the <strong>Notes</strong> tab:</p>
<ul>
  <li><strong>Error Log</strong> — every note you've written about a mistake, with the domain and skill. Reviewing it regularly reveals <strong>patterns</strong>: careless algebra slips? Misread passage evidence? The log will show you.</li>
  <li><strong>Notes</strong> — your own rich-text study notes, which can link to specific questions.</li>
  <li><strong>Flashcards</strong> — custom sets plus SAT vocabulary. Cards flip on click; after each card you rate your mastery from 0 (no clue) to 5 (perfect), and <strong>weighted randomization</strong> shows lower-rated cards more often, so you spend time on what you don't know yet.</li>
</ul>`.trim(),
    },
  },
  {
    id: 'check-flashcards',
    block_type: 'check',
    content: {
      prompt: 'How does the flashcard system decide which cards to show you more often?',
      choices: [
        'It shows all cards equally in random order',
        'It shows cards you rated with lower mastery more frequently',
        'It only shows cards you got wrong last time',
        'It goes in alphabetical order',
      ],
      correct_index: 1,
      explanation:
        "The flashcard system uses weighted randomization based on your mastery rating (0–5). Cards rated lower appear more often, so you naturally spend more time on the concepts you haven't learned yet.",
    },
  },
  {
    id: 'assignments',
    block_type: 'text',
    content: {
      html: `
<h2>Assignments</h2>
<p>If you work with a tutor, they can assign you question sets, lesson packs, or full practice tests. Everything lives under the <strong>Assignments</strong> tab, and pending work is also surfaced on your Dashboard.</p>

<h3>How Assignments Work</h3>
<ol>
  <li>Your tutor creates an assignment and (optionally) sets a due date</li>
  <li>It appears in your Assignments list with its title, due date, and your completion progress</li>
  <li>Open the assignment to see the details, then <strong>Start</strong> (or <strong>Continue</strong> if you've already begun) to work through it</li>
  <li>When you finish everything, the assignment is marked complete automatically — you can also submit the set explicitly when you're done</li>
  <li>After finishing, you can <strong>redo</strong> an assignment for another pass, and view your report for it</li>
</ol>

<h3>Tips for Assignments</h3>
<ul>
  <li>Check for new assignments regularly — your tutor may add them at any time</li>
  <li>Pay attention to <strong>due dates</strong> — overdue assignments are flagged</li>
  <li>Your tutor sees your completion and accuracy, and will often review your work with you in your next session — so answer honestly rather than guessing quickly; the mistakes are what make the review valuable</li>
</ul>`.trim(),
    },
  },
  {
    id: 'study-routine',
    block_type: 'text',
    content: {
      html: `
<h2>Building an Effective Study Routine</h2>
<p>Now that you know all the tools, here's how to put them together into a routine that will actually improve your scores:</p>

<h3>Daily Practice (15–30 minutes)</h3>
<ol>
  <li><strong>Complete Assignments first</strong> — If your tutor has assigned work, prioritize that.</li>
  <li><strong>Run a Review drill</strong> — Start the <strong>Weak questions drill</strong> or a <strong>Common errors</strong> skill drill on the Review page. These target the questions and skills the app has identified as most important for you right now.</li>
  <li><strong>Build a practice set</strong> — Do 10–20 questions from your weakest domains (your Dashboard's performance grid highlights these) using the Practice filters.</li>
</ol>

<h3>Weekly Review (30–60 minutes)</h3>
<ol>
  <li><strong>Read your Error Log</strong> — Look for patterns in your mistakes. Are they conceptual (you don't understand the topic) or careless (you know it but keep slipping)?</li>
  <li><strong>Study Flashcards</strong> — Spend 10–15 minutes on vocabulary and concept cards, especially low-mastery ones.</li>
  <li><strong>Check your dashboard trend</strong> — Is your weekly accuracy moving up? Which domains are still lagging?</li>
</ol>

<h3>Every 1–2 Weeks</h3>
<ol>
  <li><strong>Take a full practice test</strong> — This is the best way to measure real progress and build test-day stamina.</li>
  <li><strong>Review every wrong answer</strong> — After a practice test, go through every question you missed. Write Error Log notes for the ones that surprised you.</li>
  <li><strong>Check your Dashboard scores</strong> — Track your composite and section scores over time. Are they trending up?</li>
</ol>

<h3>Key Principles</h3>
<ul>
  <li><strong>Consistency beats intensity.</strong> 20 minutes every day is better than 3 hours once a week.</li>
  <li><strong>Focus on weaknesses.</strong> It's tempting to practice what you're already good at, but the biggest score gains come from improving your weakest areas.</li>
  <li><strong>Review mistakes actively.</strong> Don't just read the explanation — write a note in your Error Log about what you'll do differently next time.</li>
  <li><strong>Use the tools together.</strong> Practice sets, the Review drills, the Error Log, and Flashcards are designed to work as a system. Each one reinforces the others.</li>
</ul>`.trim(),
    },
  },
  {
    id: 'check-routine',
    block_type: 'check',
    content: {
      prompt:
        'According to the recommended study routine, what should you do first during your daily practice?',
      choices: [
        'Take a full practice test',
        'Create new flashcard sets',
        'Complete any assignments from your tutor, then run a Review drill',
        'Read through the entire Error Log',
      ],
      correct_index: 2,
      explanation:
        'Assigned work comes first, and then a Weak-questions or Common-errors drill from the Review page — those drills revisit the questions and skills the app has identified as most important for your improvement.',
    },
  },
  {
    id: 'wrapup',
    block_type: 'text',
    content: {
      html: `
<h2>You're Ready!</h2>
<p>You now know how to use every feature of this platform. Here's a quick reference:</p>
<table style="width:100%; border-collapse:collapse; margin:12px 0;">
  <tr style="border-bottom:1px solid #ddd;">
    <td style="padding:8px; font-weight:bold;">Dashboard</td>
    <td style="padding:8px;">Your stats, performance grid, scores, target, and pending work</td>
  </tr>
  <tr style="border-bottom:1px solid #ddd;">
    <td style="padding:8px; font-weight:bold;">Practice</td>
    <td style="padding:8px;">Build filtered practice sets with SAT-style tools</td>
  </tr>
  <tr style="border-bottom:1px solid #ddd;">
    <td style="padding:8px; font-weight:bold;">Practice tests</td>
    <td style="padding:8px;">Full-length, timed, adaptive SAT practice tests</td>
  </tr>
  <tr style="border-bottom:1px solid #ddd;">
    <td style="padding:8px; font-weight:bold;">Assignments</td>
    <td style="padding:8px;">Question sets, lesson packs, and tests from your tutor</td>
  </tr>
  <tr style="border-bottom:1px solid #ddd;">
    <td style="padding:8px; font-weight:bold;">Review</td>
    <td style="padding:8px;">Weak-question and common-error drills + review materials</td>
  </tr>
  <tr>
    <td style="padding:8px; font-weight:bold;">Notes</td>
    <td style="padding:8px;">Your notes, Error Log, and Flashcards</td>
  </tr>
</table>
<p>The most important thing is to <strong>start practicing consistently</strong>. Even a few questions a day will add up. Good luck — you've got this!</p>`.trim(),
    },
  },
];

export default function GettingStartedPage() {
  return (
    <main className={s.viewerPage}>
      <nav className={s.breadcrumb}>
        <a href="/learn">← Back to Learn</a>
      </nav>

      <header className={s.viewerHeader}>
        <h1 className={s.viewerTitle}>{LESSON.title}</h1>
        <p className={s.viewerDescription}>{LESSON.description}</p>
        <span className={s.viewerByline}>Platform tutorial</span>
      </header>

      <div className={s.staticBlocks}>
        {BLOCKS.map((block) => (
          <div key={block.id}>
            {block.block_type === 'text' && (
              <Card className={s.staticTextCard}>
                <HtmlBlock className="prose" html={block.content.html} />
              </Card>
            )}
            {block.block_type === 'check' && (
              <StaticCheckBlock content={block.content} />
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

function StaticCheckBlock({ content }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const choices = content.choices || [];
  const correctIdx = content.correct_index ?? 0;

  function handleSubmit() {
    if (selected === null) return;
    setSubmitted(true);
  }

  const isCorrect = submitted && selected === correctIdx;
  const cardClass = !submitted
    ? s.checkCard
    : isCorrect
      ? `${s.checkCard} ${s.checkCardCorrect}`
      : `${s.checkCard} ${s.checkCardWrong}`;

  return (
    <div className={cardClass}>
      <div className={s.checkEyebrow}>Knowledge check</div>
      <p className={s.checkPrompt}>{content.prompt}</p>

      <div className={s.checkChoices}>
        {choices.map((choice, i) => {
          const isCorrectChoice = i === correctIdx;
          const isSelected = i === selected;
          let className = s.checkChoice;
          if (submitted) {
            if (isCorrectChoice) className = `${s.checkChoice} ${s.checkChoiceCorrect}`;
            else if (isSelected) className = `${s.checkChoice} ${s.checkChoiceWrong}`;
          } else if (isSelected) {
            className = `${s.checkChoice} ${s.checkChoiceSelected}`;
          }
          return (
            <button
              key={i}
              onClick={() => { if (!submitted) setSelected(i); }}
              disabled={submitted}
              className={className}
            >
              <span className={s.checkChoiceLetter}>
                {String.fromCharCode(65 + i)}
              </span>
              <span className={s.checkChoiceText}>{choice}</span>
              {submitted && isCorrectChoice && (
                <span className={s.checkChoiceMark}>✓</span>
              )}
              {submitted && isSelected && !isCorrectChoice && (
                <span className={s.checkChoiceMark}>✗</span>
              )}
            </button>
          );
        })}
      </div>

      {!submitted && (
        <button
          className={s.checkSubmit}
          onClick={handleSubmit}
          disabled={selected === null}
        >
          Check answer
        </button>
      )}

      {submitted && content.explanation && (
        <div className={s.checkExplanation}>
          <strong>Explanation:</strong> {content.explanation}
        </div>
      )}
    </div>
  );
}
