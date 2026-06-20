'use client';

import { ErrorScreen } from '@/lib/ui/ErrorScreen';

export default function AdminSegmentError({ error, reset }) {
  return (
    <ErrorScreen
      error={error}
      reset={reset}
      title="Something went wrong"
      homeHref="/admin"
      homeLabel="Back to admin"
    />
  );
}
