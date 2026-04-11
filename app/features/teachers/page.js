'use client';

import FeatureSlideshow, {
  SlideHero,
  SlideScreenshot,
  SlideFeatureRundown,
  SlidePricing,
} from '../../../components/FeatureSlideshow';

// New structure (Apr 2026): every content slide carries a screenshot,
// the second-to-last slide is a comprehensive feature rundown, and the
// last slide is pricing. Removed:
//   - the three icon-only "feature card" slides (Student Management,
//     Testing & Scoring, Analytics & Tools) — those features now live
//     in the rundown slide
//   - the Schools & Organizations contact slide — orgs contact us
//     directly without needing a guided slide
//
// Added:
//   - two reused student-deck screenshots (score-report-introview and
//     score-report-bestview) with tutor-framed copy, since detailed
//     score reports + the Opportunity Index are equally compelling
//     from a tutor's perspective
//   - the comprehensive feature rundown

const slides = [
  {
    content: ({ next }) => (
      <SlideHero
        title={<>The SAT Platform Built<br/>for Serious Tutors</>}
        subtitle="Real-time visibility into every student's preparation. Tools that let you assign, track, and analyze with the precision your students deserve. Use the arrows to explore."
        ctaText="See the Tools"
        onCtaClick="next"
        next={next}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-dashboard-1.png"
        alt="Teacher dashboard — roster overview"
        title="Your Command Center"
        description="See your entire roster at a glance: who's been active, who's improving, and who needs attention. Performance metrics are groupable by class, so you can compare cohorts and spot the trends that matter before they become problems."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-dashboard-2.png"
        alt="Teacher dashboard — assignments and activity"
        title="Assignments and Activity, Live"
        description="Scroll down on the same dashboard and you get real-time completion tracking for every active assignment, recent session activity across your whole roster, and a running tally of practice volume. No more chasing students down for updates — the data comes to you."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-1a.png"
        alt="Student detail — overview header"
        title="Every Student, Fully Visible"
        description="Click any student to open their profile. The header gives you their vitals at a glance: target score, most recent test, active assignments, and recent activity. Everything you need to walk into a session already knowing where to start."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-1b.png"
        alt="Student detail — practice record"
        title="The Complete Practice Record"
        description="Below the header, the full practice record: domain-by-domain accuracy with difficulty breakdowns, total questions attempted, recent accuracy trends, and practice test history. You'll know more about your student's SAT readiness than they do, and you'll have the data to prove it."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/score-report-introview.png"
        alt="Score report overview"
        title="The Same Score Reports Your Students See"
        description="When your student finishes a practice test, you and they get the exact same comprehensive report — scaled scores, domain breakdowns, skill-by-skill accuracy, difficulty-band analysis. No more re-explaining what a score means; you can both look at the same numbers and decide what to do about them together."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/score-report-bestview.png"
        alt="Opportunity Index and timing metrics"
        title="The Opportunity Index Drives Your Lesson Plans"
        description="The Opportunity Index combines how many questions a student missed in each skill with how learnable that skill is, then ranks them by potential score impact. It's the prioritized lesson plan you would have built anyway — except it updates after every test, and it factors in per-question timing so you know which weaknesses are about content and which are about pace."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-2a.png"
        alt="Topic mastery — domain overview"
        title="Weighted Mastery Analysis"
        description="Raw accuracy doesn't tell the full story. Our mastery algorithm weights each question by difficulty and score band, factors in practice volume and recency, and produces a true readiness score for every SAT domain — not just the percentage right."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-2b.png"
        alt="Topic mastery — per-skill drill-down"
        title="Pinpoint What to Work On"
        description="Drill deeper and every domain expands into a per-skill breakdown. You'll see exactly which skills are pulling the mastery score down, confidently tell a student they've nailed linear equations but need more work on systems, and make every session's focus decision backed by data instead of guesswork."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-3.png"
        alt="Score patterns and actionable data"
        title="Actionable, Exportable Data"
        description="Track score patterns over time and see exactly which areas are improving and which are plateauing. The system suggests review areas based on where students have the most room to grow. All data is exportable, making it easy to create detailed progress reports for families or incorporate student performance data into other platforms you already use."
      />
    ),
  },
  {
    content: (
      <SlideFeatureRundown
        title="Every Tool Studyworks Gives Tutors"
        subtitle="A complete rundown of what's included with a Studyworks educator account."
        sections={[
          {
            label: 'Roster & Profiles',
            items: [
              { title: 'Live student roster', desc: 'Activity, accuracy, attention alerts at a glance.' },
              { title: 'Per-student profiles', desc: 'Domain mastery, test history, sessions, official scores, assignments.' },
              { title: 'Direct student assignment', desc: 'Match students to your roster individually or in bulk.' },
              { title: 'Class-based grouping', desc: 'Compare cohorts and tag students by class for reporting.' },
            ],
          },
          {
            label: 'Assignments',
            items: [
              { title: 'Custom question sets', desc: 'Targeted assignments by topic and difficulty.' },
              { title: 'Real-time completion tracking', desc: 'See exactly who has done what, as it happens.' },
              { title: 'Lesson assignments', desc: 'Pair video lessons with practice from one screen.' },
            ],
          },
          {
            label: 'Testing & Scoring',
            items: [
              { title: 'Practice test management', desc: 'Assign adaptive Digital SAT tests on demand.' },
              { title: 'Comprehensive score reports', desc: 'Scaled scores plus domain and skill breakdowns.' },
              { title: 'Opportunity Index', desc: 'Prioritized improvement list per student.' },
              { title: 'Per-question timing metrics', desc: 'Pace and content weakness, separated.' },
              { title: 'Bluebook results upload', desc: 'Import College Board scores for the same detailed reports.' },
              { title: 'Official SAT/PSAT tracking', desc: 'Record real-world scores with all 8 domain bands.' },
            ],
          },
          {
            label: 'Analytics & Insights',
            items: [
              { title: 'Aggregate dashboard', desc: 'Accuracy trends, score distributions, hardest/easiest questions.' },
              { title: 'Skill heatmaps', desc: 'Spot patterns across your whole roster at once.' },
              { title: 'Weighted domain & skill mastery', desc: 'Difficulty-aware readiness, not raw percentage.' },
              { title: 'Concept tags', desc: 'Tag and browse questions by concept across the bank.' },
              { title: 'Wrong-answer trap tags', desc: 'Label specific trap types on each wrong answer choice.' },
            ],
          },
          {
            label: 'Tools & Workflow',
            items: [
              { title: 'Pre-loaded Desmos solutions', desc: 'One-click graphing solutions on most math questions.' },
              { title: 'Per-question notes', desc: 'Leave notes on any question for yourself or your students.' },
              { title: 'Error log review', desc: 'See exactly what each student got wrong and why.' },
              { title: 'Exportable CSV reports', desc: 'Pipe Studyworks data into the rest of your stack.' },
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
        price="$29.99"
        period="per month"
        items={[
          'Unlimited students',
          'Full question bank & practice tests',
          'Assignments & score tracking',
          'Performance analytics & reports',
          'Bluebook upload & timing metrics',
          'Concept tags & Desmos solutions',
          'Session notes & exportable data',
        ]}
        note={{
          title: 'Studyworks Prep educators',
          text: <>Teachers with <a href="https://www.studyworksprep.com" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: '#2563eb' }}>Studyworks Prep</a> get full access at no cost, along with all their students.</>,
          bg: 'rgba(79,124,224,0.06)',
          border: 'rgba(79,124,224,0.2)',
          titleColor: '#2563eb',
          textColor: '#64748b',
        }}
      />
    ),
  },
];

export default function TeachersFeaturePage() {
  return <FeatureSlideshow slides={slides} />;
}
