'use client';

import FeatureSlideshow, {
  SlideHero,
  SlideScreenshot,
  SlideFeatures,
  SlideFeatureRundown,
  SlidePricing,
} from '@/components/FeatureSlideshow';
import { SlideResults } from '@/components/SlideResults';
import { icons } from '@/components/MarketingIcons';
import { satResults } from '@/lib/marketing/results';

// Deck structure: hero, results, then one slide per feature, a full
// feature rundown, and pricing last. Score-report and Opportunity Index
// screenshots are shared with the student deck, with copy written for
// tutors. Mastery, Lessons and ACT lead with icon cards (SlideFeatures);
// Lessons and ACT are followed by a screenshot (captured 2026-11-09 on
// studyworks-dev with test accounts; the ACT topic counts match
// production). Mastery has no screenshot yet. The old "Weighted Mastery
// Analysis" slide was dropped: its screenshot showed per-skill
// accuracy, not mastery.
//
// Copy voice (Nov 2026): plain, friendly, short sentences, no jargon.
// Claims checked against production 2026-11-09: 45 published lessons
// (all SAT), ACT questions in all four sections, 9 full-length ACT
// forms. Lesson packs are question sets, not bundles of lessons, and
// lessons have no videos.

const slides = [
  {
    content: ({ next }) => (
      <SlideHero
        title={<>The Test Prep Platform Built<br/>for Serious Tutors</>}
        subtitle="See how every student is doing, assign the right practice, and walk into each session knowing what to cover, for the SAT and the ACT. Use the arrows to explore."
        ctaText="See the Tools"
        onCtaClick="next"
        next={next}
      />
    ),
  },
  {
    content: (
      <SlideResults
        title="The Results Behind the Method"
        subtitle={`Studyworks Prep tutors run their students' preparation on these same tools. Here's how ${satResults.students} of those students' SAT scores changed.`}
        points={[
          <>Gains came in both sections: a typical <strong>+{satResults.medianMathGain}</strong> in Math and <strong>+{satResults.medianReadingWritingGain}</strong> in Reading &amp; Writing.</>,
          'Students who answered more practice questions and had more weeks to prepare tended to gain more. Assignments and progress tracking help you plan for both.',
        ]}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-dashboard-1.png"
        alt="Tutor dashboard with the student roster"
        title="Your Whole Roster in One Place"
        description="See all your students at a glance: who's been practicing, who's improving, and who needs your attention. Group students by class to compare them and catch problems early."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-dashboard-2.png"
        alt="Tutor dashboard with patterns across the whole roster"
        title="See What's Working and What Isn't"
        description="The dashboard also shows patterns across your whole group: the hardest questions, the easiest ones, and a color-coded map of how students are doing in each area of the test. If the same question trips up five students, go over it in your next group session. If one area is red across the board, it may be time to teach it a different way. It's feedback on your teaching, not just on your students."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-1a.png"
        alt="Student profile header"
        title="Every Student, Fully Visible"
        description="Click any student to open their profile. At the top you'll see their goal score, latest test, current assignments, and recent activity, so you walk into every session knowing where to start."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-1b.png"
        alt="Student practice record"
        title="The Complete Practice Record"
        description="Below that is the student's full practice record: how they're doing in each area and at each difficulty level, how many questions they've answered, how they're trending lately, and every practice test they've taken."
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="Mastery"
        title="Mastery: A Truer Measure Than Accuracy"
        subtitle="Accuracy tells you how many questions a student got right. Mastery tells you whether they really know a skill. You'll see it when you prep for a session, on each student's profile, and in their study plan."
        features={[
          { icon: icons.weight, title: 'Harder questions count more', desc: 'A right answer on a hard question counts for more than one on an easy question.' },
          { icon: icons.stack, title: 'Enough practice to be sure', desc: 'A skill isn’t marked mastered until the student has answered enough questions to show it.' },
          { icon: icons.hint, title: 'Hints count for half', desc: 'Answers reached with a hint get partial credit, so you can see what a student can do on their own.' },
          { icon: icons.trendDown, title: 'Slipping skills get flagged', desc: 'When a skill a student had nearly mastered starts to slide, you’ll know before it shows up on test day.' },
        ]}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-2b.png"
        alt="Results for each skill"
        title="Pinpoint What to Work On"
        description="Every area of the test breaks down into individual skills. You'll see exactly which ones need work, so you can tell a student they've nailed linear equations but need more practice on systems, and plan each session around what will help most."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/score-report-introview.png"
        alt="Score report overview"
        title="The Same Score Reports Your Students See"
        description="When a student finishes a practice test, you both get the same detailed report: section scores, results for each area and skill, and how they did at each difficulty level. You can look at the same numbers together and agree on what to do next."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/score-report-bestview.png"
        alt="Opportunity Index and timing for each question"
        title="The Opportunity Index Helps Plan Your Lessons"
        description="The Opportunity Index looks at the skills a student missed and how quickly each one can be improved, then ranks them by how many points they could add. It's the lesson plan you'd build yourself, updated after every test. It also shows how long the student spent on each question, so you can tell whether they're missing questions because of the content or because of their pacing."
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="Lessons"
        title="Lessons You Can Assign"
        subtitle="Our library has more than 40 short SAT lessons, each focused on one skill or strategy. Assign one before a session to prepare, or after to reinforce what you covered."
        features={[
          { icon: icons.book, title: 'Step-by-step teaching', desc: 'Each lesson walks students through a skill, with quick check-in questions and feedback along the way.' },
          { icon: icons.check, title: 'See who finished', desc: 'Track each student’s progress through every lesson you assign.' },
          { icon: icons.play, title: 'Practice right after', desc: 'Students can start a short set of questions on the same skill as soon as they finish.' },
          { icon: icons.stack, title: 'Lesson packs', desc: 'Build your own question sets from the bank to use in your lessons, and reuse them with any student.' },
        ]}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/lesson-desmos-check.png"
        alt="A lesson's knowledge check answered correctly, with a Desmos graph beside it"
        title="What Your Students See in a Lesson"
        description="Lessons mix short explanations with quick check questions, and every answer gets instant feedback. In Desmos lessons the graph sits right beside the question, so students practice the calculator moves they'll use on test day."
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="ACT"
        title="Tutor the ACT Too"
        subtitle="Everything works for your ACT students as well. Each student picks their test, and their practice, tests, and progress follow it."
        features={[
          { icon: icons.grid, title: 'All four sections', desc: 'English, Math, Reading, and Science questions, sorted by topic.' },
          { icon: icons.stack, title: 'ACT assignments', desc: 'Assign question sets or timed full-length tests, in the classic format or the new 2025 format.' },
          { icon: icons.report, title: 'The same detailed reports', desc: 'Composite and section scores, results by topic, and every question to go over together.' },
          { icon: icons.clock, title: 'Extended time', desc: 'A student’s extra time is saved once and applies to every timed SAT or ACT test.' },
        ]}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/act-practice-builder.png"
        alt="Building an ACT practice set by section and topic"
        title="ACT Practice by Section and Topic"
        description="Students can build their own ACT practice from more than 1,800 questions across English, Math, Reading, and Science. They pick the sections, topics, and difficulty, and the set is ready to start."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/review-hub.png"
        alt="The Review area: weak questions drill, Error Log, and Flashcards"
        title="A Simple Way for Students to Review"
        description="When you spot a gap, send students to the Review area. The weak questions drill gives them the questions they've had the most trouble with, the same review you'd do together before test day, ready in one click. The Error Log asks them to write down why they missed a question and how they'll avoid it next time. Flashcards let them save any idea, term, or formula you want them to remember. You decide what to focus on; the Review area is where they do the work."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-3.png"
        alt="Progress over time and suggested review"
        title="Track Progress and Share It"
        description="See which areas are improving and which have stalled. Studyworks suggests what to review based on where each student has the most room to grow, and every report is one you can walk through with students and their families."
      />
    ),
  },
  {
    content: (
      <SlideFeatureRundown
        title="Every Tool Studyworks Gives Tutors"
        subtitle="Here's everything that comes with a Studyworks tutor account."
        sections={[
          {
            label: 'Roster & Profiles',
            items: [
              { title: 'Live student roster', desc: 'Who’s active, how they’re doing, and who needs attention.' },
              { title: 'Student profiles', desc: 'Mastery, test history, sessions, official scores, and assignments.' },
              { title: 'Invite students by email', desc: 'Each student gets a personal code to join your roster.' },
              { title: 'Subscription status', desc: 'See at a glance which students still need to subscribe.' },
            ],
          },
          {
            label: 'Assignments',
            items: [
              { title: 'Custom question sets', desc: 'Pick the topics and difficulty, for the SAT or the ACT.' },
              { title: 'Live completion tracking', desc: 'See who has finished what, as it happens.' },
              { title: 'Lesson assignments', desc: 'Assign any lesson and follow each student’s progress through it.' },
              { title: 'Lesson packs', desc: 'Your own reusable question sets, built from the bank.' },
            ],
          },
          {
            label: 'Tests & Scores',
            items: [
              { title: 'Full-length SAT tests', desc: 'Assign adaptive Digital SAT tests any time.' },
              { title: 'Full-length ACT tests', desc: 'All four sections, in the classic or 2025 format.' },
              { title: 'Detailed score reports', desc: 'Section scores plus results for every skill.' },
              { title: 'Opportunity Index', desc: 'Each student’s skills, ranked by how many points they could add.' },
              { title: 'Timing for every question', desc: 'Tell pacing problems apart from content gaps.' },
              { title: 'Bluebook results upload', desc: 'Bring in College Board scores for the same detailed report.' },
              { title: 'Official SAT/PSAT scores', desc: 'Record real test scores, including the score range for all 8 areas.' },
            ],
          },
          {
            label: 'Progress & Insights',
            items: [
              { title: 'Mastery for every skill', desc: 'Counts harder questions more and needs enough practice to be sure.' },
              { title: 'Class dashboard', desc: 'Accuracy trends, score spread, and the hardest and easiest questions.' },
              { title: 'Skill heat maps', desc: 'Spot patterns across your whole roster at once.' },
              { title: 'Concept tags', desc: 'Find questions by concept across the whole bank.' },
              { title: 'Wrong-answer tags', desc: 'Label the trap behind each wrong answer choice.' },
            ],
          },
          {
            label: 'Review',
            items: [
              { title: 'Weak questions drill', desc: 'Send any student back to the questions they’ve missed most.' },
              { title: 'Error Log', desc: 'Students note why they missed each question and how to avoid it. You see every entry.' },
              { title: 'Flashcards', desc: 'Students save any idea, term, or formula you want them to remember, and you can check they’re using them.' },
              { title: 'Question notes', desc: 'Keep your own notes on any question in the bank.' },
            ],
          },
          {
            label: 'Tools',
            items: [
              { title: 'Desmos solutions', desc: 'One-click graphing solutions for most SAT math questions.' },
            ],
          },
        ]}
      />
    ),
  },
  {
    showCta: true,
    content: (
      <SlidePricing
        price="$39.99"
        period="per month for accounts created November 8, 2026 or later; earlier accounts keep $29.99/month"
        items={[
          'Invite as many students as you like (each student has their own subscription)',
          'SAT and ACT question banks and practice tests',
          'Assignments, including lessons',
          'Mastery tracking and score reports',
          'Bluebook upload and timing for every question',
          'Concept tags and Desmos solutions',
          'Session notes',
        ]}
        note={{
          title: 'Studyworks Prep educators',
          text: <>Teachers with <a href="https://www.studyworksprep.com" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: 'var(--color-app-primary, #102a43)' }}>Studyworks Prep</a> get full access at no cost, along with the students Studyworks sponsors.</>,
          bg: 'rgba(16,42,67,0.05)',
          border: 'rgba(16,42,67,0.2)',
          titleColor: 'var(--color-app-primary, #102a43)',
          textColor: '#64748b',
        }}
      />
    ),
  },
];

export default function TeachersFeaturePage() {
  return <FeatureSlideshow slides={slides} />;
}
