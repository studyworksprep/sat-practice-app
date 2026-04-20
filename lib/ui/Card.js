// Padded, bordered container with a light-gray background. The
// pattern {padding: 1rem, background: #f9fafb, border, borderRadius}
// is inlined in at least ten places across the new tree — one for
// each "section in a dashboard" or "summary panel". This primitive
// collapses that to a one-liner.
//
// Two tones:
//   tone="soft"   (default) — light gray background, plain border
//   tone="danger"           — light red background, red-tinted border
//                             (used for error callouts)
//   tone="warn"             — amber/yellow callout (also used in a few
//                             places for "not adaptive" + "promotion" hints)
//   tone="info"             — blue callout ("you have an active session",
//                             informational banners)
//   tone="success"          — green callout ("done", "submitted", etc.)
//   tone="blank"            — no background, just the border

const TONES = {
  soft:    { background: '#f9fafb', border: '1px solid #e5e7eb', color: '#111827' },
  danger:  { background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' },
  warn:    { background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e' },
  info:    { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a' },
  success: { background: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534' },
  blank:   { background: 'transparent', border: '1px solid #e5e7eb', color: '#111827' },
};

/**
 * @param {object} props
 * @param {'soft'|'danger'|'warn'|'info'|'success'|'blank'} [props.tone='soft']
 * @param {React.CSSProperties}            [props.style]
 * @param {React.ReactNode}                props.children
 * @param {...object}                      rest  - forwarded to the <div> (role, id, etc.)
 */
export function Card({ tone = 'soft', style, children, ...rest }) {
  const t = TONES[tone] ?? TONES.soft;
  return (
    <div
      style={{
        padding: '1rem',
        borderRadius: 8,
        ...t,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
