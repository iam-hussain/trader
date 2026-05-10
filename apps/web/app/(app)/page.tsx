export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <button className="btn btn-primary">Run Morning Brief</button>
      </header>

      <div className="grid grid-cols-3 gap-4">
        {(["Pre-market", "Mid-day", "Post-market"] as const).map((s) => (
          <section key={s} className="card p-4">
            <div className="text-xs uppercase tracking-wide text-fg-muted">{s}</div>
            <div className="mt-2 text-fg-muted text-sm">Not run yet.</div>
          </section>
        ))}
      </div>

      <section className="card p-4">
        <div className="text-sm text-fg-muted">
          Phase 1 dashboard. Live regime, signals, and positions land in Phase 3 + 4.
        </div>
      </section>
    </div>
  );
}
