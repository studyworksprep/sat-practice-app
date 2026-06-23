// Type surface for the shared Button primitive (implemented in
// Button.js). The runtime component spreads `...rest` onto the
// underlying <button> or <Link>, so consumers can pass native button
// attributes (type, onClick, form, aria-*, …) alongside the variant
// props. This declaration makes that documented passthrough visible
// to TypeScript callers.

import type { ButtonHTMLAttributes, ReactElement } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'remove';
  size?: 'sm' | 'md';
  /** Renders as a Next.js <Link> (or plain <a> when `external`). */
  href?: string;
  external?: boolean;
};

export function Button(props: ButtonProps): ReactElement;
