// Root of the rebuild tree. See docs/architecture-plan.md §3.6.
//
// During Phase 1 this is an empty pass-through layout. Everything still
// inherits from `app/layout.js` (the top-level root layout), so the HTML
// shell, font loading, and global CSS are unchanged. As Phase 2 fills in
// the rebuilt pages, this layout becomes the natural home for next-tree-
// specific providers, error boundaries, and shared UI chrome.
//
// Nobody reaches this tree unless the middleware rewrites their URL, and
// the middleware only rewrites when the user is explicitly on
// `ui_version='next'` (or the feature_flags kill switch has been flipped
// to force 'next'). Internal accounts only, until the tree has content.

export const metadata = {
  title: 'Studyworks',
};

export default async function NextTreeLayout({ children }) {
  return children;
}
