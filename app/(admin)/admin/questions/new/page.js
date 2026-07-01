// Admin question-authoring page. Server Component shell that gates on
// the admin role (belt-and-suspenders with the (admin) layout + the
// questions_v2 RLS policy) and renders the client authoring form.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { QuestionAuthor } from './QuestionAuthor';
import { listQuestionSources } from './actions';

export const dynamic = 'force-dynamic';

export default async function NewQuestionPage() {
  const { profile } = await requireUser();
  if (profile.role !== 'admin') redirect('/');

  const availableSources = await listQuestionSources();

  return (
    <main style={S.main}>
      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/admin/questions" style={S.backLink}>← Question bank</Link>
      </nav>

      <header style={S.header}>
        <div>
          <div style={S.eyebrow}>Authoring</div>
          <h1 style={S.h1}>New question</h1>
          <p style={S.sub}>
            Compose a question with rich text, equations, tables, and
            figures. It saves to the bank as Studyworks content and stays
            unpublished until you publish it.
          </p>
        </div>
      </header>

      <QuestionAuthor availableSources={availableSources} />
    </main>
  );
}

const S = {
  main: { maxWidth: 960, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  backLink: { color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' },
  header: { marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e5e7eb' },
  eyebrow: { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af' },
  h1: { fontSize: '1.6rem', fontWeight: 700, margin: '0.15rem 0 0.35rem' },
  sub: { color: '#6b7280', fontSize: '0.9rem', margin: 0, maxWidth: '40rem', lineHeight: 1.5 },
};
