// Ambient type declarations for assets that are resolved by the
// bundler at runtime, not by TypeScript. Without these, importing a
// CSS module from a .ts/.tsx file (vs .js/.jsx, which doesn't go
// through TS) trips TS2307. Next.js synthesizes equivalent
// declarations during `next build` via .next/types/global.d.ts, but
// `tsc --noEmit` can't see those, so we restate them here.

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
