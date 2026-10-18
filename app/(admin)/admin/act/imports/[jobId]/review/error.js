'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import s from './Review.module.css';

export default function ReviewError({ reset }) {
  const { jobId } = useParams();
  return (
    <main className={s.container}>
      <h1 className={s.h1}>Unable to load draft review</h1>
      <p role="alert">The import could not be loaded. This does not mean your drafts are missing. Please retry; you do not need to run the parser again.</p>
      <div className={s.chips}>
        <button type="button" className={s.btnPrimary} onClick={reset}>Try again</button>
        <Link className={s.chip} href={`/admin/act/imports/${jobId}`}>Back to job status</Link>
      </div>
    </main>
  );
}
