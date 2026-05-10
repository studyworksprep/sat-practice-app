// Marketing-tour layout. The /features/* slideshow pages live in
// the legacy tree (the proxy keeps them tree-agnostic so a next-
// default user clicking through actually reaches them), but we
// want them styled with the next-tree design language so the
// brand reads consistently from landing → features → app.
//
// The mechanism: import the next-tree token sheet here and add a
// data-tree="next" wrapper. Tokens are scoped to that attribute
// in next-tokens.css, so they resolve for everything inside this
// subtree without leaking to the rest of the legacy tree (which
// still has its own overlapping :root variables).

import '../styles/next-tokens.css';

export default function FeaturesLayout({ children }) {
  return <div data-tree="next">{children}</div>;
}
