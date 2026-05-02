// Sub-navigation for the admin users area. Server component —
// just renders three links and highlights the current section.
// `current` is one of: 'list', 'relationships', 'codes'.

import s from './UsersNav.module.css';

const ITEMS = [
  { key: 'list',          href: '/admin/users',               label: 'Users' },
  { key: 'relationships', href: '/admin/users/relationships', label: 'Relationships' },
  { key: 'codes',         href: '/admin/users/codes',         label: 'Codes' },
];

export function UsersNav({ current }) {
  return (
    <nav className={s.nav} aria-label="Admin users sub-navigation">
      {ITEMS.map((item) => {
        const active = item.key === current;
        const cls = active ? `${s.tab} ${s.tabActive}` : s.tab;
        return (
          <a
            key={item.key}
            href={item.href}
            className={cls}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
