'use client';

import FeatureSlideshow, {
  SlideHero,
  SlideScreenshot,
  SlideFeatureRundown,
  SlidePricing,
} from '../../../components/FeatureSlideshow';

// New structure (Apr 2026): every content slide carries a screenshot,
// the second-to-last slide is a comprehensive feature rundown, and the
// last slide is pricing. The previous "Schools & Organizations" contact
// slide and the icon-only feature card slides are removed — orgs
// contact us directly without needing a guided slide, and a slide
// without a screenshot felt thin compared to the rest of the deck.

const slides = [
  {
    content: ({ next }) => (
      <SlideHero
        title={<>SAT Practice That Actually<br/>Moves Your Score</>}
        subtitle="Studyworks combines a massive question bank, adaptive practice tests, and detailed analytics to help you practice smarter and score higher. Use the arrows to see how it works."
        ctaText="See What's Inside"
        onCtaClick="next"
        next={next}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/student-dashboard-1.png"
        alt="Focus areas and accuracy"
        title="Know Your Strengths and Weaknesses"
        description="Your dashboard breaks down accuracy by every SAT domain and skill, so you always know exactly where you stand. Color-coded mastery indicators make it easy to spot weak areas at a glance, and the system automatically identifies which topics will have the biggest impact on your score if you improve them."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/score-report-introview.png"
        alt="Score report overview"
        title="Detailed Score Reports"
        description="After every practice test, you get a full score report that goes far beyond a single number. See your scaled scores, then dive into domain-by-domain and skill-by-skill breakdowns with difficulty-level analysis. Understand not just what you got wrong, but which difficulty bands are hurting your score the most."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/score-report-bestview.png"
        alt="Opportunity Index and advanced metrics"
        title="Metrics You Won't Find Anywhere Else"
        description="The Opportunity Index is your secret weapon. It combines how many questions you missed in each skill with how learnable that skill is, then ranks them by potential score impact. The result: a prioritized list of exactly what to study next. You also get per-question timing data so you can see where you're spending too long and learn to pace yourself like test day."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/student-dashboard-2.png"
        alt="Practice history"
        title="Track Your Progress Over Time"
        description="Every practice session and practice test is recorded and visualized. Watch your scores trend upward as you put in the work. Review past sessions to see what you practiced, how accurate you were, and which domains you focused on. It's the accountability and motivation you need to stay consistent."
      />
    ),
  },
  {
    content: (
      <SlideFeatureRundown
        title="Everything You Get"
        subtitle="A complete rundown of what's included with a Studyworks student account."
        sections={[
          {
            label: 'Practice',
            items: [
              { title: 'Targeted question bank', desc: 'Filter by topic, difficulty, and score band.' },
              { title: 'Detailed explanations', desc: 'Every question has a worked solution.' },
              { title: 'Smart Review queue', desc: 'Surfaces the questions you should revisit, weighted by recency and learnability.' },
              { title: 'Mark for Review', desc: 'Flag any question to come back to it later.' },
              { title: 'Error Log', desc: 'Every mistake is tracked automatically with notes you can add.' },
              { title: 'Concept tags', desc: 'Browse questions by concept across the entire bank.' },
            ],
          },
          {
            label: 'Practice Tests',
            items: [
              { title: 'Full-length adaptive Digital SAT tests', desc: 'Timed multi-module simulation that adapts to you.' },
              { title: 'Comprehensive score reports', desc: 'Scaled scores plus domain and skill breakdowns.' },
              { title: 'Per-question timing metrics', desc: 'See where you\u2019re spending too long.' },
              { title: 'Opportunity Index', desc: 'Prioritized list of what to study next.' },
              { title: 'Bluebook results upload', desc: 'Import your College Board scores for the same detailed reports.' },
            ],
          },
          {
            label: 'Tools',
            items: [
              { title: 'Integrated Desmos calculator', desc: 'The same calculator you\u2019ll use on test day.' },
              { title: 'Vocabulary flashcards', desc: 'Build your own decks for terms you keep missing.' },
              { title: 'Common SAT Words', desc: '10 curated vocabulary sets, ready to study.' },
            ],
          },
          {
            label: 'Progress',
            items: [
              { title: 'Domain & skill mastery dashboard', desc: 'Color-coded readiness for every SAT topic.' },
              { title: 'Practice history visualization', desc: 'Every session and test, charted over time.' },
              { title: 'Score trend lines', desc: 'Watch your scores climb as you put in the work.' },
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
          'Full question bank with explanations',
          'Unlimited adaptive practice tests',
          'Score reports with Opportunity Index',
          'Performance tracking & smart review',
          'Detailed timing analytics',
          'Error log & vocabulary flashcards',
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
