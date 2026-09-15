import Link from 'next/link';
import { requireRole } from '@/lib/api/auth';
import { listImportSets } from './set-actions';
import { ImportComparison } from './ImportComparison';
import s from './import.module.css';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  await requireRole(['admin']);
  return <main className={s.main}>
    <Link href="/admin/questions">← Question bank</Link>
    <header className={s.heading}><div><p className={s.eyebrow}>Admin · Question import</p><h1>Import questions</h1><p>Compare renderings, review each question, and bring the selected questions into the right practice bank.</p></div><span className={s.badge}>Admin workspace</span></header>
    <ImportComparison initialSets={await listImportSets()} showLocalPilot={process.env.NODE_ENV !== 'production'} />
  </main>;
}
