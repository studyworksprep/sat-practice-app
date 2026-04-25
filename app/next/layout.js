// Root of the rebuild tree. See docs/architecture-plan.md §3.6.
//
// Responsibilities:
//   1. Import the new-tree design-system tokens + prose rules.
//      Tokens are declared on [data-tree="next"] so they don't
//      leak into legacy pages, which still carry their own :root
//      variables with overlapping names (--bg, --card, --border,
//      --s1..5, etc.).
//   2. Wrap children in <div data-tree="next"> so the tokens
//      resolve via the attribute selector. Every new-tree
//      component that reads `var(--…)` gets the token from this
//      scope.
//
// Phase 6 (legacy retirement) will flip the tokens back to :root
// and drop this wrapping div; the `data-tree` attribute becomes
// a no-op we can remove.
//
// Nobody reaches this tree unless the middleware rewrites their
// URL, and the middleware only rewrites when the user is
// explicitly on ui_version='next' (or the feature_flags kill
// switch has forced everyone to 'next'). Internal accounts only
// until feature parity is reached.

import '../styles/next-tokens.css';
import '../styles/next-prose.css';

export const metadata = {
  title: 'Studyworks',
};

export default async function NextTreeLayout({ children }) {
  return <div data-tree="next">{children}</div>;
}
