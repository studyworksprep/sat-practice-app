import Link from 'next/link';
import { getOrderedArticles } from './content';

export default function HelpIndexPage({ searchParams }) {
  const welcome = searchParams?.welcome === '1';
  const articles = getOrderedArticles();

  return (
    <main className="container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/dashboard" className="muted" style={{ fontSize: 13, textDecoration: 'none' }}>
          ← Back to Dashboard
        </Link>
      </div>

      {welcome && (
        <div
          className="card"
          style={{
            padding: '20px 24px',
            marginBottom: 24,
            background: 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 100%)',
            border: '1px solid var(--accent)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6, color: 'var(--accent)' }}>
            Welcome to Studyworks!
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Take a few minutes to look around. Start with <strong>Welcome — Start Here</strong> below.
            Everything in this Help section is here so you can use the platform well on your own.
          </p>
        </div>
      )}

      <h1 className="h1" style={{ marginBottom: 8 }}>Help</h1>
      <p className="muted" style={{ marginBottom: 28, fontSize: 15, maxWidth: 640 }}>
        Guides for every feature of the platform, plus a study routine you can run on your own.
        Skim the list and read whichever ones answer your current question.
      </p>

      <div style={{ display: 'grid', gap: 12 }}>
        {articles.map((a) => (
          <Link
            key={a.slug}
            href={`/help/${a.slug}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div
              className="card"
              style={{
                padding: '16px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
              }}
            >
              <span style={{ fontSize: 24, lineHeight: 1, marginTop: 2 }} aria-hidden>
                {a.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 2 }}>{a.title}</div>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>{a.blurb}</p>
              </div>
              <span style={{ color: 'var(--accent)', fontSize: 18, fontWeight: 700, alignSelf: 'center' }}>
                →
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="card" style={{ padding: '16px 20px', marginTop: 24, background: 'var(--bg-alt, #f7f8fb)' }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Still have questions?</div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          If you have a teacher on the platform, message them directly. For platform bugs or
          incorrect questions, use the Report a Bug option. Self-studying without a teacher? The{' '}
          <Link href="/help/study-routine">Study Routine</Link> article is the one to read first.
        </p>
      </div>
    </main>
  );
}
