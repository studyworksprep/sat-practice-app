// Help article page — one entry per slug from ../content.js.
// Server component; the body HTML is hand-authored static content,
// so dangerouslySetInnerHTML is safe (no user input). Sanitizing
// via SafeHtml would only buy a client component for no benefit.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArticle, getOrderedArticles } from '../content';
import s from '../Help.module.css';

export function generateStaticParams() {
  return getOrderedArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) return { title: 'Help — Studyworks' };
  return { title: `${a.title} — Help — Studyworks`, description: a.blurb };
}

export default async function HelpArticlePage({ params }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const ordered = getOrderedArticles();
  const idx = ordered.findIndex((a) => a.slug === article.slug);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx < ordered.length - 1 ? ordered[idx + 1] : null;

  return (
    <main className={s.container}>
      <Link href="/help" className={s.backLink}>← All Help articles</Link>

      <div className={s.articleHeaderRow}>
        <span className={s.articleHeaderIcon} aria-hidden>{article.icon}</span>
        <h1 className={s.h1}>{article.title}</h1>
      </div>
      <p className={s.lead}>{article.blurb}</p>

      <article>
        {article.sections.map((section, i) => (
          <section key={i} className={s.section}>
            <h2 className={s.sectionHeading}>{section.heading}</h2>
            <div
              className={s.body}
              dangerouslySetInnerHTML={{ __html: section.html }}
            />
          </section>
        ))}
      </article>

      <div className={s.articleFooter}>
        {prev ? (
          <Link href={`/help/${prev.slug}`} className={s.footerBtn}>← {prev.title}</Link>
        ) : <span />}
        {next ? (
          <Link href={`/help/${next.slug}`} className={`${s.footerBtn} ${s.footerBtnPrimary}`}>
            {next.title} →
          </Link>
        ) : (
          <Link href="/help" className={s.footerBtn}>Back to Help index</Link>
        )}
      </div>
    </main>
  );
}
