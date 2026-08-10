// Admin · Reading Coach — item list.
//
// PR 1 surface: browse authored items, see draft/published/archived
// state and version counts, jump to import or item detail. Student
// runner and QA lab arrive in later PRs.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { listReadingCoachItems } from '@/lib/reading-coach/content';
import a from '../../admin.module.css';
import f from '../../forms.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminReadingCoachPage() {
  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const entries = await listReadingCoachItems(supabase);

  return (
    <main className={a.container}>
      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Reading Coach</div>
        <h1 className={a.h1}>Reading Coach items</h1>
        <p className={a.sub}>
          Human-authored passages, rubrics, and choices for the guided
          reading workflow. Publishing freezes an immutable version;
          re-importing a slug drafts the next version.
        </p>
      </header>

      <p>
        <Link className={a.link} href="/admin/reading-coach/import">
          + Import item from JSON
        </Link>
      </p>

      {entries.length === 0 ? (
        <p className={f.empty}>
          No items yet. Import a ReadingCoachItemSpec to create the first
          draft.
        </p>
      ) : (
        <div className={f.tableWrap}>
          <table className={f.table}>
            <thead>
              <tr>
                <th className={f.th}>Title</th>
                <th className={f.th}>Slug</th>
                <th className={f.th}>Genre</th>
                <th className={f.th}>Difficulty</th>
                <th className={f.th}>Status</th>
                <th className={f.th}>Versions</th>
                <th className={f.th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ item, versionCount, latestVersionNumber, publishedVersionNumber }) => (
                <tr key={item.id}>
                  <td className={f.td}>
                    <Link className={a.link} href={`/admin/reading-coach/${item.id}`}>
                      {item.title}
                    </Link>
                  </td>
                  <td className={f.tdMuted}>{item.slug}</td>
                  <td className={f.td}>{item.genre}</td>
                  <td className={f.td}>{item.difficulty}</td>
                  <td className={f.td}>{item.status}</td>
                  <td className={f.tdMuted}>
                    {versionCount}
                    {publishedVersionNumber != null
                      ? ` (live v${publishedVersionNumber})`
                      : latestVersionNumber != null
                        ? ` (draft v${latestVersionNumber})`
                        : ''}
                  </td>
                  <td className={f.tdMuted}>
                    {new Date(item.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
