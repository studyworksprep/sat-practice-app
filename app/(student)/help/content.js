// Help pages render this hand-authored HTML. Contextual Help buttons use the
// same article titles and summaries.
import {
  InfoIcon, PerformanceIcon, PracticeIcon, TestIcon, NotesIcon,
  SearchIcon, FlashcardsIcon, ReviewIcon, ClipboardCheckIcon,
  CalendarIcon, GoalIcon, ReportIcon, HelpIcon,
} from '@/lib/ui/icons';

export const HELP_TOPICS = [
  { id: 'getting-started', title: 'Getting started', description: 'Find your way around and decide what to work on first.' },
  { id: 'practice-and-scores', title: 'Practice and scores', description: 'Choose questions, take a practice test, and understand what your results mean.' },
  { id: 'review-and-study-tools', title: 'Review and study tools', description: 'Save what you learn and come back to it when you need it.' },
  { id: 'account-and-support', title: 'Account and support', description: 'Manage your subscription or find help when something goes wrong.' },
];

export const HELP_ARTICLES = [
  {
    slug: 'getting-started',
    topic: 'getting-started',
    title: 'Welcome to Studyworks',
    blurb: 'Get comfortable with Studyworks and find a few manageable things to do in your first week.',
    icon: InfoIcon, palette: 'gold',
    sections: [
      {
        id: 'first-week',
        heading: 'Make a plan for your first week',
        html: `
<p>Welcome! Whether you're studying for the SAT or ACT, or still deciding between them, you can start with a short practice session and use what you learn to choose your next one. If you're working with a tutor, your assignments are a good place to begin.</p>
<p>If Studyworks invites you to set up a <a href="/plan">Study Plan</a>, it will ask about your goal, your test date, and the time you have to study. You can look over the suggested plan before you begin. Once it's active, your <a href="/dashboard">Dashboard</a> shows the next tasks, so you can sit down to study without having to decide what to do each time.</p>
<p>As you work, take a moment to save an explanation you want to remember or a mistake you want to avoid. When you're ready for a longer session, take a timed <a href="/help/practice-tests">practice test</a> so you have a starting point to compare with later attempts.</p>
        `,
      },
      {
        id: 'where-to-go',
        heading: 'Find your way around',
        html: `
<ul>
  <li><a href="/dashboard">Dashboard</a> shows what's coming up and gives you a way back to the work you've recently finished.</li>
  <li><a href="/practice/start">Practice Questions</a> lets you choose the topics you want to work on. Open <a href="/practice/tests">Practice Tests</a> when you want to work through a test or a section under timed conditions. Use the SAT and ACT switch in the sidebar to choose which test you want to work on.</li>
  <li><a href="/performance">Performance</a> helps you spot the skills or categories that deserve another look. <a href="/learn">Lessons</a> gives you a place to learn a topic before trying more questions.</li>
  <li><a href="/notes">Notes</a> is where you keep your notes, Error Log entries, and flashcards. Open <a href="/review">Review</a> to study what you've saved or retry questions you've found difficult.</li>
  <li><a href="/assignments">Assignments</a> appears when you're linked to a tutor. It gives you a place to check what they've assigned and revisit completed work.</li>
</ul>
        `,
      },
    ],
  },
  {
    slug: 'dashboard',
    topic: 'getting-started',
    title: 'Your Dashboard',
    blurb: 'See what to work on today, how your recent practice is going, and where to find your past results.',
    icon: PerformanceIcon, palette: 'navy',
    sections: [
      {
        id: 'tasks',
        heading: 'Find your next task',
        html: `
<p>Start with <strong>Tasks</strong> on your <a href="/dashboard">Dashboard</a>. If you have an active study plan, you'll see what it's asking you to work on, whether that's a lesson, a question set, a review session, or a practice test. Tutor work appears with an <strong>Assigned</strong> label. Open a task to work on it, and check the list afterward to see what you've finished.</p>
<p>Open <a href="/plan">Study Plan</a> to see upcoming weeks or use <strong>Adjust</strong> if your goal, test date, or availability changes. If you're already in the middle of a practice session, look for <strong>Resume session</strong> on the Dashboard.</p>
        `,
      },
      {
        id: 'progress',
        heading: 'Read your progress and revisit recent work',
        html: `
<p><strong>Progress</strong> gives you a quick look at how often you've practiced and how often you answered correctly. A change in overall accuracy can reflect the mix of questions you've chosen. If you spent this week on a harder topic, look at your results on that topic before drawing conclusions from the overall percentage.</p>
<p><strong>Recently finished</strong> links back to results from recent work. If you just completed a practice set and want to revisit a question, open its report here or find it in practice history.</p>
        `,
      },
      {
        id: 'performance',
        heading: 'Use Performance to choose what to study',
        html: `
<p>Open <a href="/performance">Performance</a> when you want to look more closely at your attempts. SAT results are organized around Math and Reading and Writing skills. ACT results have their own breakdown by section and category when there's ACT practice to report. Look for a topic you've tried several times and still find difficult, then use it to choose your next practice session.</p>
<p>Color can help you spot where to look, but check the number of attempts too. One missed question may give you something useful to review. A series of similar misses tells you more about which skill to work on next.</p>
        `,
      },
    ],
  },
  {
    slug: 'study-routine',
    topic: 'getting-started',
    title: 'Build a Study Routine',
    blurb: 'Make a weekly plan you can follow on your own, with time for questions, review, and practice tests.',
    icon: CalendarIcon, palette: 'violet',
    sections: [
      {
        id: 'short-study-session',
        heading: 'Start with a study session you can repeat',
        html: `
<p>On a day when you have about 30 minutes, try spending five minutes reviewing something you've saved, 15 minutes on a small set of questions, and the last ten minutes reading explanations. If a question takes most of the session, use the remaining time to figure out where you got stuck and write down what you'll try next time.</p>
<p>Choose a topic narrow enough to practice more than once. For the SAT, you might work on transitions in Reading and Writing or linear equations in Math. For the ACT, try punctuation in English, a geometry category in Math, or a short Reading passage where you have to find evidence for each answer. If you're taking Science, set aside time to practice reading tables and graphs in context.</p>
        `,
      },
      {
        id: 'weekly-review',
        heading: 'Set aside time to review each week',
        html: `
<p>Read a few recent <a href="/review/error-log">Error Log entries</a> and look for a decision that keeps tripping you up, such as answering for the wrong quantity or choosing an answer before checking the passage. Pick one pattern and work through a small question set that lets you practice a different approach.</p>
<p>If you keep forgetting a formula or rule, make a <a href="/help/flashcards">flashcard</a> and try recalling it again a few days later. If you need to see how several steps fit together, write a <a href="/help/notes">note</a> with an example you can work through again.</p>
        `,
      },
      {
        id: 'practice-test-weeks',
        heading: 'Use practice tests as checkpoints',
        html: `
<p>Take a timed <a href="/help/practice-tests">practice test</a> early enough to give yourself a starting score and time to act on it. Between tests, work on a few patterns from your results. When you can set aside time for both the test and the review, take another under similar conditions and see what changed.</p>
<p>On the SAT, pay attention to how you manage time within each module. On the ACT, practice working at the pace of each section. For passage-based sections, notice how you divide your time between reading and answering. Use a format and calculator setup that match your test day as closely as possible.</p>
        `,
      },
    ],
  },
  {
    slug: 'assignments',
    topic: 'getting-started',
    title: 'Assignments',
    blurb: 'Find work from your tutor, check due dates, and return to completed assignments.',
    icon: ClipboardCheckIcon, palette: 'navy',
    sections: [
      {
        id: 'find-assignments',
        heading: 'Find work from your tutor',
        html: `
<p>If you're linked to a tutor on Studyworks, open <a href="/assignments">Assignments</a> to see the work they've shared with you. You may also see assigned work in the Tasks list on your Dashboard. Check the due date and any instructions before opening the assignment so you know how much time to set aside.</p>
<p>If you expected to see work and the list is empty, check with your tutor that they've assigned it to the account you're using. If you're studying independently, you can follow the <a href="/help/study-routine">study routine</a> and choose your own practice questions.</p>
        `,
      },
      {
        id: 'completed-work',
        heading: 'Return to completed work',
        html: `
<p>When you finish an assignment, you can find it under <strong>Completed</strong>. Open the results to review the questions and see where you'd like more practice. Your tutor can also see your results, so you can bring a specific question or an explanation you found confusing to your next session.</p>
        `,
      },
    ],
  },
  {
    slug: 'practice',
    topic: 'practice-and-scores',
    title: 'Practice Sessions',
    blurb: 'Build a question set for the SAT or ACT, then use the answer explanations to decide what to practice next.',
    summary: 'Practice Questions lets you choose what to work on and go at your own pace. This guide explains which filters are available for each test, how to use the tools during a session, and where to find your results afterward.',
    icon: PracticeIcon, palette: 'math',
    sections: [
      {
        id: 'sat-practice',
        heading: 'Choose SAT practice questions',
        html: `
<p>Open <a href="/practice/start?test=sat">SAT Practice Questions</a> and choose topics from <strong>Math</strong>, <strong>Reading and Writing</strong>, or both. Expand a domain to see its individual skills. If you want to understand why you keep missing a certain kind of question, start with one skill so the explanations are easier to compare.</p>
<p>Choose Easy, Medium, or Hard, or use the <strong>Score band</strong> filter to narrow the set further when bands are available. See <a href="/help/scores#sat-difficulty">SAT difficulty and Score Bands</a> for how to read these labels.</p>
        `,
      },
      {
        id: 'act-practice',
        heading: 'Choose ACT practice questions',
        html: `
<p>Open <a href="/practice/start?test=act">ACT Practice Questions</a> and choose from the available categories in <strong>English</strong>, <strong>Math</strong>, <strong>Reading</strong>, and <strong>Science</strong>. You might start with a punctuation category in English or a set of Science questions that ask you to interpret data. Passage-based questions can share the same text or figures, so give yourself time to read them before judging your pace.</p>
<p>The ACT difficulty filter runs from <strong>1 · Easiest</strong> to <strong>5 · Hardest</strong>. You can work from easier to harder questions or choose <strong>Test-form order</strong> to keep questions in their original order within each form. If you see very few matches, clear the difficulty filter to include questions without a rating. See <a href="/help/scores#act-difficulty">ACT difficulty levels</a> for ways to use the scale.</p>
        `,
      },
      {
        id: 'during-practice',
        heading: 'Work through your set',
        html: `
<p>Choose how many questions you want and the order you'd like to see them in. Check the number of matching questions before you start. Once you're in the session, use the numbered question buttons to move around and mark questions you want to revisit.</p>
<p>After submitting an answer, reveal the explanation and compare it with your own reasoning. If you guessed correctly, it's worth taking a moment to see why the answer works. For math questions, use the calculator when it helps you check an idea. The SAT Math reference sheet is also available during SAT Math practice.</p>
<p>If you need to leave, return to Practice Questions with the same test selected and look for <strong>Resume</strong> while the session is still in progress.</p>
        `,
      },
      {
        id: 'practice-history',
        heading: 'Review your results',
        html: `
<p>Open <strong>History</strong> from Practice Questions to return to a completed set. Look for questions you missed, flagged, or answered with a guess. If you notice a pattern, save it in your <a href="/help/error-log">Error Log</a> or make a note that explains the method you want to try again.</p>
        `,
      },
    ],
  },
  {
    slug: 'practice-tests',
    topic: 'practice-and-scores',
    title: 'Practice Tests',
    blurb: 'Set up an SAT or ACT practice test, choose timing that fits your goal, and make time to review afterward.',
    summary: 'Use Practice Tests to see how your skills hold up when you work through a timed test or a whole section. This guide explains how the SAT and ACT options differ and how to use your results to plan your next study sessions.',
    icon: TestIcon, palette: 'violet',
    sections: [
      {
        id: 'sat-practice-test',
        heading: 'Set up an SAT practice test',
        html: `
<p>Open <a href="/practice/tests?test=sat">SAT Practice Tests</a> and choose a test. Select both sections when you want a total score, or choose one section if you'd like to focus on it. Each section has two timed modules. On an adaptive test, your performance in the first module determines which second module you see in that section.</p>
<p>Check the timing setting before you start. During Math, get comfortable with the built-in Desmos calculator and the reference sheet, since those tools are available on the digital SAT. If you'll bring a handheld calculator, check College Board's policy and practice with the model you plan to use.</p>
<p>Read more about the format and permitted tools in <a href="https://satsuite.collegeboard.org/scores/what-scores-mean/how-scores-calculated">College Board's guide to SAT scoring</a> and its <a href="https://satsuite.collegeboard.org/sat/what-to-bring-do/calculator-policy">SAT calculator policy</a>.</p>
        `,
      },
      {
        id: 'act-practice-test',
        heading: 'Set up an ACT practice test',
        html: `
<p>Open <a href="/practice/tests?test=act">ACT Practice Tests</a> and choose an <strong>Enhanced ACT</strong> form to practice for the current format. Older <strong>Classic ACT</strong> forms can give you more questions to work through at the older pace. Select English, Math, and Reading for an Enhanced ACT Composite, and include Science if you're taking it. If you’re testing through school, check which sections your school is offering. You can also choose a single section on Studyworks when you want to practice its timing or work through it untimed.</p>
<p>The ACT uses fixed sections, so your answers don't change what you'll see in the next section. Check the time shown on each section before you start. A released form may have fewer questions than the test you take on test day because it leaves out unscored questions. Studyworks shortens the section time in that case so you can practice at the same pace per question.</p>
<p>Plan to use a calculator only in Math. ACT allows approved handheld calculators, and its national online test provides Desmos in Math. Practice with the option you'll use on test day. See <a href="https://www.act.org/content/act/en/products-and-services/the-act/test-preparation/act-exam-sections-and-structure.html">ACT's guide to the exam sections</a> and the <a href="https://www.act.org/content/act/en/products-and-services/the-act/test-day/calculator-policy.html">ACT calculator policy</a> for details.</p>
        `,
      },
      {
        id: 'during-the-test',
        heading: 'Make the timing count',
        html: `
<p>For a starting score you can compare with later attempts, set aside enough time to take the test in one sitting, with the breaks and timing you'll have on test day. Put away your notes and phone. If you're stuck, mark the question and return to it if time remains in that module or section.</p>
<p>If you need to leave, return to Practice Tests with the same test selected and look for <strong>Continue</strong>. The clock keeps running once a timed module or section has started, so plan any interruptions between modules or sections if you can.</p>
        `,
      },
      {
        id: 'after-the-test',
        heading: 'Turn your results into a study plan',
        html: `
<p>Open your results from <strong>History</strong> with the same test selected. Alongside your scores, revisit questions you missed or marked and any correct answers you reached by guessing. Ask whether you needed more time, misunderstood what the question was asking, or needed to learn a concept before trying again.</p>
<p>Choose one or two patterns to work on before the next test. You might try a set of SAT questions on the same skill or a timed ACT section to see whether a different pacing strategy helps. When you compare results, look at attempts with similar timing and section choices. The <a href="/help/scores">scores guide</a> explains what each result can tell you.</p>
        `,
      },
    ],
  },
  {
    slug: 'scores',
    topic: 'practice-and-scores',
    title: 'Understanding Your Scores',
    blurb: 'Understand SAT and ACT scores, read each test’s difficulty labels, and use your results to choose what to study.',
    icon: GoalIcon, palette: 'gold',
    sections: [
      {
        id: 'sat-scoring',
        heading: 'How the SAT is scored',
        html: `
<p>The digital SAT has two section scores, one for Reading and Writing and one for Math. Each ranges from 200 to 800, and the two scores add up to a total of 400 to 1600. If you take just one section on Studyworks, use its section score to see how that part of your practice is going.</p>
<p>On the official SAT, each section starts with a module containing a mix of easier and harder questions. Your performance in that module determines the overall difficulty of the second one, and your section score is based on your work across both modules. Two students can answer the same number of questions correctly and earn different scores, so a practice percentage by itself can't tell you what your scaled score will be.</p>
<p>Learn more in <a href="https://satsuite.collegeboard.org/scores/what-scores-mean/how-scores-calculated">College Board's explanation of how SAT scores are calculated</a>.</p>
        `,
      },
      {
        id: 'sat-difficulty',
        heading: 'SAT difficulty and Score Bands',
        html: `
<p>In SAT Practice Questions, <strong>Easy</strong>, <strong>Medium</strong>, and <strong>Hard</strong> let you choose a broad level of challenge. When a question has a <strong>Score Band</strong>, Studyworks can use its rating from 1 to 7 to make a finer distinction. Bands 1 to 3 are Easy, 4 to 5 are Medium, and 6 to 7 are Hard.</p>
<p>Use the bands to vary the difficulty of the questions you practice. For example, if you've been getting most Band 4 questions on linear equations right and can explain your steps, try Band 5 questions on the same skill and see where you need more time. The band describes the question. To gauge your current SAT score, use a timed practice test.</p>
        `,
      },
      {
        id: 'act-scoring',
        heading: 'How the ACT is scored',
        html: `
<p>ACT section scores range from 1 to 36. On the current <strong>Enhanced ACT</strong>, your Composite is the rounded average of your English, Math, and Reading scores. If you take Science, it has a separate section score. Older <strong>Classic ACT</strong> practice forms in Studyworks use the earlier Composite calculation, which averages English, Math, Reading, and Science.</p>
<p>Studyworks follows the rule for the form you chose and needs a scaled score in each required section to show a Composite. If you practiced Math by itself or your form doesn't have a score conversion, use the number correct and the question explanations to decide what to study next.</p>
<p>See <a href="https://www.act.org/content/act/en/products-and-services/the-act-postsecondary-professionals/scores/multi-scores.html">ACT's explanation of Composite scores</a> for more about the current calculation.</p>
        `,
      },
      {
        id: 'act-difficulty',
        heading: 'ACT difficulty levels',
        html: `
<p>In ACT Practice Questions, Studyworks uses five difficulty levels, from <strong>1 · Easiest</strong> to <strong>5 · Hardest</strong>. These are Studyworks estimates for choosing practice questions. Your 1-to-36 score comes from your performance on a test with a score conversion.</p>
<p>For many imported Math questions, Studyworks estimates difficulty from where the question appears in its section. For some Science forms, the estimate also takes into account where the question appears within its passage. Some questions, including many in English and Reading, have no difficulty rating. Leave the filter clear to include those questions.</p>
<p>Start with a level where you can explain most of your answers, then try the next level in the same category. In ACT Math, for example, you might be comfortable finding a missing length in a single step but need more practice when a problem combines several relationships. In Reading or Science, a question may feel harder when you have to connect information from more than one part of a passage or figure.</p>
<p>Once you're comfortable working through questions at your own pace, try a mixed set or a timed section. That will help you see whether a question is taking longer because of the concept, the amount of reading, or a step in your approach. If you're stuck during a timed section, leave yourself time for the questions you can answer and come back if time remains. See <a href="https://www.act.org/content/act/en/products-and-services/the-act/test-preparation/act-exam-sections-and-structure.html">ACT's advice for working through a section</a>.</p>
        `,
      },
      {
        id: 'accuracy-and-goals',
        heading: 'Use accuracy and test scores together',
        html: `
<p>Accuracy tells you how many of the questions you attempted were correct. Check the number and difficulty of those questions when you compare results. Getting three out of four right gives you a reason to keep exploring a skill. Getting most questions right across several sessions tells you more about what you can do consistently.</p>
<p>For a score goal, start with a timed practice test in the format you'll take and look at the section results. Choose a specific next step, such as leaving time to revisit marked SAT Math questions or finishing each ACT English passage within the time you've set aside. After another comparable test, use the new results to decide whether that step is helping.</p>
<p>Treat your Studyworks scores as practice estimates. Looking at several comparable attempts gives you a better sense of your usual performance than choosing your highest score.</p>
        `,
      },
    ],
  },
  {
    slug: 'notes',
    topic: 'review-and-study-tools',
    title: 'Notes, Error Log, and Flashcards',
    blurb: 'Choose a place to save a worked example, a mistake you want to avoid, or a fact you want to remember.',
    summary: 'Notes keeps your study materials together. You can write a note to explain a concept, use the Error Log to remember what you want to do differently, or make a flashcard for a fact you want to recall quickly.',
    icon: NotesIcon, palette: 'amber',
    sections: [
      {
        id: 'choose-a-tool',
        heading: 'Choose what to save',
        html: `
<p>When you review a question, ask what you'd like to remember when you see a similar one. The answer can help you choose a tool.</p>
<ul>
  <li>Use a <a href="/help/flashcards">flashcard</a> when you want to recall one thing, such as how to find the area of a trapezoid or what a word means in a sentence.</li>
  <li>Use the <a href="/help/error-log">Error Log</a> when you want to remember a decision you could make differently. If you solved for <em>x</em> when the question asked for <em>2x</em>, write down how you'll check the requested quantity next time.</li>
  <li>Write a <strong>note</strong> when you need room to explain how ideas fit together. A worked example that shows how to set up two equations from a word problem is a good place to start.</li>
</ul>
        `,
      },
      {
        id: 'write-a-note',
        heading: 'Write a note you can learn from later',
        html: `
<p>Open <a href="/notes">Notes</a> and choose <strong>New note</strong>. Give it a title you can recognize later and explain the idea in words that make sense to you. You can format your text, add math notation, and give the note tags that make it easier to find again.</p>
<p>Try adding an example with a short explanation of why each step works. When you come back to it, cover the solution and see how far you can get on your own. <a href="/review/notes">Review notes</a> gives you a place to read through what you've saved.</p>
        `,
      },
    ],
  },
  {
    slug: 'error-log',
    topic: 'review-and-study-tools',
    title: 'Error Log',
    blurb: 'Keep track of mistakes you want to learn from and give yourself a clear next step for similar questions.',
    summary: 'The Error Log keeps your reflection alongside the question that prompted it. Use this guide to write a helpful entry and find patterns when you review.',
    icon: SearchIcon, palette: 'danger',
    sections: [
      {
        id: 'write-an-entry',
        heading: 'Write an entry for your future self',
        html: `
<p>When you review an answer and see a step you want to change, open <strong>Error Log</strong> on the question and write what happened while you can still remember your reasoning. The entry is linked to that question, so you can come back to it and add to your original note as you learn more.</p>
<p>Give yourself something specific to try. For example, “I calculated the answer in feet and missed that the choices were in inches. Next time, I'll underline the requested unit before I start.” For a passage question, you might write, “I'll find a sentence in the passage that supports my choice before moving on.”</p>
        `,
      },
      {
        id: 'find-your-entries',
        heading: 'Find and review your entries',
        html: `
<p>Open the <a href="/notes/error-log">Error Log under Notes</a> to browse or update your entries. Use <strong>Show question</strong> when you want to expand an item and see the question it came from.</p>
<p>Open <a href="/review/error-log">Review error log</a> when you have time to study. It puts your entries alongside the expanded questions and explanations. Both places show your saved entries from the SAT and ACT.</p>
        `,
      },
      {
        id: 'notice-patterns',
        heading: 'Use patterns to choose your next questions',
        html: `
<p>Read a few entries at the end of the week and look for a habit that shows up more than once. If you keep picking an answer that sounds reasonable before checking the passage, make a small Reading practice set and deliberately point to the evidence for each answer. Add a follow-up to the entry if that approach helped.</p>
        `,
      },
    ],
  },
  {
    slug: 'flashcards',
    topic: 'review-and-study-tools',
    title: 'Flashcards',
    blurb: 'Make cards for facts, formulas, and rules, and come back to the ones you’re still learning.',
    summary: 'Flashcards help you practice recalling one idea at a time. Learn how to write a card, review a set, and use the mastery rating to tell which cards need another look.',
    icon: FlashcardsIcon, palette: 'pink',
    sections: [
      {
        id: 'make-a-card',
        heading: 'Write a card you can answer from memory',
        html: `
<p>Put a short question on the front and one idea on the back. For a geometry card, you might ask, “How do I find the area when I know the two parallel sides and the height of a trapezoid?” Put the formula and a brief reminder of what each measurement represents on the back.</p>
<p>For a word or grammar rule, add an example sentence so you can see how it works in context. If you want to include several steps or compare different cases, give yourself more room in a <a href="/help/notes">note</a>.</p>
        `,
      },
      {
        id: 'review-a-set',
        heading: 'Open a set and review a few cards',
        html: `
<p>Open <a href="/notes/flashcards">Flashcards</a> to find starter sets and any sets you've created. Choose <strong>Manage</strong> to add or edit cards, or <strong>Review</strong> to go through a set. Take a moment to say or write your answer before you flip each card, then rate how well you remembered it.</p>
<p>Your ratings help Studyworks give more attention to cards you’re still learning. The mastery percentage on a set summarizes how familiar its cards are based on your reviews. A short session a few days later gives you another chance to recall the ideas after you've had time away from them.</p>
        `,
      },
    ],
  },
  {
    slug: 'review',
    topic: 'review-and-study-tools',
    title: 'Review Your Practice',
    blurb: 'Return to questions you found difficult or spend time with your saved study materials.',
    summary: 'Review brings together questions you’ve struggled with and the notes, Error Log entries, and flashcards you’ve saved. It’s a good place to start when you want to revisit what you’ve learned.',
    icon: ReviewIcon, palette: 'cyan',
    sections: [
      {
        id: 'review-drills',
        heading: 'Retry questions or work on a recurring mistake',
        html: `
<p>On <a href="/review">Review</a>, <strong>Common Errors</strong> points to SAT skills or ACT categories you've struggled with. Choose one to focus on if you'd like to work through similar questions together. If you'd prefer a mix, start a drill from the weak questions list, which draws on your past attempts.</p>
<p>Review can show separate SAT and ACT recommendations when you have enough practice history for both. If you're new and the page has little to suggest, work through a few questions and return once you've had a chance to review your answers.</p>
        `,
      },
      {
        id: 'review-materials',
        heading: 'Study the material you’ve saved',
        html: `
<p>Choose <a href="/review/notes">Review notes</a> to read a worked example again, <a href="/review/error-log">Review error log</a> to revisit mistakes alongside the original questions, or <a href="/notes/flashcards">Review flashcards</a> to see what you can recall without looking. On a busy day, pick one of these and give it a few minutes.</p>
        `,
      },
    ],
  },
  {
    slug: 'billing',
    topic: 'account-and-support',
    title: 'Billing and Subscription',
    blurb: 'Find your trial dates, update your payment details, or cancel your subscription.',
    icon: ReportIcon, palette: 'slate',
    sections: [
      {
        id: 'trial-and-plans',
        heading: 'Check your plan and trial dates',
        html: `
<p>Open <a href="/account/billing">Billing</a> to check your subscription status and the dates that apply to your account. If you're in the seven-day free trial, the page shows when it ends. You can see current plan options on the <a href="/subscribe">subscription page</a>.</p>
<p>If your account is sponsored through a tutor or school that works with Studyworks, Billing may show <strong>Exempt</strong>. That means your access is covered and you can use Studyworks without a separate subscription.</p>
        `,
      },
      {
        id: 'cancel-subscription',
        heading: 'Cancel a trial or subscription',
        html: `
<p>From <a href="/account/billing">Billing</a>, choose <strong>Manage Subscription</strong> to open the billing portal. Select <strong>Cancel plan</strong> and follow the prompts until the portal confirms the change. It will show the date your access ends.</p>
<p>To avoid a charge during a free trial, complete cancellation before the trial ends. If you've already paid for a period, you can keep using your subscription through the end of that period.</p>
        `,
      },
      {
        id: 'payment-and-support',
        heading: 'Update payment details or ask about a charge',
        html: `
<p>Use <strong>Manage Subscription</strong> to update your card or billing details, see the plan options available for your account, or find a receipt. If your subscription has ended, open the <a href="/subscribe">subscription page</a> to see your options for restarting it.</p>
<p>If your account status or a charge looks different from what you expected, email <a href="mailto:support@studyworksprep.com">support@studyworksprep.com</a> and tell us what you see on the Billing page.</p>
        `,
      },
    ],
  },
  {
    slug: 'faq',
    topic: 'account-and-support',
    title: 'Common Questions and Troubleshooting',
    blurb: 'Get help with interrupted tests, unexpected answers, calculator problems, and missing assignments.',
    icon: HelpIcon, palette: 'navy',
    sections: [
      {
        id: 'question-marked-wrong',
        heading: 'What if a question seems to be marked incorrectly?',
        html: `
<p>Check the answer explanation first, especially if the question asks for a different quantity or for evidence from a specific part of a passage. If you still think the answer is incorrect, contact your tutor or <a href="mailto:support@studyworksprep.com">Studyworks support</a>. Include the question code if it's visible and describe the answer you expected, so we can find the question and check it.</p>
        `,
      },
      {
        id: 'calculator-not-loading',
        heading: 'Why isn’t the calculator loading?',
        html: `
<p>The built-in calculator is a Math tool. If you're on a Math question and it isn't opening, try refreshing the page or using a current version of your browser. If it still doesn't load, tell support what browser you're using and where you were practicing.</p>
        `,
      },
      {
        id: 'interrupted-test',
        heading: 'How do I get back to an interrupted practice test?',
        html: `
<p>Return to <a href="/practice/tests">Practice Tests</a>, select SAT or ACT to match the attempt, and look for <strong>Continue</strong> if it's still in progress. The timer keeps running after a timed module or section begins, so check the remaining time when you get back. See the <a href="/help/practice-tests">Practice Tests guide</a> for the timing options available on each test.</p>
        `,
      },
      {
        id: 'missing-assignments',
        heading: 'Where are my tutor’s assignments?',
        html: `
<p>If your tutor has assigned work and you can't find it, check that you're signed in with the same account your tutor linked. See the <a href="/help/assignments">Assignments guide</a> for where to look for new and completed work.</p>
        `,
      },
      {
        id: 'switch-tests',
        heading: 'How do I switch between the SAT and ACT?',
        html: `
<p>Use the SAT and ACT switch in the sidebar. On a phone, tap <strong>More</strong> to open it. Your choice applies when you open <a href="/practice/start">Practice Questions</a> or <a href="/practice/tests">Practice Tests</a>. Each test has its own question filters and test options. Your saved study materials are available from <a href="/notes">Notes</a>.</p>
        `,
      },
      {
        id: 'how-much-practice',
        heading: 'How many questions should I do in one session?',
        html: `
<p>Start with a set small enough to leave time for the explanations. Ten questions might work well on a busy day, while one ACT Reading passage or a few longer Math problems might be plenty on another. The <a href="/help/study-routine#short-study-session">study routine guide</a> gives you a way to divide your time.</p>
        `,
      },
      {
        id: 'cancel-my-subscription',
        heading: 'Where do I cancel my subscription?',
        html: `
<p>Open <a href="/account/billing">Billing</a> and choose <strong>Manage Subscription</strong> to reach the billing portal. The <a href="/help/billing#cancel-subscription">cancellation guide</a> explains how to finish the process and check when your access ends.</p>
        `,
      },
      {
        id: 'contact-support',
        heading: 'How can I get more help?',
        html: `
<p>For questions about what to study next, your tutor can help you choose where to start. If you're having trouble with your account or something on the site, email <a href="mailto:support@studyworksprep.com">support@studyworksprep.com</a> and tell us what you were trying to do.</p>
        `,
      },
    ],
  },
];

export function getArticle(slug) {
  return HELP_ARTICLES.find((article) => article.slug === slug) ?? null;
}

export function getHelpTopics() {
  return HELP_TOPICS.map((topic) => ({
    ...topic,
    articles: HELP_ARTICLES.filter((article) => article.topic === topic.id),
  }));
}
