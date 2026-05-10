export default function Loading() {
  return (
    <div className="space-y-6 max-w-5xl animate-pulse">
      <div className="h-16 rounded-md bg-bg-surface border border-border" />
      <div className="card p-4 h-32" />
      <div className="card p-4 h-64" />
      <div className="card p-4 h-40" />
    </div>
  );
}
