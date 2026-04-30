// Client island for the admin users page. Just a small form
// that submits query params for role + search text. No
// useActionState — this is a navigation, not a mutation — so
// we let the browser handle it via a plain <form method="GET">.

'use client';

import { Button } from '@/lib/ui/Button';
import s from './UsersFilter.module.css';

export function UsersFilter({ currentRole, currentQuery, roleTally }) {
  const totalUsers = Object.values(roleTally).reduce((acc, n) => acc + n, 0);

  return (
    <form method="GET" action="/admin/users" className={s.form}>
      <div className={s.row}>
        <label htmlFor="q" className={s.label}>Search</label>
        <input
          id="q"
          name="q"
          type="search"
          placeholder="Name or email"
          defaultValue={currentQuery}
          className={s.input}
        />
      </div>

      <div className={s.row}>
        <label htmlFor="role" className={s.label}>Role</label>
        <select
          id="role"
          name="role"
          defaultValue={currentRole || 'all'}
          className={s.select}
        >
          <option value="all">All ({totalUsers})</option>
          <option value="student">Student ({roleTally.student})</option>
          <option value="practice">Practice ({roleTally.practice})</option>
          <option value="teacher">Teacher ({roleTally.teacher})</option>
          <option value="manager">Manager ({roleTally.manager})</option>
          <option value="admin">Admin ({roleTally.admin})</option>
        </select>
      </div>

      <Button type="submit">Apply</Button>
      <a href="/admin/users" className={s.resetLink}>Reset</a>
    </form>
  );
}
