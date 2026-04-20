// Shared button primitive. Handles the four visual variants
// that recur across the new tree:
//
//   primary   — blue CTA ("Save", "Create", "Assign", form submits)
//   secondary — outlined neutral ("Cancel", passive actions)
//   danger    — solid amber/orange ("Delete user", promote-to-admin,
//               irreversible actions that need weight)
//   remove    — small red-outline inline action ("Remove", "Revoke",
//               "Clear") — lighter than danger, used in rows
//
// Two sizes: md (default) and sm. Disabled state is visually
// handled here — callers just pass `disabled`, not a conditional
// background color.
//
// Polymorphic: pass `href` to render as a Next.js <Link>; otherwise
// you get a <button>. Same styles either way. The usual button
// attributes (type, onClick, disabled, form, ...) are passed
// through to the underlying element.

import Link from 'next/link';

const VARIANTS = {
  primary: {
    base: {
      background: '#2563eb',
      color: 'white',
      border: 'none',
    },
    disabled: {
      background: '#9ca3af',
      color: 'white',
    },
  },
  secondary: {
    base: {
      background: 'transparent',
      color: '#6b7280',
      border: '1px solid #d1d5db',
    },
    disabled: {
      color: '#d1d5db',
      borderColor: '#e5e7eb',
    },
  },
  danger: {
    base: {
      background: '#b45309',
      color: 'white',
      border: 'none',
    },
    disabled: {
      background: '#d6b88a',
      color: 'white',
    },
  },
  remove: {
    base: {
      background: 'transparent',
      color: '#b91c1c',
      border: '1px solid #fecaca',
    },
    disabled: {
      color: '#fca5a5',
      borderColor: '#fee2e2',
    },
  },
};

const SIZES = {
  sm: {
    padding: '0.25rem 0.6rem',
    fontSize: '0.75rem',
    borderRadius: 4,
  },
  md: {
    padding: '0.5rem 1rem',
    fontSize: '0.9rem',
    borderRadius: 6,
    fontWeight: 600,
  },
};

/**
 * @param {object} props
 * @param {'primary'|'secondary'|'danger'|'remove'} [props.variant='primary']
 * @param {'sm'|'md'}                                [props.size='md']
 * @param {string}                                    [props.href]     - renders as <Link> (or <a> if `external`) when set
 * @param {boolean}                                   [props.external] - with href: render a plain <a> for full-page navigation (e.g. cross-tree legacy routes)
 * @param {boolean}                                   [props.disabled]
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
  style,
  children,
  ...rest
}) {
  const variantStyle = VARIANTS[variant] ?? VARIANTS.primary;
  const sizeStyle = SIZES[size] ?? SIZES.md;

  const composedStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none',
    fontFamily: 'inherit',
    lineHeight: 1.2,
    ...sizeStyle,
    ...variantStyle.base,
    ...(disabled ? variantStyle.disabled : null),
    ...style,
  };

  if (href && !disabled) {
    if (external) {
      return (
        <a href={href} style={composedStyle} {...rest}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} style={composedStyle} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={rest.type ?? 'button'}
      disabled={disabled}
      style={composedStyle}
      {...rest}
    >
      {children}
    </button>
  );
}
