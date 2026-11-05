import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArticle, getHelpTopics, HELP_ARTICLES } from '../content';
import { IconTile } from '@/lib/ui/IconTile';
import s from '../Help.module.css';

export function generateStaticParams() {
  return HELP_ARTICLES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return { title: 'Help — Studyworks' };
  return { title: `${article.title} — Help — Studyworks`, description: article.blurb };
}

export default async function HelpArticlePage({ params }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const topics = getHelpTopics();
  const topic = topics.find(({ id }) => id === article.topic);
  const related = topic.articles.filter((item) => item.slug !== slug);

  return (
    <main className={s.container}>
      <nav className={s.breadcrumb} aria-label="Breadcrumb">
        <Link href="/help">Help</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/help#${topic.id}`}>{topic.title}</Link>
      </nav>

      <div className={s.readerLayout}>
        <aside className={s.desktopBrowse}>
          <ArticleNavigation topics={topics} activeSlug={slug} />
        </aside>

        <div className={s.reader}>
          <header className={s.articleHeader}>
            <IconTile icon={article.icon} palette={article.palette} size="lg" />
            <div>
              <h1 className={s.h1}>{article.title}</h1>
              <p className={s.lead}>{article.blurb}</p>
            </div>
          </header>

          <details className={s.mobileBrowse}>
            <summary>Browse Help articles</summary>
            <ArticleNavigation topics={topics} activeSlug={slug} />
          </details>

          <nav className={s.contents} aria-labelledby="on-this-page">
            <p id="on-this-page" tabIndex={-1} className={s.navTitle}>On this page</p>
            <ul>
              {article.sections.map((section) => (
                <li key={section.id}><a href={`#${section.id}`}>{section.heading}</a></li>
              ))}
            </ul>
          </nav>

          <article aria-label={article.title}>
            {article.sections.map((section) => (
              <section key={section.id} className={s.articleSection}>
                <h2 id={section.id} tabIndex={-1} className={s.sectionHeading}>{section.heading}</h2>
                <div
                  className={s.body}
                  dangerouslySetInnerHTML={{ __html: section.html }}
                />
              </section>
            ))}
          </article>

          {related.length > 0 && (
            <nav className={s.related} aria-label="Related articles">
              <h2 className={s.sectionHeading}>Related articles</h2>
              <ul>
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link href={`/help/${item.slug}`}>
                      {item.title} <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <a className={s.backLink} href="#on-this-page">
            <span aria-hidden="true">↑</span> Back to article contents
          </a>
        </div>
      </div>
    </main>
  );
}

function ArticleNavigation({ topics, activeSlug }) {
  return (
    <nav className={s.articleNav} aria-label="Help articles">
      {topics.map((topic) => (
        <div key={topic.id}>
          <p className={s.navTitle}>{topic.title}</p>
          <ul>
            {topic.articles.map((article) => (
              <li key={article.slug}>
                <Link
                  href={`/help/${article.slug}`}
                  aria-current={article.slug === activeSlug ? 'page' : undefined}
                >
                  {article.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
