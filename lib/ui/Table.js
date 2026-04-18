// Shared table primitives. The 10 data tables across the new tree
// all use almost-identical styles — tableWrap with overflow + border,
// a <table> with collapsed borders, uppercase gray th headers,
// padded td cells with a light bottom border. This primitive exports
// that set as composable React components.
//
// Usage:
//
//   <Table>
//     <thead>
//       <tr><Th>Name</Th><Th>Email</Th></tr>
//     </thead>
//     <tbody>
//       {rows.map(r => (
//         <tr key={r.id}>
//           <Td>{r.name}</Td>
//           <Td>{r.email}</Td>
//         </tr>
//       ))}
//     </tbody>
//   </Table>
//
// Callers that want a different cell style (monospace, numeric,
// muted) just override via the `style` prop on <Td>.

/**
 * Table shell — wraps <table> in an overflow-able bordered container
 * and applies the canonical collapsed-border layout.
 */
export function Table({ children, style, ...rest }) {
  return (
    <div style={S.wrap}>
      <table style={{ ...S.table, ...style }} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, style, ...rest }) {
  return (
    <th style={{ ...S.th, ...style }} {...rest}>
      {children}
    </th>
  );
}

export function Td({ children, style, ...rest }) {
  return (
    <td style={{ ...S.td, ...style }} {...rest}>
      {children}
    </td>
  );
}

const S = {
  wrap: {
    overflowX: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.9rem',
  },
  th: {
    textAlign: 'left',
    padding: '0.5rem 0.75rem',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    color: '#6b7280',
    letterSpacing: '0.025em',
  },
  td: {
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid #f3f4f6',
  },
};
