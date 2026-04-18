// Labeled metric tile. The pattern accumulated five copies across
// admin/student/tutor pages before this extraction — visually
// identical, just re-inlined each time. Changing the visual design
// should be a one-file edit from now on.

/**
 * @param {object} props
 * @param {string} props.label
 * @param {React.ReactNode} props.value
 * @param {boolean} [props.small] - shrinks the value font for tight layouts
 */
export function StatCard({ label, value, small = false }) {
  return (
    <div style={styles.card}>
      <div style={styles.label}>{label}</div>
      <div style={small ? styles.valueSmall : styles.value}>
        {value ?? '—'}
      </div>
    </div>
  );
}

const styles = {
  card: {
    padding: '1rem',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
  },
  label: {
    fontSize: '0.8rem',
    color: '#6b7280',
    marginBottom: '0.25rem',
  },
  value: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#111827',
  },
  valueSmall: {
    fontSize: '1rem',
    fontWeight: 500,
    color: '#374151',
  },
};
