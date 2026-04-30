// Shared table primitives. The data tables across the new tree
// all use the same canonical styles — bordered wrap, collapsed
// borders, uppercase fg3 th headers, padded td cells. Token-
// mapped so the table chrome matches the rest of the new tree.
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

import s from './Table.module.css';

export function Table({ children, className, style, ...rest }) {
  const cls = [s.wrap, className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <table className={s.table} style={style} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className, style, ...rest }) {
  const cls = [s.th, className].filter(Boolean).join(' ');
  return (
    <th className={cls} style={style} {...rest}>
      {children}
    </th>
  );
}

export function Td({ children, className, style, ...rest }) {
  const cls = [s.td, className].filter(Boolean).join(' ');
  return (
    <td className={cls} style={style} {...rest}>
      {children}
    </td>
  );
}
