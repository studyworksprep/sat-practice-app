import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArticle, getOrderedArticles } from '../content';

export function generateStaticParams() {
  return getOrderedArticles().map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }) {
  const a = getArticle(params.slug);
  if (!a) return { title: 'Help — Studyworks' };
  return { title: `${a.title} — Help — Studyworks`, description: a.blurb };
}

export default function HelpArticlePage({ params }) {
  const article = getArticle(params.slug);
  if (!article) notFound();

  const ordered = getOrderedArticles();
  const idx = ordered.findIndex((a) => a.slug === article.slug);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx < ordered.length - 1 ? ordered[idx + 1] : null;

  return (
    <main className="container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 760 }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, fontSize: 13 }}>
        <Link href="/help" className="muted" style={{ textDecoration: 'none' }}>
          ← All Help articles
        </Link>
        <Link href="/dashboard" className="muted" style={{ textDecoration: 'none' }}>
          Dashboard
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 32, lineHeight: 1 }} aria-hidden>{article.icon}</span>
        <h1 className="h1" style={{ margin: 0 }}>{article.title}</h1>
      </div>
      <p className="muted" style={{ marginBottom: 28, fontSize: 15 }}>{article.blurb}</p>

      <article className="helpArticle">
        {article.sections.map((s, i) => (
          <section key={i} style={{ marginBottom: 28 }}>
            <h2 className="h2" style={{ fontSize: 18, marginBottom: 8 }}>{s.heading}</h2>
            <div
              className="helpArticleBody"
              dangerouslySetInnerHTML={{ __html: s.html }}
            />
          </section>
        ))}
      </article>

      <div
        style={{
          marginTop: 36,
          paddingTop: 20,
          borderTop: '1px solid var(--border, #eee)',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {prev ? (
          <Link href={`/help/${prev.slug}`} className="btn secondary" style={{ fontSize: 13 }}>
            ← {prev.title}
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/help/${next.slug}`} className="btn" style={{ fontSize: 13 }}>
            {next.title} →
          </Link>
        ) : (
          <Link href="/help" className="btn secondary" style={{ fontSize: 13 }}>
            Back to Help index
          </Link>
        )}
      </div>

      <style>{`
        .helpArticleBody { font-size: 15px; line-height: 1.65; color: var(--text, #222); }
        .helpArticleBody p { margin: 0 0 12px; }
        .helpArticleBody ul, .helpArticleBody ol { margin: 0 0 12px; padding-left: 22px; }
        .helpArticleBody li { margin-bottom: 6px; }
        .helpArticleBody strong { color: var(--text, #111); }
        .helpArticleBody em { color: var(--text, #222); }
        .helpArticleBody a { color: var(--accent); }
      `}</style>
    </main>
  );
}
