'use client';

import { useState } from 'react';

const ACCENT = 'var(--accent, #4f7ce0)';

const Icon = ({ children, color = ACCENT }) => (
  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}14`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    {children}
  </div>
);

const FeatureCard = ({ icon, title, desc, color }) => (
  <div style={{ display: 'flex', gap: 16, padding: '24px', background: 'var(--card, #fff)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
    <Icon color={color}>{icon}</Icon>
    <div style={{ flex: 1, minWidth: 0 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--text)' }}>{title}</h3>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>{desc}</p>
    </div>
  </div>
);

const SectionHeader = ({ label, title, subtitle }) => (
  <div style={{ textAlign: 'center', margin: '48px 0 24px' }}>
    {label && <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: ACCENT, marginBottom: 6 }}>{label}</div>}
    <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px', color: 'var(--text)' }}>{title}</h2>
    {subtitle && <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 500, margin: '0 auto' }}>{subtitle}</p>}
  </div>
);

const CheckItem = ({ children }) => (
  <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
    <svg viewBox="0 0 20 20" width="18" height="18" style={{ flexShrink: 0, marginTop: 2 }}><path fill="#22c55e" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"/></svg>
    <span>{children}</span>
  </li>
);

const StatBlock = ({ value, label }) => (
  <div style={{ textAlign: 'center', padding: '16px 12px' }}>
    <div style={{ fontSize: 28, fontWeight: 800, color: ACCENT, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{label}</div>
  </div>
);

function Screenshot({ src, alt, caption }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <figure style={{ margin: '32px 0', padding: 0 }}>
      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', background: '#f8fafc', padding: 2 }}>
        <img src={src} alt={alt} style={{ width: '100%', display: 'block', borderRadius: 12 }}
          onError={() => setVisible(false)}
        />
      </div>
      {caption && (
        <figcaption style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', marginTop: 10, fontStyle: 'italic' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export default function TeachersFeaturePage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 80px' }}>
      <a href="/" style={{ fontSize: 13, color: ACCENT, textDecoration: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <svg viewBox="0 0 20 20" width="16" height="16"><path fill="currentColor" d="M12.7 5.3a1 1 0 010 1.4L9.4 10l3.3 3.3a1 1 0 01-1.4 1.4l-4-4a1 1 0 010-1.4l4-4a1 1 0 011.4 0z"/></svg>
        Back to home
      </a>

      {/* Hero */}
      <div style={{ textAlign: 'center', marginTop: 32, marginBottom: 48 }}>
        <img src="/studyworks-logo.png" alt="StudyWorks" style={{ height: 44, marginBottom: 20 }} />
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: '0 0 12px', color: 'var(--text)', lineHeight: 1.2 }}>
          The SAT Platform Built<br />for Serious Tutors
        </h1>
        <p style={{ fontSize: 17, color: 'var(--muted)', maxWidth: 540, margin: '0 auto', lineHeight: 1.6 }}>
          Real-time visibility into every student&rsquo;s preparation. Tools that let you assign, track, and analyze with the precision your students deserve.
        </p>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 12 }}>
          <a href="/" className="btn primary" style={{ padding: '12px 32px', fontSize: 15, borderRadius: 10 }}>Get Started</a>
          <a href="/features/students" style={{ padding: '12px 24px', fontSize: 14, color: ACCENT, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            For students
            <svg viewBox="0 0 20 20" width="16" height="16"><path fill="currentColor" d="M7.3 14.7a1 1 0 010-1.4L10.6 10 7.3 6.7a1 1 0 011.4-1.4l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4 0z"/></svg>
          </a>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 48, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '8px 16px', flexWrap: 'wrap' }}>
        <StatBlock value="1000+" label="SAT questions" />
        <StatBlock value="10+" label="Practice tests" />
        <StatBlock value="8" label="Domain breakdowns" />
        <StatBlock value="44" label="Skills tracked" />
      </div>

      {/* Student Management */}
      <SectionHeader label="Student Management" title="See Every Student at a Glance" subtitle="Live metrics, deep profiles, and complete visibility into each student's progress." />
      <div style={{ display: 'grid', gap: 14 }}>
        <FeatureCard
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>}
          title="Live Student Roster"
          desc="Questions completed, accuracy trends, recent activity, practice test scores, and attention alerts. Color-coded indicators highlight who's on track and who needs help."
        />
        <FeatureCard
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>}
          title="Deep Student Profiles"
          desc="Drill into any student: domain-by-domain mastery, topic-level accuracy with difficulty breakdowns, practice test history, recent session reviews, official SAT scores with all 8 domain bands, and assignment completion."
        />
        <FeatureCard
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>}
          title="Custom Assignments"
          desc="Create targeted question sets by topic, difficulty, and score band. Assign to individuals or groups with due dates. Track completion and accuracy in real time."
        />
      </div>

      <Screenshot
        src="/screenshots/teacher-dashboard.png"
        alt="Teacher dashboard with roster-wide performance"
        caption="Roster-wide performance metrics, assignments, and class-level grouping"
      />

      <Screenshot
        src="/screenshots/teacher-student-detail-1.png"
        alt="Full student practice record"
        caption="Complete record of all practice completed, with detailed performance statistics by domain and skill"
      />

      {/* Testing & Scoring */}
      <SectionHeader label="Testing & Scoring" title="Tests, Scores, and Score Reports" subtitle="Full practice tests and official score tracking with deep analysis." />
      <div style={{ display: 'grid', gap: 14 }}>
        <FeatureCard
          color="#7c3aed"
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
          title="Practice Test Management"
          desc="Assign adaptive practice tests and monitor scores. Detailed score reports include domain breakdowns, an Opportunity Index, and a full question-by-question review with per-question timing data."
        />
        <FeatureCard
          color="#7c3aed"
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>}
          title="Bluebook Results Upload"
          desc="Upload your students' College Board Bluebook practice test results directly into Studyworks. Get the same detailed score reports, domain breakdowns, and question-by-question review as tests taken on our platform."
        />
        <FeatureCard
          color="#7c3aed"
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>}
          title="Official Score Tracking"
          desc="Record SAT and PSAT scores with all 8 domain score bands. Track progression over time and measure the real-world impact of your tutoring."
        />
        <FeatureCard
          color="#7c3aed"
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>}
          title="Detailed Timing Metrics"
          desc="For tests taken on Studyworks, see per-question timing data. Know exactly where students are spending too long, rushing, or getting stuck."
        />
      </div>

      {/* Analytics & Tools */}
      <SectionHeader label="Analytics & Tools" title="Insights That Drive Results" subtitle="Aggregate analytics, question tagging, and built-in tools for your workflow." />
      <div style={{ display: 'grid', gap: 14 }}>
        <FeatureCard
          color="#059669"
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>}
          title="Aggregate Performance Dashboard"
          desc="See your entire roster's performance in one view: overall accuracy with 30-day trends, score distributions, skill-level heatmaps, and the hardest and easiest questions across your students."
        />
        <FeatureCard
          color="#059669"
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>}
          title="Concept Tagging System"
          desc="Tag questions by concept, skill, or any custom label. Use tags to organize your curriculum, identify question types at a glance, and build targeted review sessions. Practice tests are auto-tagged (PT1, PT2, etc.)."
        />
        <FeatureCard
          color="#059669"
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>}
          title="Pre-loaded Desmos Solutions"
          desc="Most math questions come with pre-loaded Desmos calculator solutions, visible to all tutors. Load them in one click to show students the graphing approach, or use them to prepare for your sessions."
        />
        <FeatureCard
          color="#059669"
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>}
          title="Session Review"
          desc="Review any student's practice sessions question by question. See correctness, time spent, difficulty, and domain. Add notes to questions for your own reference or to share with your team."
        />
      </div>

      <Screenshot
        src="/screenshots/teacher-student-detail-2.png"
        alt="Weighted performance metrics and topic mastery"
        caption="Weighted performance metrics identify true strengths and weaknesses across every topic"
      />

      <Screenshot
        src="/screenshots/teacher-student-detail-3.png"
        alt="Score patterns and suggested review areas"
        caption="Score pattern tracking, suggested review areas, and exportable data for family reports or integration with other platforms"
      />

      {/* Training */}
      <SectionHeader label="Your Own Training" title="Stay Sharp" subtitle="Practice everything your students practice, with your own tracking." />
      <div style={{ display: 'grid', gap: 14, marginBottom: 16 }}>
        <FeatureCard
          color="#d97706"
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3 1 9l11 6 9-4.91V17h2V9L12 3z"/></svg>}
          title="Full Platform Access"
          desc="Take every practice test, answer every question, and use every tool. Your own practice data is tracked separately in your Training profile, so your students' data stays clean."
        />
      </div>

      {/* Pricing */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <SectionHeader label="Pricing" title="Everything You Need" subtitle="Full access to all teacher tools, analytics, and the complete question bank." />

        <div style={{ display: 'inline-block', padding: '36px 52px', background: 'var(--card)', border: '2px solid var(--accent)', borderRadius: 20, textAlign: 'center', boxShadow: '0 4px 24px rgba(79,124,224,0.1)' }}>
          <div style={{ fontSize: 52, fontWeight: 800, color: ACCENT, lineHeight: 1 }}>$29.99</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>per month</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0', textAlign: 'left', display: 'grid', gap: 6 }}>
            <CheckItem>Unlimited students</CheckItem>
            <CheckItem>Full question bank &amp; practice tests</CheckItem>
            <CheckItem>Assignments &amp; score tracking</CheckItem>
            <CheckItem>Performance analytics &amp; reports</CheckItem>
            <CheckItem>Bluebook results upload</CheckItem>
            <CheckItem>Concept tags &amp; Desmos solutions</CheckItem>
            <CheckItem>Session notes &amp; review tools</CheckItem>
            <CheckItem>Exportable data &amp; family reports</CheckItem>
          </ul>
          <a href="/" className="btn primary" style={{ padding: '12px 40px', fontSize: 15, borderRadius: 10, width: '100%', display: 'block', textAlign: 'center' }}>Get Started</a>
        </div>

        <div style={{ marginTop: 28, padding: '20px 28px', background: 'rgba(79,124,224,0.06)', border: '1px solid rgba(79,124,224,0.2)', borderRadius: 14, maxWidth: 460, margin: '28px auto 0' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: ACCENT, margin: '0 0 6px' }}>Studyworks Prep educators</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            Teachers working with{' '}
            <a href="https://www.studyworksprep.com" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: ACCENT }}>Studyworks Prep</a>{' '}
            get full platform access at no cost, along with all their students.
          </p>
        </div>
      </div>

      {/* Org CTA */}
      <div style={{ textAlign: 'center', padding: '32px 28px', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Schools &amp; Organizations</h3>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 16px', maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
          Onboard an entire department, tutoring center, or school with customized plans, bulk pricing, dedicated onboarding, and manager accounts for oversight across multiple teachers.
        </p>
        <a href="mailto:contact@studyworksprep.com?subject=Studyworks Organization Plan Inquiry" className="btn secondary" style={{ padding: '10px 28px', fontSize: 14, borderRadius: 10 }}>
          Contact Us
        </a>
      </div>
    </main>
  );
}
