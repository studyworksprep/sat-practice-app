// Visual tag for an assignment's type. Two variants:
//
//   variant="pill" (default)  — colored pill with full label text
//                              ("Questions", "Lesson", "Practice Test").
//                              Used in list/detail headers.
//
//   variant="compact"         — narrow square with 1-2 letter
//                              abbreviation (Q / L / PT). Used in
//                              tight rows (dashboard panel,
//                              student-detail assignment list).
//
// Both draw from the same color palette so the eye associates type
// → color consistently across the product.

const TYPE_META = {
  questions:     { bg: '#eef2ff', fg: '#4338ca', full: 'Questions',     short: 'Q'  },
  lesson:        { bg: '#ecfdf5', fg: '#047857', full: 'Lesson',        short: 'L'  },
  practice_test: { bg: '#fff7ed', fg: '#c2410c', full: 'Practice Test', short: 'PT' },
};

const FALLBACK = { bg: '#f3f4f6', fg: '#374151', full: '?', short: '?' };

/**
 * @param {object} props
 * @param {'questions'|'lesson'|'practice_test'} props.type
 * @param {'pill'|'compact'} [props.variant='pill']
 */
export function AssignmentTypeBadge({ type, variant = 'pill' }) {
  const meta = TYPE_META[type] ?? { ...FALLBACK, full: String(type), short: String(type)[0]?.toUpperCase() ?? '?' };

  if (variant === 'compact') {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 20,
        borderRadius: 4,
        fontSize: '0.7rem',
        fontWeight: 700,
        background: meta.bg,
        color: meta.fg,
        flexShrink: 0,
      }}>
        {meta.short}
      </span>
    );
  }

  return (
    <span style={{
      display: 'inline-block',
      padding: '0.125rem 0.5rem',
      borderRadius: 999,
      fontSize: '0.7rem',
      fontWeight: 600,
      background: meta.bg,
      color: meta.fg,
      flexShrink: 0,
    }}>
      {meta.full}
    </span>
  );
}
