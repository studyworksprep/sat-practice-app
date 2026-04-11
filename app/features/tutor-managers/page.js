'use client';

import FeatureSlideshow, { SlideHero, SlideFeatures, SlideScreenshot, SlidePricing, SlideContact } from '../../../components/FeatureSlideshow';

const I = (d) => <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d={d}/></svg>;
const TEAL = '#0d9488';
const INDIGO = '#4f46e5';
const AMBER = '#d97706';

// Slide deck for the "Tutor Manager" persona — operators who oversee
// a team of tutors and need visibility + accountability across
// multiple classrooms at once. Mirrors the shape of
// /features/students and /features/teachers.
//
// Screenshots referenced here don't exist yet; the SlideScreenshot
// component hides itself gracefully via onError when the src is
// missing, so the deck still renders cleanly with the text panels
// until you drop PNGs into public/screenshots/. See the README note
// below the slides array for the shot list.

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
      <SlideFeatures
        label="Team Oversight"
        title="Every Tutor, One Dashboard"
        color={TEAL}
        features={[
          { icon: I('M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z'), title: 'Live Tutor Roster', desc: 'See every tutor on your staff with their assigned student count, recent activity, and team-wide accuracy at a glance.' },
          { icon: I('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z'), title: 'Tutor Assignment', desc: 'Assign students to tutors individually or in bulk. Re-assign when your team grows or schedules change, all from one screen.' },
          { icon: I('M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z'), title: 'Team Performance Metrics', desc: 'Compare tutors by student outcomes: average score improvements, session volume, and assignment completion rates.' },
        ]}
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
        src="/screenshots/manager-tutor-assignments.png"
        alt="Tutor-student assignment screen"
        title="Assign Students With One Click"
        description="Drag students between tutors, bulk-reassign an entire roster when a tutor leaves, or pair new students with the right tutor based on subject strengths. Assignment changes propagate immediately — the tutor sees their updated roster on next page load."
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="Training & Quality"
        title="Keep Your Tutors Sharp"
        color={INDIGO}
        features={[
          { icon: I('M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3 1 9l11 6 9-4.91V17h2V9L12 3z'), title: 'Tutor Training Profiles', desc: 'Every tutor gets their own training account. They can take practice tests, work through question sets, and build familiarity with the material without mingling with student data.' },
          { icon: I('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-6h2v6zm0-8h-2V7h2v4z'), title: 'Practice Session Audit', desc: 'See which tutors are staying current with the question bank, which are falling behind, and which are passing best practices along to their students.' },
          { icon: I('M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'), title: 'Concept-Tag Review', desc: 'Spot-check the concept tags and error-type tags your tutors apply to wrong answers. Ensure the whole team is using the same vocabulary to describe student mistakes.' },
        ]}
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
      <SlideFeatures
        label="Reporting"
        title="Roll-Up Reports for Your Organization"
        color={AMBER}
        features={[
          { icon: I('M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z'), title: 'Cohort Score Trends', desc: 'Track average score movement across every tutor\'s student group. See which cohorts are accelerating and which are plateauing.' },
          { icon: I('M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'), title: 'Exportable CSV Reports', desc: 'Export team-wide rosters, session logs, and score histories for parent reports, administrative review, or plug-in to your existing business tools.' },
          { icon: I('M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z'), title: 'Opportunity Index by Team', desc: 'Which SAT domains are your students collectively struggling with? The Opportunity Index rolls up to the team level so you can shape group training sessions around real data.' },
        ]}
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
    showCta: true,
    content: (
      <SlideContact
        title="Manager Access Starts at the Organization Level"
        subtitle="Tutor-manager accounts are configured at the organization tier. Tell us about your team — how many tutors, how many students, what subjects — and we'll set you up with the right plan, dedicated onboarding, and training for your staff."
        email="contact@studyworksprep.com"
        subject="Studyworks Tutor Manager Inquiry"
      />
    ),
  },
];

export default function TutorManagersFeaturePage() {
  return <FeatureSlideshow slides={slides} />;
}
