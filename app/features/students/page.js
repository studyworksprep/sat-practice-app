'use client';

import FeatureSlideshow, { SlideHero, SlideFeatures, SlideScreenshot, SlidePricing, SlideContact } from '../../../components/FeatureSlideshow';

const I = (d) => <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d={d}/></svg>;

const slides = [
  {
    content: (
      <SlideHero
        title={<>SAT Practice That Actually<br/>Moves Your Score</>}
        subtitle="Studyworks combines a massive question bank, adaptive practice tests, and detailed analytics to help you practice smarter and score higher."
        ctaHref="/"
        ctaText="Start Practicing"
        altHref="/features/teachers"
        altText="For teachers"
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="Practice"
        title="Every Question You Need"
        features={[
          { icon: I('M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z'), title: 'Targeted Question Bank', desc: 'Thousands of SAT-style questions. Filter by topic, difficulty, and score band. Detailed explanations for every question.' },
          { icon: I('M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z'), title: 'Smart Review', desc: 'Our algorithm surfaces the questions you should revisit, weighted by recency and learnability.' },
          { icon: I('M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z'), title: 'Error Log', desc: 'Automatically track every mistake. Review them later to spot patterns and turn weaknesses into strengths.' },
          { icon: I('M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM6.25 7.72h11.5v2.5H6.25zM6.25 12h2.5v5.5h-2.5zm4.25 0h2.5v5.5h-2.5zm4.25 0h2.5v5.5h-2.5z'), title: 'Integrated Desmos Calculator', desc: 'The same Desmos graphing calculator you\'ll use on test day, built right in.' },
        ]}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/student-dashboard-1.png"
        alt="Focus areas and accuracy"
        title="Know Your Strengths and Weaknesses"
        caption="See your focus areas and accuracy broken down by every domain and skill"
      />
    ),
  },
  {
    content: (
      <SlideFeatures
        label="Practice Tests"
        title="Simulate the Real Exam"
        features={[
          { icon: I('M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'), title: 'Full-Length Adaptive Tests', desc: 'Timed, multi-module tests that adapt to your performance, just like the real Digital SAT.' },
          { icon: I('M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z'), title: 'Comprehensive Score Reports', desc: 'Scaled scores, domain breakdowns, and an Opportunity Index showing where to focus next.' },
          { icon: I('M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z'), title: 'Detailed Timing Metrics', desc: 'See how long you spent on every question. Learn to manage your time like test day.' },
        ]}
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/score-report-1.png"
        alt="Score report"
        title="Detailed Score Reports"
        caption="Performance metrics for every domain and skill, with difficulty breakdowns"
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/score-report-2.png"
        alt="Opportunity Index"
        title="Find Your Best Path to Improvement"
        caption="Critical review areas, Opportunity Index, and per-question timing data"
      />
    ),
  },
  {
    content: (
      <SlideScreenshot
        src="/screenshots/student-dashboard-2.png"
        alt="Practice history"
        title="Track Your Progress Over Time"
        caption="Review past practice sessions and watch your practice test scores improve"
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
  {
    showCta: true,
    content: (
      <SlideContact
        title="Schools & Organizations"
        subtitle="Need access for your school, tutoring center, or organization? We offer customized plans with bulk pricing and dedicated onboarding."
        email="contact@studyworksprep.com"
        subject="Studyworks Organization Plan Inquiry"
      />
    ),
  },
];

export default function StudentsFeaturePage() {
  return <FeatureSlideshow slides={slides} />;
}
