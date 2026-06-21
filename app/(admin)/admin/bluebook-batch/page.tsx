// Admin batch Bluebook upload — a multi-row form for uploading
// several Bluebook score reports in one sitting. Each row carries
// one upload: student + practice test + .htm/.html answers file +
// RW/Math scaled scores. Submit fires the existing single-upload
// endpoint per row in parallel.
//
// Built specifically for collecting calibration data fast — Steve
// Student is the default for every row because that's the "lab
// account" we use for prescribed-pattern experiments. Override per
// row when uploading real student scores.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { BluebookBatchInteractive } from './BluebookBatchInteractive';
import a from '../../admin.module.css';

export const dynamic = 'force-dynamic';

const STEVE_STUDENT_ID = '53bf2416-dc90-4f09-8b14-491011f16bd9';

export default async function AdminBluebookBatchPage() {
  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const [{ data: tests }, { data: students }] = await Promise.all([
    supabase
      .from('practice_tests_v2')
      .select('id, code, name')
      .order('code')
      .limit(50),
    supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'student')
      .eq('is_active', true)
      .order('last_name')
      .limit(500),
  ]);

  const studentOptions = (students ?? []).map((s) => ({
    id: s.id as string,
    label: `${s.last_name ?? ''}, ${s.first_name ?? ''}`.trim().replace(/^,\s*/, ''),
  }));
  const testOptions = (tests ?? []).map((t) => ({
    id: t.id as string,
    code: (t.code ?? '') as string,
    name: (t.name ?? '') as string,
  }));

  // Default student: Steve Student if present, otherwise the first
  // option in the list. Falls through to empty if the dropdown is
  // empty for some reason (no active students).
  const defaultStudentId =
    studentOptions.find((s) => s.id === STEVE_STUDENT_ID)?.id
    ?? studentOptions[0]?.id
    ?? '';

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href="/admin">← Admin</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Bluebook Batch</div>
        <h1 className={a.h1}>Batch Bluebook upload</h1>
        <p className={a.sub}>
          Upload several Bluebook score reports in one pass. Each row
          parses its HTML file in the browser and posts to the existing
          per-student upload endpoint — same code path as the teacher
          single-upload modal, just N rows at once.
        </p>
      </header>

      <BluebookBatchInteractive
        students={studentOptions}
        tests={testOptions}
        defaultStudentId={defaultStudentId}
      />
    </main>
  );
}
