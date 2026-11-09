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
// feature rundown, and pricing last. Feature slides carry a screenshot
// where we have a current one; Mastery, Lessons and ACT use icon cards
// (SlideFeatures) until screenshots of those screens are captured.
//
// Copy voice (Nov 2026): talk to the student, short sentences, no
// jargon ("surfaces", "learnability"). Claims checked against
// production 2026-11-09: 45 published lessons (all SAT), ACT questions
// in all four sections, 9 full-length ACT forms. ACT questions mostly
// lack written explanations, so don't promise them for ACT.

const slides = [
  {
    content: ({ next }) => (
      <SlideHero
        title={<>SAT &amp; ACT Practice That<br/>Actually Moves Your Score</>}
        subtitle="Practice questions, full-length tests, short lessons, and score reports that show you what to work on next. Use the arrows to see how it works."
        ctaText="See What's Inside"
        onCtaClick="next"
        next={next}
      />
    ),
  },
  {
    content: (
      <SlideResults
        title="Real Score Gains From Real Students"
        subtitle="The questions, practice tests, and score reports here are the same ones Studyworks Prep tutors use with their students. Here's how those students' SAT scores changed."
        points={[
          <>Both sections went up: the typical gain was <strong>+{satResults.medianMathGain}</strong> in Math and <strong>+{satResults.medianReadingWritingGain}</strong> in Reading &amp; Writing.</>,
          'Students who answered more practice questions tended to gain more points, so every question you work through counts.',
        ]}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/student-dashboard-1.png"
        alt="Student dashboard with results for each section and skill"
        title="See Where You Stand"
        description="Your dashboard shows how you're doing in every section and skill. Colors make your weak spots easy to find, so you always know what needs work."
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="Mastery"
        title="A Better Way to Measure Progress"
        subtitle="Accuracy only tells you how many questions you got right. Mastery tells you whether you really know a skill, and it's how your study plan tracks your progress."
        features={[
          { icon: icons.weight, title: 'Harder questions count more', desc: 'Getting a hard question right says more about what you know than getting an easy one right.' },
          { icon: icons.stack, title: 'It takes more than a lucky streak', desc: 'A skill only counts as mastered once you’ve answered enough questions to show it.' },
          { icon: icons.hint, title: 'Hints still earn credit', desc: 'If you needed a hint to get the answer, you get half credit for it.' },
          { icon: icons.trendDown, title: 'Slipping skills get flagged', desc: 'If a skill you’d nearly mastered starts to slide, you’ll see it so you can review before it costs you.' },
        ]}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/score-report-introview.png"
        alt="Score report overview"
        title="Score Reports That Explain Your Score"
        description="After every practice test, you get more than a number. See your score for each section, then how you did in each skill and at each difficulty level. You'll know what you missed and which kinds of questions are costing you the most points."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/score-report-bestview.png"
        alt="Opportunity Index and timing for each question"
        title="The Opportunity Index Tells You What to Study Next"
        description="Not every mistake costs you the same. The Opportunity Index looks at the skills you missed and how quickly each one can be improved, then puts them in order. Start at the top and your study time goes where it can add the most points. You'll also see how long you spent on each question, so you can work on your pacing too."
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="Lessons"
        title="Short Lessons That Show You How"
        subtitle="Stuck on a skill? There's probably a lesson for it. Our library has more than 40 short SAT lessons, each one focused on a single skill or strategy."
        features={[
          { icon: icons.book, title: 'Learn by doing', desc: 'Each lesson walks you through a skill step by step, with quick questions along the way to make sure it’s clicking.' },
          { icon: icons.check, title: 'Hints and feedback as you go', desc: 'Get a hint when you’re stuck and a clear explanation after every answer.' },
          { icon: icons.graph, title: 'Desmos tips built in', desc: 'Some math lessons show you how to use the Desmos calculator to solve questions faster.' },
          { icon: icons.play, title: 'Practice right after', desc: 'When you finish a lesson, start a short set of practice questions on that same skill with one click.' },
        ]}
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="ACT"
        title="Taking the ACT? You're Covered Too"
        subtitle="Switch between SAT and ACT whenever you like. Your practice, tests, and progress follow the test you choose."
        features={[
          { icon: icons.grid, title: 'All four sections', desc: 'Practice English, Math, Reading, and Science questions, sorted by topic.' },
          { icon: icons.stack, title: 'Full-length practice tests', desc: 'Take timed ACT practice tests one section at a time, in the classic format or the new 2025 format.' },
          { icon: icons.report, title: 'Detailed score reports', desc: 'See your composite and section scores, how you did in each topic, and every question you missed.' },
          { icon: icons.clock, title: 'Extended time, if you get it', desc: 'Set your extra time once and every timed SAT or ACT practice test will use it.' },
        ]}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/student-dashboard-2.png"
        alt="Practice history"
        title="Watch Your Progress Add Up"
        description="Every practice session and test is saved, so you can watch your scores climb over time. Look back at what you practiced, how you did, and what you focused on. It's an easy way to stay on track."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/review-hub.png"
        alt="The Review area: weak questions drill, Error Log, and Flashcards"
        title="Turn Your Mistakes Into Mastery"
        description="The Review area helps you learn from what you got wrong. The weak questions drill brings back the questions that gave you the most trouble, starting with recent misses and harder questions. It's the same kind of review a good tutor does with you before test day. Use the Error Log to write down why you missed a question and how you'll avoid it next time. And flashcards let you save anything worth remembering, from formulas to tricky ideas, not just vocabulary."
      />
    ),
  },
  {
    content: (
      <SlideFeatureRundown
        title="Everything You Get"
        subtitle="Here's everything that comes with a Studyworks student account."
        sections={[
          {
            label: 'Practice',
            items: [
              { title: 'SAT question bank', desc: 'Thousands of questions. Pick your topic and difficulty.' },
              { title: 'ACT question bank', desc: 'English, Math, Reading, and Science, sorted by topic.' },
              { title: 'Worked solutions', desc: 'Every SAT question comes with a step-by-step explanation.' },
              { title: 'Mark for Review', desc: 'Flag any question to come back to later.' },
            ],
          },
          {
            label: 'Lessons',
            items: [
              { title: 'Lesson library', desc: 'More than 40 short SAT lessons, one skill or strategy each.' },
              { title: 'Practice after each lesson', desc: 'A quick set of questions on the skill you just learned.' },
            ],
          },
          {
            label: 'Practice Tests',
            items: [
              { title: 'Full-length Digital SAT tests', desc: 'Timed and adaptive, just like test day.' },
              { title: 'Full-length ACT tests', desc: 'All four sections, timed, in the classic or 2025 format.' },
              { title: 'Detailed score reports', desc: 'Section scores plus how you did on every skill.' },
              { title: 'Opportunity Index', desc: 'Your skills, ranked by how many points they could add.' },
              { title: 'Timing for every question', desc: 'See where you’re spending too long.' },
              { title: 'Extended time', desc: 'Set it once for every timed test.' },
              { title: 'Bluebook results upload', desc: 'Bring in your College Board scores for the same detailed report.' },
            ],
          },
          {
            label: 'Review',
            items: [
              { title: 'Weak questions drill', desc: 'Go back over the questions that gave you the most trouble.' },
              { title: 'Error Log', desc: 'Write down why you missed a question and how to avoid it next time.' },
              { title: 'Flashcards', desc: 'Save any idea, term, or formula worth remembering.' },
              { title: 'Common SAT Words', desc: '10 vocabulary sets, ready to study.' },
            ],
          },
          {
            label: 'Progress',
            items: [
              { title: 'Mastery for every skill', desc: 'A truer picture of your progress than accuracy alone.' },
              { title: 'Practice history', desc: 'Every session and test, charted over time.' },
            ],
          },
          {
            label: 'Tools',
            items: [
              { title: 'Desmos calculator', desc: 'The same calculator you’ll use on test day.' },
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
        price="$12.99"
        period="per month"
        items={[
          'SAT and ACT question banks',
          'Full-length SAT and ACT practice tests',
          'More than 40 short lessons',
          'Score reports with the Opportunity Index',
          'Mastery tracking for every skill',
          'Review drills, Error Log & Flashcards',
        ]}
        note={{
          title: 'Working with a Studyworks Prep tutor?',
          text: <>Students enrolled with <a href="https://www.studyworksprep.com" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: '#166534' }}>Studyworks Prep</a> get full platform access at no additional cost.</>,
        }}
      />
    ),
  },
];

export default function StudentsFeaturePage() {
  return <FeatureSlideshow slides={slides} />;
}
