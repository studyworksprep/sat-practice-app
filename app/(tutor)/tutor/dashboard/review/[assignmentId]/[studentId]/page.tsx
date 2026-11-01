import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { resolveDashboardReport } from '@/lib/tutor/dashboard-report';
import s from '../../../Dashboard.module.css';

export const dynamic = 'force-dynamic';

export default async function DashboardReviewPage({ params }: {
  params: Promise<{ assignmentId: string; studentId: string }>;
}) {
  const { assignmentId, studentId } = await params;
  const { supabase } = await requireRole(['teacher', 'manager', 'admin']);
  // Use the signed-in client and verify both membership and visibility.
  const [assignmentResult, memberResult] = await Promise.all([
    supabase.from('assignments_v2')
      .select('id, assignment_type, test_type, practice_test_id, act_source_test')
      .eq('id', assignmentId).is('deleted_at', null).maybeSingle(),
    supabase.from('assignment_students_v2').select('completed_at')
      .eq('assignment_id', assignmentId).eq('student_id', studentId).maybeSingle(),
  ]);
  if (assignmentResult.error) throw assignmentResult.error;
  if (memberResult.error) throw memberResult.error;
  if (!assignmentResult.data || !memberResult.data?.completed_at) notFound();
  const href = await resolveDashboardReport(
    supabase, assignmentResult.data, studentId, memberResult.data.completed_at,
  );
  if (href) redirect(href);

  return (
    <main className={s.container}>
      <section className={s.card}>
        <h1 className={s.h1}>Report unavailable</h1>
        <p>This assignment is marked complete, but no matching report is available.</p>
        <div className={s.tileActions}>
          <Link href={`/tutor/assignments/${assignmentId}`}>Open assignment</Link>
          <Link href={`/tutor/students/${studentId}`}>Open student</Link>
          <Link href="/tutor/dashboard">Back to dashboard</Link>
        </div>
      </section>
    </main>
  );
}
