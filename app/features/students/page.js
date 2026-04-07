const ACCENT = 'var(--accent, #4f7ce0)';

const Icon = ({ children, color = ACCENT }) => (
  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}14`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    {children}
  </div>
);

const FeatureCard = ({ icon, title, desc, screenshot }) => (
  <div style={{ display: 'flex', gap: 16, padding: '24px', background: 'var(--card, #fff)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
    <Icon>{icon}</Icon>
    <div style={{ flex: 1, minWidth: 0 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--text)' }}>{title}</h3>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>{desc}</p>
      {screenshot && (
        <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: '#f8fafc' }}>
          <img src={screenshot} alt={title} style={{ width: '100%', display: 'block' }} />
        </div>
      )}
    </div>
  </div>
);

const SectionHeader = ({ label, title, subtitle }) => (
  <div style={{ textAlign: 'center', margin: '48px 0 24px' }}>
    {label && <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: ACCENT, marginBottom: 6 }}>{label}</div>}
    <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px', color: 'var(--text)' }}>{title}</h2>
    {subtitle && <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 480, margin: '0 auto' }}>{subtitle}</p>}
  </div>
);

const CheckItem = ({ children }) => (
  <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
    <svg viewBox="0 0 20 20" width="18" height="18" style={{ flexShrink: 0, marginTop: 2 }}><path fill="#22c55e" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"/></svg>
    <span>{children}</span>
  </li>
);

export default function StudentsFeaturePage() {
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
          SAT Practice That Actually<br />Moves Your Score
        </h1>
        <p style={{ fontSize: 17, color: 'var(--muted)', maxWidth: 540, margin: '0 auto', lineHeight: 1.6 }}>
          Studyworks combines a massive question bank, adaptive practice tests, and detailed analytics to help you practice smarter and score higher.
        </p>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 12 }}>
          <a href="/" className="btn primary" style={{ padding: '12px 32px', fontSize: 15, borderRadius: 10 }}>Start Practicing</a>
          <a href="/features/teachers" style={{ padding: '12px 24px', fontSize: 14, color: ACCENT, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            For teachers
            <svg viewBox="0 0 20 20" width="16" height="16"><path fill="currentColor" d="M7.3 14.7a1 1 0 010-1.4L10.6 10 7.3 6.7a1 1 0 011.4-1.4l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4 0z"/></svg>
          </a>
        </div>
      </div>

      {/* Screenshot banner */}
      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', marginBottom: 48, background: '#f8fafc', padding: 2 }}>
        <img src="/screenshots/student-dashboard.png" alt="Student Dashboard" style={{ width: '100%', display: 'block', borderRadius: 12 }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      </div>

      {/* Practice Section */}
      <SectionHeader label="Practice" title="Every Question You Need" subtitle="Filter, practice, and review across the full SAT curriculum." />
      <div style={{ display: 'grid', gap: 14 }}>
        <FeatureCard
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/></svg>}
          title="Targeted Question Bank"
          desc="Thousands of SAT-style questions across every domain and skill. Filter by topic, difficulty, and score band to focus on exactly what you need. Each question comes with a detailed explanation."
        />
        <FeatureCard
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>}
          title="Smart Review"
          desc="Our algorithm surfaces the questions you should revisit, weighted by what you got wrong, how recently you practiced, and how learnable each skill is. Stop wasting time on what you already know."
        />
        <FeatureCard
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>}
          title="Error Log"
          desc="Track every mistake in one place. The error log automatically collects questions you got wrong so you can review them later, spot patterns, and turn weaknesses into strengths."
        />
        <FeatureCard
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM6.25 7.72h11.5v2.5H6.25zM6.25 12h2.5v5.5h-2.5zm4.25 0h2.5v5.5h-2.5zm4.25 0h2.5v5.5h-2.5z"/></svg>}
          title="Integrated Desmos Calculator"
          desc="Practice with the same Desmos graphing calculator you'll use on test day, built right into the question interface. No switching tabs, no extra setup."
        />
      </div>

      {/* Tests Section */}
      <SectionHeader label="Practice Tests" title="Simulate the Real Exam" subtitle="Full-length adaptive tests with detailed scoring and timing." />
      <div style={{ display: 'grid', gap: 14 }}>
        <FeatureCard
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
          title="Full-Length Adaptive Practice Tests"
          desc="Timed, multi-module tests that adapt to your performance, just like the real Digital SAT. Get routed to harder or easier questions based on how you do on Module 1."
        />
        <FeatureCard
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>}
          title="Comprehensive Score Reports"
          desc="After each test, get your scaled scores, domain breakdowns, and an Opportunity Index that highlights the skills where focused practice will gain you the most points."
        />
        <FeatureCard
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>}
          title="Detailed Timing Metrics"
          desc="See exactly how long you spent on every question. Identify where you're rushing, where you're getting stuck, and learn to manage your time like you would on test day."
        />
      </div>

      {/* Analytics Section */}
      <SectionHeader label="Analytics" title="Know Exactly Where You Stand" subtitle="Data-driven insights that guide your study plan." />
      <div style={{ display: 'grid', gap: 14 }}>
        <FeatureCard
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>}
          title="Performance Tracking by Domain & Skill"
          desc="See your accuracy broken down by every SAT domain, topic, and difficulty level. Track mastery over time and know exactly what to study next."
        />
        <FeatureCard
          icon={<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>}
          title="Vocabulary Flashcards"
          desc="Build your SAT vocabulary with curated flashcard sets. Track your progress and focus on the words you haven't mastered yet."
        />
      </div>

      {/* Screenshot banner 2 */}
      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', margin: '40px 0', background: '#f8fafc', padding: 2 }}>
        <img src="/screenshots/score-report.png" alt="Score Report" style={{ width: '100%', display: 'block', borderRadius: 12 }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      </div>

      {/* Pricing */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <SectionHeader label="Pricing" title="One Plan. Full Access." subtitle="Everything you need to maximize your SAT score." />

        <div style={{ display: 'inline-block', padding: '36px 52px', background: 'var(--card)', border: '2px solid var(--accent)', borderRadius: 20, textAlign: 'center', boxShadow: '0 4px 24px rgba(79,124,224,0.1)' }}>
          <div style={{ fontSize: 52, fontWeight: 800, color: ACCENT, lineHeight: 1 }}>$12.99</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>per month</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0', textAlign: 'left', display: 'grid', gap: 6 }}>
            <CheckItem>Full question bank with explanations</CheckItem>
            <CheckItem>Unlimited adaptive practice tests</CheckItem>
            <CheckItem>Score reports with Opportunity Index</CheckItem>
            <CheckItem>Performance tracking &amp; smart review</CheckItem>
            <CheckItem>Detailed timing analytics</CheckItem>
            <CheckItem>Vocabulary flashcards</CheckItem>
          </ul>
          <a href="/" className="btn primary" style={{ padding: '12px 40px', fontSize: 15, borderRadius: 10, width: '100%', display: 'block', textAlign: 'center' }}>Get Started</a>
        </div>

        <div style={{ marginTop: 28, padding: '20px 28px', background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 14, maxWidth: 460, margin: '28px auto 0' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#166534', margin: '0 0 6px' }}>Working with a Studyworks Prep tutor?</p>
          <p style={{ fontSize: 13, color: '#15803d', margin: 0, lineHeight: 1.6 }}>
            Students enrolled with{' '}
            <a href="https://www.studyworksprep.com" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: '#166534' }}>Studyworks Prep</a>{' '}
            get full platform access at no additional cost. Just enter your tutor's invite code when you sign up.
          </p>
        </div>
      </div>

      {/* Org CTA */}
      <div style={{ textAlign: 'center', padding: '28px 24px', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>
          Need access for your school or organization?
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
          We offer customized plans with bulk pricing and dedicated onboarding.
        </p>
        <a href="mailto:contact@studyworksprep.com?subject=Studyworks Organization Plan Inquiry" className="btn secondary" style={{ padding: '10px 28px', fontSize: 14, borderRadius: 10 }}>
          Contact Us
        </a>
      </div>
    </main>
  );
}
