'use client';
export default function Toast({ kind = 'info', message }) {
  if (!message) return null;
  const border = kind === 'ok' ? 'rgba(52,211,153,0.5)' : kind === 'danger' ? 'rgba(251,113,133,0.6)' : 'rgba(148,163,184,0.25)';
  return (
    <div className="toast" style={{ borderColor: border, marginTop: 12 }}>
      <span className="small">{message}</span>
    </div>
  );
}
