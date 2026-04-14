// Root placeholder for the rebuild tree. Users routed here by the
// middleware (ui_version='next') see this page until Phase 2 fills in
// the rebuilt root. See docs/architecture-plan.md §3.6.

export default async function NextTreeRootPlaceholder() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Studyworks (rebuild preview)</h1>
      <p>
        You are on the rebuild tree. Phase 1 is foundation work — the new
        pages land in Phase 2. If you reached this page by accident, an
        admin can flip your account back to the legacy tree.
      </p>
    </main>
  );
}
