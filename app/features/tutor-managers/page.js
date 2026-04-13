'use client';

import FeatureSlideshow, {
  SlideHero,
  SlideScreenshot,
  SlideFeatureRundown,
  SlideTieredPricing,
} from '../../../components/FeatureSlideshow';

// Slide deck for the "Tutor Manager" persona.
//
// The framing: managers are running a tutoring firm's training
// operation. New tutors come in knowing some content but not the
// firm's methodology or the specific SAT material they'll be
// teaching. Studyworks is the structured curriculum for that
// training — real practice questions, real tests, the same reports
// the tutors will eventually hand to students. Managers assign the
// content, review the hard questions with their trainees, and track
// each tutor's readiness by watching how they handle the material
// themselves before they walk into a session with a student.
//
// This is explicitly NOT a self-directed-development pitch. It's a
// managed training pipeline framing. Reviewed Apr 2026.
//
// Screenshot filenames in /public/screenshots that back this deck:
//   manager-team-roster.png     — team dashboard (all tutors + stats)
//   manager-tutor-activity.png  — one tutor's training profile
//   manager-roster-reports.png  — student performance by tutor
//   teacher-dashboard-1.png     — reused; what tutors see per student
//   teacher-student-detail-2a.png — reused; weighted mastery view
//
// The three manager-only screenshots can be captured from the demo
// routes under /features/tutor-managers/demo/{team-roster,tutor-activity,
// cohort-reports} — the demo pages render the live templates with
// hypothetical data for a 15-tutor / 100-student firm so the
// screenshots don't leak real student names.

const slides = [
  {
    content: ({ next }) => (
      <SlideHero
        title={<>Train Your Tutors on the<br/>Real SAT Content They&rsquo;ll Teach</>}
        subtitle="Studyworks gives tutor managers a structured way to onboard and develop new tutors: assign the real practice questions and tests they'll work from, review the hard ones together, and track each tutor's readiness to handle the material before they sit down with a student. Use the arrows to explore."
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
        alt="Manager team dashboard"
        title="Every Tutor&rsquo;s Training at a Glance"
        description="The manager dashboard shows every tutor on your staff in one place — their training progress, accuracy across SAT domains, and volume through the practice material you've assigned. One view tells you who's ready for their first student, who's still working through the bank, and who needs more coaching before they're in front of anyone."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/manager-tutor-activity.png"
        alt="Individual tutor training profile"
        title="Coach Each Tutor Where It Counts"
        description="Open any tutor's training profile and see their complete practice record: domain-by-domain accuracy, difficulty trends, recent session history, and every practice test they've taken. Spot the topic a tutor is weakest on, assign targeted practice on the exact questions that will stretch them, and come to your next one-on-one ready to review the hard ones together."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/manager-roster-reports.png"
        alt="Roster reports — student outcomes by tutor"
        title="The Same Reports Your Tutors Will Hand to Students"
        description="This is the reporting layer your tutors will use in every student session — scaled scores, domain breakdowns, prioritized improvement plans. By training new staff on these reports with real questions and real scores, they graduate from onboarding already fluent in the tools and vocabulary they'll use every day. The training and the day job run on the same screens."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-dashboard-1.png"
        alt="Teacher dashboard — what tutors see with students"
        title="What Your Tutors Will See Every Day"
        description="Once a tutor graduates from training, this is the command center they run their student roster from — the same dashboard they've already been living inside during onboarding. As a manager, you can step into any tutor's view to see exactly what they're working with, help a new hire read their first real roster, or walk a struggling tutor through their own data. No separate manager-only layer, just shared ground truth."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-2a.png"
        alt="Mastery analysis — the methodology your team teaches"
        title="One Mastery Framework, Taught to Your Whole Team"
        description="The weighted mastery view is how your tutors will decide what to work on with each student — difficulty- and recency-aware readiness scores per domain and per skill. Teaching new hires to read this view, on real questions and real data, is how you make sure every tutor on your team uses the same language and the same decision framework. Your methodology becomes repeatable."
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
            label: 'Assign & Train',
            items: [
              { title: 'Assign practice questions', desc: 'Push targeted question sets to any tutor from your manager dashboard.' },
              { title: 'Assign full-length practice tests', desc: 'Have new tutors sit the exact tests their students will take.' },
              { title: 'Tutor training profiles', desc: 'Each tutor practices in their own profile, cleanly separated from student data.' },
              { title: 'Review the hard questions', desc: 'Flag any question in the bank for a training session walkthrough.' },
            ],
          },
          {
            label: 'Track Strengths & Weaknesses',
            items: [
              { title: 'Per-tutor domain mastery', desc: 'Weighted readiness per SAT domain and skill, the same view your tutors will use on students.' },
              { title: 'Practice test score history', desc: 'Every training test a tutor has taken, charted over time.' },
              { title: 'Recent practice sessions', desc: 'Day-by-day activity log — volume, accuracy, topic focus.' },
              { title: 'Opportunity Index per tutor', desc: 'Prioritized list of what each tutor should work on next.' },
            ],
          },
          {
            label: 'Team Oversight',
            items: [
              { title: 'Live tutor roster', desc: 'Every tutor with their training progress and team-wide accuracy.' },
              { title: 'Direct tutor-student assignment', desc: 'Pair students with tutors once they\u2019re ready for the field.' },
              { title: 'Drop into any tutor\u2019s view', desc: 'See exactly what your team sees when they sit down to plan a session.' },
              { title: 'Team-wide reporting', desc: 'Roll-up views of training progress, scores, and student outcomes.' },
            ],
          },
          {
            label: 'Plus Everything Tutors Get',
            items: [
              { title: 'Full teacher feature set', desc: 'Every roster, assignment, score-report, and analytics tool tutors use.' },
              { title: 'All student-facing tools', desc: 'Question bank, adaptive practice tests, Desmos, vocabulary, error log.' },
              { title: 'Concept tags and wrong-answer tags', desc: 'Standardize how your whole team names mistakes and trap answers.' },
            ],
          },
        ]}
      />
    ),
  },
  {
    showCta: true,
    content: (
      <SlideTieredPricing
        title="Team Pricing That Scales With You"
        subtitle="Per-tutor pricing that drops as your team grows. Every tier unlocks the full manager toolkit and the full educator toolkit for every tutor on your staff."
        tiers={[
          {
            name: 'Solo',
            range: '1 tutor',
            price: '$29.99',
            period: 'per tutor / month',
          },
          {
            name: 'Team',
            range: '2\u201310 tutors',
            price: '$24.99',
            period: 'per tutor / month',
            savings: 'Save 17%',
            highlight: true,
          },
          {
            name: 'Firm',
            range: '11+ tutors',
            price: '$19.99',
            period: 'per tutor / month',
            savings: 'Save 33%',
          },
        ]}
        items={[
          'Full educator toolkit for every tutor',
          'Manager dashboard & team training roster',
          'Assign practice questions and tests to tutors',
          'Per-tutor mastery and practice test tracking',
          'Student\u2013tutor assignment and reassignment',
          'Team-wide reporting and exportable CSVs',
          'Drop-in access to any tutor\u2019s student view',
          'All student-facing practice tools',
        ]}
        note={{
          title: 'Running a larger organization?',
          text: <>Tutoring firms with 30+ tutors, school districts, and partners of <a href="https://www.studyworksprep.com" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: '#0f766e' }}>Studyworks Prep</a> get custom pricing and onboarding. Reach out to set up an org account.</>,
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
