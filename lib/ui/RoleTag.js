// Role tag — a small colored pill that surfaces a profile.role
// value. Used on /admin/users (list cell), the per-user detail
// page header, and a couple of other admin surfaces. Token-
// mapped so the palette stays in sync with the difficulty +
// status pills used elsewhere.

import s from './RoleTag.module.css';

const TONE = {
  admin:    s.admin,
  manager:  s.manager,
  teacher:  s.teacher,
  student:  s.student,
  practice: s.practice,
};

/**
 * @param {object} props
 * @param {'admin'|'manager'|'teacher'|'student'|'practice'} props.role
 */
export function RoleTag({ role }) {
  const cls = `${s.tag} ${TONE[role] ?? s.practice}`;
  return <span className={cls}>{role}</span>;
}
