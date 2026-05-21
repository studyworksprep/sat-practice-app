// Student Help index. Server component — content is fully static
// (see ./content.js), so there's nothing to fetch and no client
// state. The ?welcome=1 banner is rendered when the dashboard
// first-login redirect routes a brand-new student here.

import Link from 'next/link';
import { getOrderedArticles } from './content';
import s from './Help.module.css';

export const metadata = {
  title: 'Help — Studyworks',
  description: 'Learn how to use every feature of the SAT practice platform.',
};

export default async function HelpIndexPage({ searchParams }) {
  const params = await searchParams;
  const welcome = params?.welcome === '1';
  const articles = getOrderedArticles();

  return (
    <main className={s.container}>
      <Link href="/dashboard" className={s.backLink}>← Back to Dashboard</Link>

      {welcome && (
        <div className={s.welcomeBanner}>
          <div className={s.welcomeBannerTitle}>Welcome to Studyworks!</div>
          <p className={s.welcomeBannerBody}>
            Take a few minutes to look around. Start with <strong>Welcome — Start Here</strong> below.
            Everything in this Help section is here so you can use the platform well on your own.
          </p>
        </div>
      )}

      <div className={s.eyebrow}>Help</div>
      <h1 className={s.h1}>Learn how to use Studyworks</h1>
      <p className={s.lead}>
        Guides for every tab in the top nav, plus a self-study routine and tips
        for getting the most out of the platform. Skim the list and read whichever
        articles answer your current question.
      </p>

      <div className={s.articleGrid}>
        {articles.map((a) => (
          <Link key={a.slug} href={`/help/${a.slug}`} className={s.articleCard}>
            <span className={s.articleIcon} aria-hidden>{a.icon}</span>
            <div className={s.articleBody}>
              <div className={s.articleTitle}>{a.title}</div>
              <p className={s.articleBlurb}>{a.blurb}</p>
            </div>
            <span className={s.articleArrow}>→</span>
          </Link>
        ))}
      </div>

      <div className={s.stillStuck}>
        <div className={s.stillStuckTitle}>Still have questions?</div>
        <p className={s.stillStuckBody}>
          If you have a tutor on the platform, message them directly. Self-studying?
          The <Link href="/help/study-routine">Study Routine</Link> article is the one to
          read first; <Link href="/help/notes">Notes &amp; Error Log</Link> is the feature
          most students underuse.
        </p>
      </div>
    </main>
  );
}
