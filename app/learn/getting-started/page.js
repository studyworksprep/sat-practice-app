'use client';

import { useState } from 'react';
import Link from 'next/link';
import HtmlBlock from '../../../components/HtmlBlock';

// ─── Static tutorial content ─────────────────────────────

const LESSON = {
  title: 'Getting Started: Your Guide to SAT Practice',
  description:
    'Learn how to use every feature of this platform — from the Question Bank and Practice Tests to Flashcards, Error Logs, Smart Review, and more — so you can make the most of your study time and improve your scores.',
};

const BLOCKS = [
  // 0 – Welcome
  {
    id: 'welcome',
    block_type: 'text',
    content: {
      html: `
<h2>Welcome to Your SAT Practice Platform</h2>
<p>This lesson walks you through every tool available to help you prepare for the SAT. By the end you'll know exactly how to use each feature to build an effective study routine.</p>
<p>Here's what we'll cover:</p>
<ul>
  <li><strong>Dashboard</strong> — Your home base for tracking progress</li>
  <li><strong>Question Bank</strong> — Practice individual questions with powerful filters</li>
  <li><strong>Practice Tests</strong> — Full-length, timed, adaptive SAT simulations</li>
  <li><strong>Review Tools</strong> — Smart Review, Error Log, and Flashcards</li>
  <li><strong>Assignments</strong> — Work assigned by your teacher</li>
  <li><strong>Tips</strong> — How to build a study routine that actually works</li>
</ul>
<p>Let's get started!</p>`.trim(),
    },
  },

  // 1 – Dashboard
  {
    id: 'dashboard',
    block_type: 'text',
    content: {
      html: `
<h2>Your Dashboard</h2>
<p>The <strong>Dashboard</strong> is your home base. Here's what you'll find there:</p>

<h3>Day Streak</h3>
<p>Your streak counts consecutive days where you've practiced at least one question. Building a streak helps you stay consistent — even just 10 questions a day keeps the streak alive and adds up over time.</p>

<h3>Goal Progress</h3>
<p>If your teacher has set a target score, you'll see a progress bar tracking your current best score against that goal. This is based on your practice test results, so take tests regularly to see it update.</p>

<h3>Focus Areas</h3>
<p>The dashboard highlights your <strong>weakest skills</strong> — the topics where your accuracy is lowest. Each one links directly to a filtered practice session so you can jump straight into working on what matters most.</p>

<h3>Performance Breakdown</h3>
<p>You'll see separate sections for <strong>Reading &amp; Writing</strong> and <strong>Math</strong>, each broken down by domain (Algebra, Advanced Math, Craft and Structure, etc.). Expand any domain to see your accuracy on each skill. Color-coded bars make it easy to spot where you're strong (green) and where you need work (red/yellow).</p>

<h3>Activity Chart</h3>
<p>The last 14 days of your practice are shown as a bar chart. Taller bars mean more questions; the color shows your accuracy that day. Use this to make sure you're practicing consistently.</p>

<h3>Practice Test History &amp; Scores</h3>
<p>Your most recent practice sessions and official test scores are displayed here. You can click any question tile to jump back to it in the Question Bank.</p>`.trim(),
    },
  },

  // 2 – Check: Dashboard
  {
    id: 'check-dashboard',
    block_type: 'check',
    content: {
      prompt: 'What does the "Focus Areas" section on your Dashboard show you?',
      choices: [
        'Your highest-scoring topics',
        'Your weakest skills, linked to filtered practice sessions',
        'A list of all SAT domains',
        'Your teacher\'s recommended study schedule',
      ],
      correct_index: 1,
      explanation:
        'Focus Areas highlights the skills where your accuracy is lowest and links directly to practice sessions filtered to those topics — so you always know what to work on next.',
    },
  },

  // 3 – Question Bank
  {
    id: 'question-bank',
    block_type: 'text',
    content: {
      html: `
<h2>The Question Bank</h2>
<p>The <strong>Question Bank</strong> (click "Question Bank" in the top navigation) is your main practice tool. It contains every SAT question on the platform, and you can filter them in dozens of ways.</p>

<h3>Filters</h3>
<p>Use the filter panel to narrow down questions by:</p>
<ul>
  <li><strong>Difficulty:</strong> Easy, Medium, or Hard</li>
  <li><strong>Score Band:</strong> Levels 1–7, corresponding to estimated score ranges</li>
  <li><strong>Domain:</strong> Major categories like Algebra, Advanced Math, Problem-Solving and Data Analysis, Geometry (Math) or Information and Ideas, Craft and Structure, Expression of Ideas, Standard English Conventions (R&amp;W)</li>
  <li><strong>Topic/Skill:</strong> Fine-grained skills within each domain</li>
  <li><strong>Status:</strong> Show only questions you got wrong, marked for review, or haven't attempted yet</li>
  <li><strong>Search:</strong> Find questions by ID or keyword</li>
</ul>
<p><strong>Pro tip:</strong> Use the "Wrong only" filter regularly to revisit questions you've missed. Research shows that reviewing mistakes is one of the most effective ways to improve.</p>

<h3>Answering Questions</h3>
<p>When you open a question, you'll see:</p>
<ul>
  <li>The question stem (and a reading passage for R&amp;W questions)</li>
  <li>Multiple-choice options with a <strong>cross-out</strong> feature — click the X next to any choice to eliminate it, just like you would on the real SAT</li>
  <li>A <strong>Submit</strong> button to check your answer</li>
  <li>If you get it wrong, the incorrect choice is crossed out and you can try again (retry-until-correct)</li>
  <li>After answering correctly, you'll see the explanation</li>
</ul>

<h3>Tools</h3>
<p>For Math questions you have access to:</p>
<ul>
  <li><strong>Desmos Graphing Calculator</strong> — The same calculator available on the real digital SAT. You can resize, minimize, and drag it around the screen.</li>
  <li><strong>SAT Math Reference Sheet</strong> — Contains all the formulas provided on test day (area, volume, circle equations, etc.)</li>
</ul>

<h3>Marking for Review</h3>
<p>Click the <strong>star icon (★)</strong> on any question to mark it for review. Marked questions appear in your Smart Review queue and can be filtered in the Question Bank. Use this for questions you found tricky or want to revisit later.</p>

<h3>Error Log Notes</h3>
<p>After answering a question, click <strong>"Add to Error Log"</strong> to write a note about what you got wrong and why. This forces you to reflect on your mistake — which is one of the most powerful study techniques. Your notes are saved and accessible from the Review page.</p>`.trim(),
    },
  },

  // 4 – Check: Question Bank
  {
    id: 'check-qbank',
    block_type: 'check',
    content: {
      prompt: 'Which of these is NOT a filter available in the Question Bank?',
      choices: [
        'Difficulty (Easy, Medium, Hard)',
        'Wrong-only questions',
        'Teacher rating',
        'Domain and topic/skill',
      ],
      correct_index: 2,
      explanation:
        'The Question Bank filters include difficulty, score band, domain, topic, status flags (wrong-only, marked, undone), and search — but there\'s no "teacher rating" filter.',
    },
  },

  // 5 – Practice Tests
  {
    id: 'practice-tests',
    block_type: 'text',
    content: {
      html: `
<h2>Practice Tests</h2>
<p>Click <strong>"Tests"</strong> in the navigation to access full-length SAT practice tests. These simulate the real digital SAT experience as closely as possible.</p>

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

  // 6 – Check: Practice Tests
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

  // 7 – Review Tools
  {
    id: 'review-tools',
    block_type: 'text',
    content: {
      html: `
<h2>Review Tools</h2>
<p>The <strong>Review</strong> page (click "Review" in the navigation) has three powerful tabs:</p>

<h3>Smart Review</h3>
<p>Smart Review uses an algorithm to prioritize which questions you should review next. It considers:</p>
<ul>
  <li><strong>Correctness:</strong> Questions you got wrong are prioritized highest</li>
  <li><strong>Accuracy:</strong> Skills where you have low accuracy get more weight</li>
  <li><strong>Time decay:</strong> Questions you haven't seen in a while rise in priority</li>
  <li><strong>Difficulty:</strong> Harder questions get a slight bonus (they're worth more on the real test)</li>
  <li><strong>Marked for review:</strong> Questions you've starred get a priority boost</li>
</ul>
<p>The result is a ranked list of the 50 most important questions for you to review right now. Click any question to jump directly to it in the Question Bank.</p>

<h3>Error Log</h3>
<p>Your Error Log collects every note you've written about mistakes. Each entry shows:</p>
<ul>
  <li>Whether you eventually got the question right (✓) or wrong (✗)</li>
  <li>The domain and skill</li>
  <li>Your notes about what went wrong</li>
</ul>
<p>Reviewing your Error Log regularly is incredibly valuable — it helps you see <strong>patterns</strong> in your mistakes. Are you consistently making careless algebra errors? Misreading passage evidence? Your Error Log will reveal these patterns.</p>

<h3>Flashcards</h3>
<p>The Flashcards tab lets you:</p>
<ul>
  <li><strong>Create custom flashcard sets</strong> — Add your own terms and definitions for concepts you want to memorize</li>
  <li><strong>Study SAT Vocabulary</strong> — 10 pre-made sets of common SAT words are already loaded</li>
</ul>
<p>When studying a set, cards are presented in a click-to-flip format. After each card, rate your mastery from 0 (no clue) to 5 (perfect). The system uses <strong>weighted randomization</strong> — cards you rate lower appear more often, so you spend more time on what you don't know.</p>
<p>Your mastery percentage is tracked per set with a color-coded progress bar (green ≥ 70%, yellow ≥ 40%, red &lt; 40%).</p>`.trim(),
    },
  },

  // 8 – Check: Flashcards
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
        'The flashcard system uses weighted randomization based on your mastery rating (0–5). Cards rated lower appear more often, so you naturally spend more time on the concepts you haven\'t learned yet.',
    },
  },

  // 9 – Assignments
  {
    id: 'assignments',
    block_type: 'text',
    content: {
      html: `
<h2>Assignments</h2>
<p>If you have a teacher, they can assign you specific sets of questions to complete. Assignments appear on your <strong>Dashboard</strong> under the Assignments section.</p>

<h3>How Assignments Work</h3>
<ol>
  <li>Your teacher creates an assignment with a set of questions and (optionally) a due date</li>
  <li>The assignment appears on your Dashboard with its title, due date, and your completion progress</li>
  <li>Click the assignment to see all the questions and your progress on each one</li>
  <li>Click <strong>"Start Assignment"</strong> (or "Continue" if you've already started) to work through the questions</li>
  <li>Each question shows a colored indicator: green ✓ (correct), red ✗ (wrong), or a number (not yet attempted)</li>
</ol>

<h3>Tips for Assignments</h3>
<ul>
  <li>Check for new assignments regularly — your teacher may add them at any time</li>
  <li>Pay attention to <strong>due dates</strong>. Overdue assignments are highlighted in red</li>
  <li>Your teacher can see your completion percentage and accuracy, so do your best work</li>
  <li>If you get a question wrong, you can retry it — use the retry-until-correct approach to make sure you understand the concept before moving on</li>
</ul>`.trim(),
    },
  },

  // 10 – Study Routine
  {
    id: 'study-routine',
    block_type: 'text',
    content: {
      html: `
<h2>Building an Effective Study Routine</h2>
<p>Now that you know all the tools, here's how to put them together into a routine that will actually improve your scores:</p>

<h3>Daily Practice (15–30 minutes)</h3>
<ol>
  <li><strong>Start with Smart Review</strong> — Review 5–10 questions from the top of your Smart Review queue. These are the questions the system has identified as most important for you right now.</li>
  <li><strong>Work on Focus Areas</strong> — Do 10–20 questions from your weakest skills (your Dashboard highlights these). Use the Question Bank filters to target specific domains and skills.</li>
  <li><strong>Complete Assignments</strong> — If your teacher has assigned work, prioritize that.</li>
</ol>

<h3>Weekly Review (30–60 minutes)</h3>
<ol>
  <li><strong>Read your Error Log</strong> — Look for patterns in your mistakes. Are they conceptual (you don't understand the topic) or careless (you know it but keep slipping)?</li>
  <li><strong>Study Flashcards</strong> — Spend 10–15 minutes on vocabulary and concept cards, especially low-mastery ones.</li>
  <li><strong>Review marked questions</strong> — Go through questions you've starred and make sure you can solve them confidently.</li>
</ol>

<h3>Every 1–2 Weeks</h3>
<ol>
  <li><strong>Take a full practice test</strong> — This is the best way to measure real progress and build test-day stamina.</li>
  <li><strong>Review every wrong answer</strong> — After a practice test, go through every question you missed. Write Error Log notes for the ones that surprised you.</li>
  <li><strong>Check your Dashboard scores</strong> — Track your composite and section scores over time. Are they trending up?</li>
</ol>

<h3>Key Principles</h3>
<ul>
  <li><strong>Consistency beats intensity.</strong> 20 minutes every day is better than 3 hours once a week. Keep your streak alive!</li>
  <li><strong>Focus on weaknesses.</strong> It's tempting to practice what you're already good at, but the biggest score gains come from improving your weakest areas.</li>
  <li><strong>Review mistakes actively.</strong> Don't just read the explanation — write a note in your Error Log about what you'll do differently next time.</li>
  <li><strong>Use the tools together.</strong> The Question Bank, Smart Review, Error Log, and Flashcards are designed to work as a system. Each one reinforces the others.</li>
</ul>`.trim(),
    },
  },

  // 11 – Check: Study Routine
  {
    id: 'check-routine',
    block_type: 'check',
    content: {
      prompt:
        'According to the recommended study routine, what should you do first during your daily practice?',
      choices: [
        'Take a full practice test',
        'Create new flashcard sets',
        'Start with Smart Review to review priority questions',
        'Read through the entire Error Log',
      ],
      correct_index: 2,
      explanation:
        'Starting each daily session with Smart Review ensures you\'re always revisiting the questions the algorithm has identified as most important for your improvement — keeping your weakest areas top of mind.',
    },
  },

  // 12 – Wrap-up
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
    <td style="padding:8px;">Your stats, streak, focus areas, scores, and assignments</td>
  </tr>
  <tr style="border-bottom:1px solid #ddd;">
    <td style="padding:8px; font-weight:bold;">Question Bank</td>
    <td style="padding:8px;">Practice individual questions with filters, tools, and error notes</td>
  </tr>
  <tr style="border-bottom:1px solid #ddd;">
    <td style="padding:8px; font-weight:bold;">Tests</td>
    <td style="padding:8px;">Full-length, timed, adaptive SAT practice tests</td>
  </tr>
  <tr style="border-bottom:1px solid #ddd;">
    <td style="padding:8px; font-weight:bold;">Review</td>
    <td style="padding:8px;">Smart Review queue, Error Log notes, and Flashcards</td>
  </tr>
  <tr>
    <td style="padding:8px; font-weight:bold;">Assignments</td>
    <td style="padding:8px;">Teacher-assigned question sets (on your Dashboard)</td>
  </tr>
</table>
<p>The most important thing is to <strong>start practicing consistently</strong>. Even a few questions a day will add up. Good luck — you've got this!</p>`.trim(),
    },
  },
];

// ─── Page component ──────────────────────────────────────

export default function GettingStartedPage() {
  return (
    <div className="container" style={{ paddingTop: 24, maxWidth: 800, paddingBottom: 80 }}>
      {/* Header */}
      <Link href="/learn" style={{ fontSize: 13, color: 'var(--accent)' }}>&larr; Back to Learn</Link>

      <div style={{ marginTop: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>{LESSON.title}</h1>
        <p className="muted" style={{ fontSize: 14, margin: '0 0 8px' }}>{LESSON.description}</p>
        <span className="muted" style={{ fontSize: 13 }}>Platform Tutorial</span>
      </div>

      {/* Blocks */}
      {BLOCKS.map((block) => (
        <div key={block.id} style={{ marginBottom: 24 }}>
          {block.block_type === 'text' && (
            <div className="card" style={{ padding: '20px 24px' }}>
              <HtmlBlock className="prose" html={block.content.html} />
            </div>
          )}
          {block.block_type === 'check' && (
            <StaticCheckBlock content={block.content} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Knowledge check (self-contained, no API) ────────────

function StaticCheckBlock({ content }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const choices = content.choices || [];
  const correctIdx = content.correct_index ?? 0;

  function handleSubmit() {
    if (selected === null) return;
    setSubmitted(true);
  }

  return (
    <div
      className="card"
      style={{
        padding: '20px 24px',
        border: submitted
          ? `2px solid ${selected === correctIdx ? 'var(--success)' : 'var(--danger)'}`
          : undefined,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 8 }}>
        Knowledge Check
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>{content.prompt}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {choices.map((choice, i) => {
          const isCorrectChoice = i === correctIdx;
          const isSelected = i === selected;
          let bg = 'transparent';
          let border = '1px solid var(--border, #ddd)';
          if (submitted) {
            if (isCorrectChoice) {
              bg = 'rgba(76,175,80,0.1)';
              border = '1px solid var(--success)';
            } else if (isSelected && !isCorrectChoice) {
              bg = 'rgba(224,82,82,0.1)';
              border = '1px solid var(--danger)';
            }
          } else if (isSelected) {
            bg = 'var(--bg-alt, #f0f4ff)';
            border = '1px solid var(--accent)';
          }

          return (
            <button
              key={i}
              onClick={() => { if (!submitted) setSelected(i); }}
              disabled={submitted}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8, background: bg, border,
                cursor: submitted ? 'default' : 'pointer', textAlign: 'left',
                fontSize: 14, width: '100%',
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--muted)', width: 20, flexShrink: 0 }}>
                {String.fromCharCode(65 + i)}
              </span>
              <span>{choice}</span>
              {submitted && isCorrectChoice && (
                <span style={{ marginLeft: 'auto', color: 'var(--success)', fontWeight: 700 }}>&#10003;</span>
              )}
              {submitted && isSelected && !isCorrectChoice && (
                <span style={{ marginLeft: 'auto', color: 'var(--danger)', fontWeight: 700 }}>&#10007;</span>
              )}
            </button>
          );
        })}
      </div>

      {!submitted && (
        <button
          className="btn primary"
          onClick={handleSubmit}
          disabled={selected === null}
          style={{ marginTop: 12, fontSize: 13 }}
        >
          Check Answer
        </button>
      )}

      {submitted && content.explanation && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 6, background: 'var(--bg-alt, #f8f9fb)', fontSize: 14 }}>
          <strong>Explanation:</strong> {content.explanation}
        </div>
      )}
    </div>
  );
}
