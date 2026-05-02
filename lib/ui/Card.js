// Padded, bordered container with a tinted background. The pattern
// {padding, background, border, borderRadius} was inlined in at
// least ten places across the new tree before this primitive
// collapsed it.
//
// Tones (color tokens come from app/styles/next-tokens.css):
//   tone="soft"    (default) — slate-50 background, plain border
//   tone="danger"             — red callout (errors)
//   tone="warn"               — amber callout (cautions, "not adaptive")
//   tone="info"               — accent callout (active session, banners)
//   tone="success"            — green callout (done, submitted)
//   tone="blank"              — transparent, just the border

import s from './Card.module.css';

const TONE_CLASSES = {
  soft:    s.soft,
  danger:  s.danger,
  warn:    s.warn,
  info:    s.info,
  success: s.success,
  blank:   s.blank,
};

/**
 * @param {object} props
 * @param {'soft'|'danger'|'warn'|'info'|'success'|'blank'} [props.tone='soft']
 * @param {string}                          [props.className]
 * @param {React.CSSProperties}            [props.style]
 * @param {React.ReactNode}                props.children
 */
export function Card({ tone = 'soft', className, style, children, ...rest }) {
  const toneCls = TONE_CLASSES[tone] ?? TONE_CLASSES.soft;
  const cls = [s.base, toneCls, className].filter(Boolean).join(' ');
  return (
    <div className={cls} style={style} {...rest}>
      {children}
    </div>
  );
}
