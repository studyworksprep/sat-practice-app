// Sort toggle for the performance heatmap. Mirrors the
// AssignmentsToolbar pattern — URL search param drives the
// page's server-side sort, this island just wraps a select
// element + useTransition for snappy feel.

'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import s from './Performance.module.css';

const SORT_OPTIONS = [
  { value: 'struggling',     label: 'Most students struggling' },
  { value: 'most-missed',    label: 'Most missed (cohort total)' },
  { value: 'accuracy-asc',   label: 'Lowest cohort accuracy' },
  { value: 'accuracy-desc',  label: 'Highest cohort accuracy' },
  { value: 'attempts',       label: 'Most cohort attempts' },
  { value: 'name',           label: 'Skill name (A–Z)' },
];

export function PerformanceSortToolbar({ initialSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function onChange(e) {
    const next = new URLSearchParams(searchParams.toString());
    if (e.target.value === 'struggling') next.delete('sort');
    else next.set('sort', e.target.value);
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <label className={s.sortLabel}>
      <span className={s.sortLabelText}>Sort by</span>
      <select
        value={initialSort ?? 'struggling'}
        onChange={onChange}
        className={s.sortSelect}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}
