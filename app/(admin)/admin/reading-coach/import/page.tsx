// Admin · Reading Coach · Import — server shell.
//
// Mounts the client component that runs the ReadingCoachItemSpec
// validator live as the admin pastes. Submission goes to the
// colocated Server Action, which re-validates and writes the draft.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { ImportClient } from './ImportClient';
import a from '../../../admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminReadingCoachImportPage() {
  const { profile } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <Link href="/admin/reading-coach">← Reading Coach</Link>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Reading Coach</div>
        <h1 className={a.h1}>Import item from JSON</h1>
        <p className={a.sub}>
          Paste a ReadingCoachItemSpec — identity, passage, question
          stem, the four rubrics, and exactly four choices. The
          validator runs live; saving creates a draft (a new slug makes
          a new item, an existing slug drafts its next version).
          Publishing happens from the item page and additionally
          requires a settled rights status.
        </p>
      </header>

      <ImportClient />
    </main>
  );
}
