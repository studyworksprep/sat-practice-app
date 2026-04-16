// Sub-navigation for the admin users area. Server component — just
// renders three links and highlights the current section. The
// `current` prop is one of: 'list', 'relationships', 'codes'.

const ITEMS = [
  { key: 'list', href: '/admin/users', label: 'Users' },
  { key: 'relationships', href: '/admin/users/relationships', label: 'Relationships' },
  { key: 'codes', href: '/admin/users/codes', label: 'Codes' },
];

export function UsersNav({ current }) {
  return (
    <nav style={S.nav} aria-label="Admin users sub-navigation">
      {ITEMS.map((item) => {
        const active = item.key === current;
        return (
          <a
            key={item.key}
            href={item.href}
            style={{ ...S.tab, ...(active ? S.tabActive : {}) }}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

const S = {
  nav: {
    display: 'flex',
    gap: '0.25rem',
    padding: '0.25rem',
    background: '#f3f4f6',
    borderRadius: 8,
    marginBottom: '1.5rem',
    width: 'fit-content',
  },
  tab: {
    padding: '0.45rem 0.9rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#4b5563',
    textDecoration: 'none',
    borderRadius: 6,
  },
  tabActive: {
    background: 'white',
    color: '#111827',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
};
