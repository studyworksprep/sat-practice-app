// Client island for the admin users page. Just a small form that
// submits query params for role + search text. No useActionState —
// this is a navigation, not a mutation — so we let the browser
// handle it via a plain <form method="GET">.
//
// Server Component reads the URL params and re-runs with the new
// filter. That's the entire state management story for this page.

'use client';

export function UsersFilter({ currentRole, currentQuery, roleTally }) {
  const totalUsers = Object.values(roleTally).reduce((acc, n) => acc + n, 0);

  return (
    <form method="GET" action="/admin/users" style={S.form}>
      <div style={S.row}>
        <label htmlFor="q" style={S.label}>
          Search
        </label>
        <input
          id="q"
          name="q"
          type="search"
          placeholder="Name or email"
          defaultValue={currentQuery}
          style={S.input}
        />
      </div>

      <div style={S.row}>
        <label htmlFor="role" style={S.label}>
          Role
        </label>
        <select id="role" name="role" defaultValue={currentRole || 'all'} style={S.select}>
          <option value="all">All ({totalUsers})</option>
          <option value="student">Student ({roleTally.student})</option>
          <option value="practice">Practice ({roleTally.practice})</option>
          <option value="teacher">Teacher ({roleTally.teacher})</option>
          <option value="manager">Manager ({roleTally.manager})</option>
          <option value="admin">Admin ({roleTally.admin})</option>
        </select>
      </div>

      <button type="submit" style={S.submitBtn}>
        Apply
      </button>
      <a href="/admin/users" style={S.resetLink}>
        Reset
      </a>
    </form>
  );
}

const S = {
  form: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
    alignItems: 'flex-end',
    padding: '1rem',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
  },
  row: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  label: { fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.025em' },
  input: {
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: '0.9rem',
    minWidth: 240,
  },
  select: {
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: '0.9rem',
    background: 'white',
    minWidth: 160,
  },
  submitBtn: {
    padding: '0.5rem 1rem',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  resetLink: {
    color: '#6b7280',
    textDecoration: 'none',
    fontSize: '0.85rem',
    padding: '0.5rem 0.75rem',
  },
};
