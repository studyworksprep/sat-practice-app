// Tiny client island that submits the search + domain filter via
// <form method="GET">. The parent page is a Server Component and
// re-runs with the new query params, so we don't need any state
// here beyond what the inputs themselves hold.

'use client';

import s from './Learn.module.css';

export function LearnFilter({ tab, currentQuery, currentDomain, domains }) {
  return (
    <form method="GET" action="/learn" className={s.filterRow}>
      {tab && tab !== 'assigned' && (
        <input type="hidden" name="tab" value={tab} />
      )}
      <input
        type="text"
        name="q"
        defaultValue={currentQuery}
        placeholder="Search lessons…"
        className={s.filterInput}
      />
      <select
        name="domain"
        defaultValue={currentDomain}
        className={s.filterSelect}
      >
        <option value="">All domains</option>
        {domains.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <button type="submit" className={s.filterSubmit}>Filter</button>
    </form>
  );
}
