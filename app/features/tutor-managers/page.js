'use client';

import FeatureSlideshow, {
  SlideHero,
  SlideScreenshot,
  SlideFeatures,
  SlideFeatureRundown,
  SlideTieredPricing,
} from '@/components/FeatureSlideshow';
import { SlideResults } from '@/components/SlideResults';
import { icons } from '@/components/MarketingIcons';
import { satResults } from '@/lib/marketing/results';

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
// Nov 2026: a results slide (SlideResults, figures from
// lib/marketing/results.ts) follows the hero. It shows what the
// method produced for Studyworks Prep's own students; the copy stays
// careful not to promise those numbers to another firm's students.
//
// Nov 2026 copy pass: plain, friendly language. Tutor training itself
// is SAT-only (training pages filter test_type = 'sat'), so the hero
// keeps "SAT"; ACT and Lessons appear as part of what tutors get for
// their students. The mastery slide is icon cards now: its old
// screenshot (teacher-student-detail-2a) showed accuracy, not mastery.
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
        subtitle="Studyworks gives you a simple, structured way to train new tutors. Assign the real practice questions and tests they'll teach from, go over the hard ones together, and see when each tutor is ready for their first student. Use the arrows to explore."
        ctaText="See the Manager Tools"
        onCtaClick="next"
        next={next}
      />
    ),
  },
  {
    content: (
      <SlideResults
        title="The Method Behind the Training"
        subtitle={`Studyworks Prep tutors work with their own students using the questions, reports, and mastery views your tutors will train on. Here's how ${satResults.students} of those students' SAT scores changed.`}
        points={[
          <>Gains came in both sections: a typical <strong>+{satResults.medianMathGain}</strong> in Math and <strong>+{satResults.medianReadingWritingGain}</strong> in Reading &amp; Writing.</>,
          'Training your team on the same tools means every tutor reads a score report and picks what to work on next the same way.',
        ]}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/manager-team-roster.png"
        alt="Manager team dashboard"
        title="Every Tutor&rsquo;s Training at a Glance"
        description="The manager dashboard shows every tutor on your team in one place: how far along they are in training, how they're doing in each area of the SAT, and how much of the assigned practice they've done. At a glance, you'll see who's ready for their first student, who's still working through the material, and who needs more coaching."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/manager-tutor-activity.png"
        alt="Individual tutor training profile"
        title="Coach Each Tutor Where It Counts"
        description="Open any tutor's training profile to see their full practice record: how they're doing in each area and at each difficulty level, their recent practice, and every test they've taken. Find the topic they're weakest on, assign practice that will stretch them, and come to your next one-on-one ready to go over the hard questions together."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/manager-roster-reports.png"
        alt="Roster reports: student results by tutor"
        title="The Same Reports Your Tutors Will Share With Students"
        description="These are the reports your tutors will use in every session: section scores, results for each area, and a ranked list of what to work on next. When new tutors train on these reports with real questions and real scores, they finish onboarding already comfortable with the tools they'll use every day."
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-dashboard-1.png"
        alt="Tutor dashboard: what tutors see for their students"
        title="What Your Tutors Will See Every Day"
        description="Once tutors finish training, this is where they'll manage their students, on the same dashboard they used during onboarding. You can open any tutor's view to see exactly what they see, help a new hire make sense of their first roster, or walk a struggling tutor through their own data."
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="Mastery"
        title="One Measure of Progress for Your Whole Team"
        subtitle="Mastery tells your tutors whether a student really knows a skill, not just how many questions they got right. When every tutor reads it the same way, your methods carry over from one tutor to the next."
        features={[
          { icon: icons.weight, title: 'Harder questions count more', desc: 'A right answer on a hard question counts for more than one on an easy question.' },
          { icon: icons.stack, title: 'Enough practice to be sure', desc: 'A skill isn’t marked mastered until there are enough answers to show it.' },
          { icon: icons.hint, title: 'Hints count for half', desc: 'Answers reached with a hint get partial credit.' },
          { icon: icons.trendDown, title: 'Slipping skills get flagged', desc: 'When a nearly mastered skill starts to slide, your tutors see it right away.' },
        ]}
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
              { title: 'Assign practice questions', desc: 'Send targeted question sets to any tutor from your dashboard.' },
              { title: 'Assign full-length practice tests', desc: 'Have new tutors take the same tests their students will take.' },
              { title: 'Tutor training profiles', desc: 'Each tutor practices in their own profile, kept separate from student data.' },
              { title: 'Review the hard questions', desc: 'Flag any question to go over in a training session.' },
            ],
          },
          {
            label: 'Track Strengths & Weaknesses',
            items: [
              { title: 'Mastery for each tutor', desc: 'By SAT area and skill, the same view your tutors will use with students.' },
              { title: 'Practice test score history', desc: 'Every training test a tutor has taken, charted over time.' },
              { title: 'Recent practice', desc: 'Day-by-day activity: how much, how accurate, and which topics.' },
              { title: 'Opportunity Index for each tutor', desc: 'A ranked list of what each tutor should work on next.' },
            ],
          },
          {
            label: 'Team Oversight',
            items: [
              { title: 'Live tutor roster', desc: 'Every tutor’s training progress and accuracy in one list.' },
              { title: 'Match students with tutors', desc: 'Assign students to tutors once they’re ready.' },
              { title: 'See any tutor’s view', desc: 'See exactly what your team sees when they plan a session.' },
              { title: 'Reports across your team', desc: 'Training progress, scores, and student results in one place.' },
            ],
          },
          {
            label: 'Plus Everything Tutors Get',
            items: [
              { title: 'The full tutor toolkit', desc: 'Every roster, assignment, score report, and progress tool your tutors use.' },
              { title: 'Every student tool', desc: 'SAT and ACT practice and full-length tests, 40+ lessons, Desmos, vocabulary, and the Error Log.' },
              { title: 'Concept and wrong-answer tags', desc: 'Help your whole team name mistakes and trap answers the same way.' },
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
            range: '2–10 tutors',
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
          'Student–tutor assignment and reassignment',
          'Team-wide reporting and exportable CSVs',
          'Access to any tutor’s student view',
          'Every student tool, including ACT practice and lessons',
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
