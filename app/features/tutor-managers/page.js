'use client';

import FeatureSlideshow, {
  SlideHero,
  SlideScreenshot,
  SlideFeatureRundown,
  SlidePricing,
} from '../../../components/FeatureSlideshow';

// Slide deck for the "Tutor Manager" persona — operators who oversee
// a team of tutors and need visibility + accountability across
// multiple classrooms at once. Mirrors the shape of
// /features/students and /features/teachers as of Apr 2026:
// every content slide carries a screenshot, the second-to-last slide
// is a comprehensive feature rundown, the last slide is pricing.
//
// Removed:
//   - the three icon-only "feature card" slides — those features now
//     live in the rundown slide
//   - the "Manager Access Starts at the Organization Level" contact
//     slide — orgs contact us directly without needing a guided slide
//
// Added:
//   - two reused teacher-deck screenshots (teacher-dashboard-1 and
//     teacher-student-detail-2a) with manager-framed copy, since the
//     manager pitch should make clear that managers get the full
//     teacher feature set on top of the manager-only views
//   - the comprehensive feature rundown
//   - a pricing slide (the deck previously ended on the contact slide
//     and had no pricing at all)
//
// The three manager-only screenshot URLs (manager-team-roster,
// manager-tutor-activity, manager-cohort-reports) point at PNGs that
// can be captured from the demo routes under
// /features/tutor-managers/demo/{team-roster,tutor-activity,cohort-reports}
// — which render the live templates with hypothetical data for a
// 15-tutor / 100-student firm so the screenshots don't leak real
// student names. SlideScreenshot's onError fallback hides the image
// gracefully if the file isn't there yet.

const slides = [
  {
    content: ({ next }) => (
      <SlideHero
        title={<>Oversee Your Whole<br/>Tutoring Team</>}
        subtitle="Studyworks gives tutor managers real-time visibility into every teacher on your staff and every student they serve. Assign tutors, track their impact, and keep your whole operation on-mission. Use the arrows to explore the tools."
        ctaText="See the Manager Tools"
        onCtaClick="next"
        next={next}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/manager-team-roster.png"
        alt="Manager team roster view"
        title="Your Entire Team at a Glance"
        description="The manager dashboard shows every tutor on your staff in one place: how many students each one is working with, how active they've been this week, and how their students are trending on practice tests. Spot the tutors who are thriving and the ones who need support before it becomes a problem."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/manager-tutor-activity.png"
        alt="Tutor training activity log"
        title="Who's Practicing and Who's Coasting"
        description="The tutor activity log tracks every practice session your tutors complete, every question they review, and every training test they score. Use it to recognize tutors who are investing in their craft — and to identify the ones who need a check-in. Exportable for performance reviews."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/manager-cohort-reports.png"
        alt="Cohort reporting dashboard"
        title="Measure Your Impact, Not Just Activity"
        description="Activity metrics are easy; outcomes are hard. The cohort reporting view converts raw session counts into actionable performance metrics — average score growth per student per week, time-to-proficiency on specific skills, and side-by-side tutor comparisons. This is the data you bring to stakeholders, schools, and your own planning sessions."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-dashboard-1.png"
        alt="Teacher dashboard — what your tutors see"
        title="What Each of Your Tutors Sees"
        description="Every tutor on your team gets the same command-center dashboard for their own student roster. As a manager, you can step into any tutor's view to see exactly the information they're acting on, audit their decisions, or drop in to help them prep for an upcoming session. There's no separate manager-only data layer — you're working off the same source of truth your team is."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-2a.png"
        alt="Mastery analysis — what tutors recommend from"
        title="Trust the Numbers Behind Every Recommendation"
        description="When a tutor on your team recommends a study focus, they're not guessing — they're working from this weighted mastery analysis. Difficulty- and recency-weighted readiness scores per domain and per skill, the same view across your whole team. You can verify any recommendation, audit any tutor's reasoning, and standardize how your team talks about student progress."
      />
    ),
  },
  {
    content: (
      <SlideFeatureRundown
        title="Every Tool Studyworks Gives Tutor Managers"
        subtitle="A complete rundown of what's included with a Studyworks manager account."
        sections={[
          {
            label: 'Team Oversight',
            items: [
              { title: 'Live tutor roster', desc: 'Every tutor with their assigned student count, recent activity, and team-wide accuracy.' },
              { title: 'Direct tutor assignment', desc: 'Pair students with tutors from your manager dashboard.' },
              { title: 'Team performance metrics', desc: 'Compare tutors by student outcomes and engagement.' },
              { title: 'Per-tutor engagement tracking', desc: 'See who\u2019s active, who\u2019s coasting, and who needs a check-in.' },
            ],
          },
          {
            label: 'Training & Quality',
            items: [
              { title: 'Tutor training profiles', desc: 'Each tutor practices and trains in a separate profile from their student data.' },
              { title: 'Practice session audit', desc: 'See which tutors are staying current with the question bank.' },
              { title: 'Concept-tag review', desc: 'Spot-check the tags your tutors apply to questions and wrong answers.' },
              { title: 'Score audit by tutor', desc: 'Review every score report your tutors are working from.' },
            ],
          },
          {
            label: 'Reporting',
            items: [
              { title: 'Cohort score trends', desc: 'Average score movement across every tutor\u2019s student group.' },
              { title: 'Exportable CSV reports', desc: 'Pipe team-wide rosters and outcomes into your existing tools.' },
              { title: 'Opportunity Index by team', desc: 'Aggregate skill gaps to shape group training sessions.' },
              { title: 'Per-tutor outcome analysis', desc: 'Side-by-side tutor comparisons by score growth, not session count.' },
            ],
          },
          {
            label: 'Plus Everything Tutors Get',
            items: [
              { title: 'Full teacher feature set', desc: 'Every roster, assignment, score-report, and analytics tool tutors use.' },
              { title: 'All student-facing tools', desc: 'Question bank, adaptive practice tests, Desmos, vocabulary, error log.' },
              { title: 'Drop into any tutor\u2019s view', desc: 'See exactly what your team sees when they sit down to plan a session.' },
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
        period="per tutor / month"
        items={[
          'Everything in the Educator plan, per tutor',
          'Manager dashboard with team roster',
          'Tutor assignment and reassignment',
          'Tutor training audit log',
          'Cohort score-trend reporting',
          'Exportable CSV reports across your whole team',
          'Drop-in access to any tutor\u2019s view',
        ]}
        note={{
          title: 'Studyworks Prep partner organizations',
          text: <>Tutoring firms partnered with <a href="https://www.studyworksprep.com" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: '#0d9488' }}>Studyworks Prep</a> get manager access included for the whole staff. Reach out to set up an org account.</>,
          bg: 'rgba(13,148,136,0.06)',
          border: 'rgba(13,148,136,0.25)',
          titleColor: '#0f766e',
          textColor: '#0f766e',
        }}
      />
    ),
  },
];

export default function TutorManagersFeaturePage() {
  return <FeatureSlideshow slides={slides} />;
}
