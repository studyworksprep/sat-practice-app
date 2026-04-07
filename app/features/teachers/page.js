export default function TeachersFeaturePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px 80px' }}>
      <a href="/" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>&larr; Back to home</a>

      <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 40 }}>
        <img src="/studyworks-logo.png" alt="StudyWorks" style={{ height: 40, marginBottom: 16 }} />
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 8px', color: 'var(--text)' }}>The SAT Platform Teachers Deserve</h1>
        <p style={{ fontSize: 16, color: 'var(--muted)', maxWidth: 520, margin: '0 auto' }}>
          Studyworks gives you real-time visibility into every student's SAT preparation, with tools designed for tutors and educators who demand more than just a question bank.
        </p>
      </div>

      {/* Teacher-specific features */}
      <div style={{ display: 'grid', gap: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 -8px', color: 'var(--text)' }}>Student Management</h2>
        {[
          { title: 'Student Roster with Live Metrics', desc: 'See every student at a glance: questions completed, accuracy trends, recent activity, practice test scores, and whether they need attention. Color-coded indicators highlight who is on track and who is falling behind.' },
          { title: 'Deep Student Profiles', desc: 'Drill into any student to see domain-by-domain mastery, topic-level accuracy with difficulty breakdowns, practice test history, recent session reviews, official SAT scores with domain bands, and assignment completion.' },
          { title: 'Custom Assignments', desc: 'Create targeted question sets by topic, difficulty, and score band. Assign them to individual students or groups with optional due dates. Track completion and accuracy in real time.' },
          { title: 'Practice Test Management', desc: 'Assign full-length adaptive practice tests to students and monitor their scores. View detailed score reports with domain breakdowns and an Opportunity Index showing where each student can gain the most points.' },
          { title: 'Official Score Tracking', desc: 'Record and track official SAT and PSAT scores, including all eight domain score bands. See score progression over time to measure the impact of your tutoring.' },
        ].map((f, i) => (
          <div key={i} style={{ padding: '20px 24px', background: 'var(--surface, #f8fafc)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>{f.title}</h3>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 -8px', color: 'var(--text)' }}>Analytics &amp; Insights</h2>
        {[
          { title: 'Aggregate Performance Dashboard', desc: 'See your entire roster\'s performance in one view: overall accuracy with 30-day trends, score distributions, skill-level heatmaps, and the hardest and easiest questions across your students.' },
          { title: 'Mastery Tracking', desc: 'Our weighted mastery algorithm accounts for question difficulty, score band, practice volume, and recency to give you a true picture of each student\'s readiness, not just raw accuracy.' },
          { title: 'Session Review', desc: 'Review any student\'s practice sessions question by question. See what they got right and wrong, how long they spent, and which skills they practiced. Add concept tags to questions for your own organization.' },
        ].map((f, i) => (
          <div key={i} style={{ padding: '20px 24px', background: 'var(--surface, #f8fafc)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>{f.title}</h3>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 20, marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 -8px', color: 'var(--text)' }}>Everything Students Get, Plus More</h2>
        {[
          { title: 'Full Question Bank Access', desc: 'Practice every question yourself to stay sharp and preview what you assign. Your own practice data is tracked separately in your Training profile.' },
          { title: 'Practice Tests', desc: 'Take the same adaptive practice tests your students do. Know every question before your students see it.' },
        ].map((f, i) => (
          <div key={i} style={{ padding: '20px 24px', background: 'var(--surface, #f8fafc)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>{f.title}</h3>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Pricing */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>Pricing</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24 }}>Full access to all teacher tools and the complete question bank.</p>

        <div style={{ display: 'inline-block', padding: '32px 48px', background: 'var(--card)', border: '2px solid var(--accent)', borderRadius: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>$29.99</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>per month</div>
          <ul style={{ textAlign: 'left', fontSize: 13, color: 'var(--text)', margin: '16px 0', padding: '0 0 0 18px', lineHeight: 1.8 }}>
            <li>Unlimited students</li>
            <li>Full question bank &amp; practice tests</li>
            <li>Assignments &amp; score tracking</li>
            <li>Performance analytics &amp; reports</li>
          </ul>
          <div>
            <a href="/" className="btn primary" style={{ padding: '10px 32px', fontSize: 15 }}>Get Started</a>
          </div>
        </div>

        <div style={{ marginTop: 24, padding: '16px 24px', background: 'rgba(79,124,224,0.06)', border: '1px solid rgba(79,124,224,0.2)', borderRadius: 10, maxWidth: 440, margin: '24px auto 0' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', margin: '0 0 4px' }}>Studyworks Prep educators</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
            Teachers working with{' '}
            <a href="https://www.studyworksprep.com" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: 'var(--accent)' }}>Studyworks Prep</a>{' '}
            get full platform access at no cost, and so do all their students.
          </p>
        </div>
      </div>

      {/* Org CTA */}
      <div style={{ textAlign: 'center', padding: '24px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>Schools &amp; Organizations</h3>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 12px', maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
          Need to onboard an entire department, tutoring center, or school? We offer customized plans with bulk pricing, dedicated onboarding, and manager accounts for oversight across multiple teachers.
        </p>
        <a href="mailto:contact@studyworksprep.com?subject=Studyworks Organization Plan Inquiry" className="btn secondary" style={{ fontSize: 14, padding: '8px 24px' }}>
          Contact Us
        </a>
      </div>
    </main>
  );
}
