// Hand-written declarations for the untyped Table.js primitives so
// .tsx consumers get optional props (TS infers destructured JS props
// as required otherwise). Keep in sync with Table.js — three thin
// wrappers that accept anything their underlying element accepts.

import type { CSSProperties, ReactElement, ReactNode } from 'react';

interface TablePrimitiveProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  [attr: string]: unknown;
}

export declare function Table(props: TablePrimitiveProps): ReactElement;
export declare function Th(props: TablePrimitiveProps): ReactElement;
export declare function Td(props: TablePrimitiveProps): ReactElement;
