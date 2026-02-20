export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h1 className="text-2xl font-semibold">Question Bank Overview</h1>
        <p className="text-zinc-600 mt-2">
          Use filters to choose a set of questions, then click a domain/topic to
          open the practice browser.
        </p>
      </div>

      <div className="card p-6">
        <p className="text-sm text-zinc-600">
          Next: we’ll build the overview grid (domain/skill counts) and the
          filter panel, powered by <code>/api/overview</code>.
        </p>
      </div>
    </div>
  );
}
