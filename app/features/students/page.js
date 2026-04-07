export default function StudentsFeaturePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px 80px' }}>
      <a href="/" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>&larr; Back to home</a>

      <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 40 }}>
        <img src="/studyworks-logo.png" alt="StudyWorks" style={{ height: 40, marginBottom: 16 }} />
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 8px', color: 'var(--text)' }}>SAT Practice Built for Results</h1>
        <p style={{ fontSize: 16, color: 'var(--muted)', maxWidth: 520, margin: '0 auto' }}>
          Studyworks gives you everything you need to improve your SAT score, with smart practice that adapts to your performance.
        </p>
      </div>

      {/* Features */}
      <div style={{ display: 'grid', gap: 20, marginBottom: 40 }}>
        {[
          { title: 'Targeted Question Bank', desc: 'Thousands of SAT-style questions across every domain and skill. Filter by topic, difficulty, and score band to focus on exactly what you need.' },
          { title: 'Full-Length Adaptive Practice Tests', desc: 'Simulate the real SAT experience with timed, adaptive practice tests that route you to harder or easier modules based on your performance, just like the actual exam.' },
          { title: 'Detailed Performance Tracking', desc: 'See your accuracy by domain, topic, and difficulty level. Track your mastery over time and identify your strongest and weakest areas at a glance.' },
          { title: 'Smart Review', desc: 'Our algorithm surfaces the questions you need to revisit most, based on what you got wrong, how recently you practiced, and how learnable each skill is.' },
          { title: 'Instant Explanations', desc: 'Every question comes with a detailed explanation so you understand not just what the right answer is, but why.' },
          { title: 'Score Reports', desc: 'After each practice test, get a comprehensive score report with domain breakdowns, an Opportunity Index highlighting your best areas for improvement, and a full question-by-question review.' },
          { title: 'Vocabulary Flashcards', desc: 'Build your SAT vocabulary with built-in flashcard sets, complete with progress tracking.' },
          { title: 'Desmos Calculator', desc: 'Practice with the same Desmos graphing calculator you will use on test day, integrated right into the question interface.' },
        ].map((f, i) => (
          <div key={i} style={{ padding: '20px 24px', background: 'var(--surface, #f8fafc)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>{f.title}</h3>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Pricing */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>Simple Pricing</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24 }}>Full access to everything. No hidden fees.</p>

        <div style={{ display: 'inline-block', padding: '32px 48px', background: 'var(--card)', border: '2px solid var(--accent)', borderRadius: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>$12.99</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>per month</div>
          <div style={{ marginTop: 16 }}>
            <a href="/" className="btn primary" style={{ padding: '10px 32px', fontSize: 15 }}>Get Started</a>
          </div>
        </div>

        <div style={{ marginTop: 24, padding: '16px 24px', background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 10, maxWidth: 440, margin: '24px auto 0' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#166534', margin: '0 0 4px' }}>Working with a Studyworks Prep tutor?</p>
          <p style={{ fontSize: 13, color: '#15803d', margin: 0 }}>
            Students enrolled with{' '}
            <a href="https://www.studyworksprep.com" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: '#166534' }}>Studyworks Prep</a>{' '}
            get full platform access at no additional cost. Ask your tutor for an invite code when you sign up.
          </p>
        </div>
      </div>

      {/* Org CTA */}
      <div style={{ textAlign: 'center', padding: '24px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 8px' }}>
          Need access for your school, tutoring center, or organization?
        </p>
        <a href="mailto:contact@studyworksprep.com?subject=Studyworks Organization Plan Inquiry" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 14 }}>
          Contact us for customized plans
        </a>
      </div>
    </main>
  );
}
