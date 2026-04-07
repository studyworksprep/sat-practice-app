'use client';

import FeatureSlideshow, { SlideHero, SlideFeatures, SlideScreenshot, SlidePricing, SlideContact } from '../../../components/FeatureSlideshow';

const I = (d) => <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d={d}/></svg>;
const PURPLE = '#7c3aed';
const GREEN = '#059669';
const AMBER = '#d97706';

const slides = [
  {
    content: (
      <SlideHero
        title={<>The SAT Platform Built<br/>for Serious Tutors</>}
        subtitle="Real-time visibility into every student's preparation. Tools that let you assign, track, and analyze with the precision your students deserve."
        ctaHref="/"
        ctaText="Get Started"
        altHref="/features/students"
        altText="For students"
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="Student Management"
        title="See Every Student at a Glance"
        features={[
          { icon: I('M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z'), title: 'Live Student Roster', desc: 'Activity, accuracy trends, test scores, and attention alerts at a glance.' },
          { icon: I('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'), title: 'Deep Student Profiles', desc: 'Domain mastery, topic accuracy, test history, sessions, official scores, and assignments.' },
          { icon: I('M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z'), title: 'Custom Assignments', desc: 'Targeted question sets by topic and difficulty, with real-time completion tracking.' },
        ]}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-dashboard.png"
        alt="Teacher dashboard"
        title="Your Command Center"
        caption="Roster-wide performance metrics, assignments, and class-level grouping"
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-1.png"
        alt="Student practice record"
        title="Every Detail, One Click Away"
        caption="Complete record of all practice completed, with detailed performance statistics by domain and skill"
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="Testing & Scoring"
        title="Tests, Scores, and Reports"
        color={PURPLE}
        features={[
          { icon: I('M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'), title: 'Practice Test Management', desc: 'Assign adaptive tests. Score reports with domain breakdowns, Opportunity Index, and per-question timing.' },
          { icon: I('M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'), title: 'Bluebook Results Upload', desc: 'Import College Board Bluebook results for the same detailed reports as on-platform tests.' },
          { icon: I('M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z'), title: 'Official Score Tracking', desc: 'Record SAT and PSAT scores with all 8 domain bands. Measure real-world tutoring impact.' },
        ]}
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="Analytics & Tools"
        title="Insights That Drive Results"
        color={GREEN}
        features={[
          { icon: I('M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z'), title: 'Aggregate Dashboard', desc: 'Overall accuracy trends, score distributions, skill heatmaps, and hardest/easiest questions.' },
          { icon: I('M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z'), title: 'Concept Tags', desc: 'Tag questions by concept or skill. Auto-tagged practice tests (PT1, PT2, etc.).' },
          { icon: I('M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z'), title: 'Pre-loaded Desmos Solutions', desc: 'One-click graphing solutions on most math questions. Prep for sessions or show students the approach.' },
        ]}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-2.png"
        alt="Topic mastery"
        title="Weighted Mastery Analysis"
        caption="Weighted performance metrics identify true strengths and weaknesses across every topic"
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/teacher-student-detail-3.png"
        alt="Score patterns and actionable data"
        title="Actionable, Exportable Data"
        caption="Score pattern tracking, suggested review areas, and exportable data for family reports or integration with other platforms"
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="Your Own Training"
        title="Stay Sharp"
        color={AMBER}
        features={[
          { icon: I('M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3 1 9l11 6 9-4.91V17h2V9L12 3z'), title: 'Full Platform Access', desc: 'Take every test, answer every question. Your own data is tracked separately in your Training profile.' },
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
  {
    showCta: true,
    content: (
      <SlideContact
        title="Schools & Organizations"
        subtitle="Onboard an entire department, tutoring center, or school with customized plans, bulk pricing, dedicated onboarding, and manager accounts."
        email="contact@studyworksprep.com"
        subject="Studyworks Organization Plan Inquiry"
      />
    ),
  },
];

export default function TeachersFeaturePage() {
  return <FeatureSlideshow slides={slides} />;
}
