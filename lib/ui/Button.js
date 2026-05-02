// Shared button primitive. Handles the four visual variants
// that recur across the new tree:
//
//   primary   — accent CTA ("Save", "Create", "Assign", form submits)
//   secondary — outlined neutral ("Cancel", passive actions)
//   danger    — solid amber ("Delete user", promote-to-admin,
//               irreversible actions that need weight without screaming)
//   remove    — small red-outline inline action ("Remove", "Revoke",
//               "Clear") — lighter than danger, used in rows
//
// Two sizes: md (default) and sm. Disabled state is visually
// handled in CSS via the :disabled pseudoclass — callers just
// pass `disabled`, not a conditional background color.
//
// Polymorphic: pass `href` to render as a Next.js <Link>; otherwise
// you get a <button>. Same styles either way.

import Link from 'next/link';
import s from './Button.module.css';

const VARIANT_CLASS = {
  primary:   s.primary,
  secondary: s.secondary,
  danger:    s.danger,
  remove:    s.remove,
};

const SIZE_CLASS = {
  sm: s.sm,
  md: s.md,
};

/**
 * @param {object} props
 * @param {'primary'|'secondary'|'danger'|'remove'} [props.variant='primary']
 * @param {'sm'|'md'}                                [props.size='md']
 * @param {string}                                    [props.href]     - renders as <Link> (or <a> if `external`) when set
 * @param {boolean}                                   [props.external] - with href: render a plain <a> for full-page navigation (e.g. cross-tree legacy routes)
 * @param {boolean}                                   [props.disabled]
 * @param {string}                                    [props.className]
 * @param {React.CSSProperties}                       [props.style]    - merged over the variant style
 * @param {React.ReactNode}                           props.children
 * @param {...object}                                 rest             - passed through (type, onClick, form, etc.)
 */
export function Button({
  variant = 'primary',
  size = 'md',
  href,
  external = false,
  disabled = false,
  className,
  style,
  children,
  ...rest
}) {
  const variantClass = VARIANT_CLASS[variant] ?? VARIANT_CLASS.primary;
  const sizeClass = SIZE_CLASS[size] ?? SIZE_CLASS.md;
  const cls = [s.base, sizeClass, variantClass, className]
    .filter(Boolean)
    .join(' ');

  if (href && !disabled) {
    if (external) {
      return (
        <a href={href} className={cls} style={style} {...rest}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={cls} style={style} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={rest.type ?? 'button'}
      disabled={disabled}
      className={cls}
      style={style}
      {...rest}
    >
      {children}
    </button>
  );
}
