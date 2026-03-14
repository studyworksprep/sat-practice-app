'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';

function Redirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/review');
  }, [router]);
  return (
    <main className="container">
      <div className="card">
        <div className="muted">Redirecting to Review…</div>
      </div>
    </main>
  );
}

export default function FlashcardReviewPage() {
  return (
    <Suspense fallback={<main className="container"><div className="card"><div className="muted">Loading…</div></div></main>}>
      <Redirect />
    </Suspense>
  );
}
