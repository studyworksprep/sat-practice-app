import Link from 'next/link';
import { getHelpTopics } from './content';
import { IconTile } from '@/lib/ui/IconTile';
import s from './Help.module.css';

export const metadata = {
  title: 'Help — Studyworks',
  description: 'Find guides to SAT and ACT practice, scores, review tools, and your Studyworks account.',
};

export default async function HelpIndexPage({ searchParams }) {
  const params = await searchParams;
  const welcome = params?.welcome === '1';
  const topics = getHelpTopics();

  return (
    <main className={s.container}>
      <Link href="/dashboard" className={s.backLink}>
        <span aria-hidden="true">←</span> Back to Dashboard
      </Link>

      <header className={s.hero}>
        <p className={s.eyebrow}>Studyworks Help</p>
        <h1 className={s.h1}>{welcome ? 'Welcome to Studyworks!' : 'How can we help?'}</h1>
        <p className={s.lead}>
          {welcome
            ? 'If you’re new here, our welcome guide will help you find your way around and decide what to work on in your first week.'
            : 'Find your way around Studyworks, learn how SAT and ACT practice differ, or pick up a study habit you can try today.'}
        </p>
        {welcome && <Link className={s.primaryLink} href="/help/getting-started">Read the welcome guide</Link>}
      </header>

      <nav className={s.topicLinks} aria-label="Help topics">
        {topics.map((topic) => (
          <a key={topic.id} href={`#${topic.id}`}>{topic.title}</a>
        ))}
      </nav>

      {topics.map((topic) => (
        <section key={topic.id} className={s.topic}>
          <h2 id={topic.id} tabIndex={-1} className={s.sectionHeading}>{topic.title}</h2>
          <p className={s.topicDescription}>{topic.description}</p>
          <ul className={s.articleGrid}>
            {topic.articles.map((article) => (
              <li key={article.slug}>
                <Link href={`/help/${article.slug}`} className={s.articleCard}>
                  <IconTile icon={article.icon} palette={article.palette} size="md" />
                  <div className={s.cardCopy}>
                    <h3 className={s.cardTitle}>{article.title}</h3>
                    <p className={s.cardDescription}>{article.blurb}</p>
                  </div>
                  <span className={s.arrow} aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className={s.support} aria-labelledby="help-contact">
        <h2 id="help-contact" className={s.sectionHeading}>Still have a question?</h2>
        <p>
          If something on the site is getting in your way, you can reach us at{' '}
          <a href="mailto:support@studyworksprep.com">support@studyworksprep.com</a>.
        </p>
      </section>
    </main>
  );
}
