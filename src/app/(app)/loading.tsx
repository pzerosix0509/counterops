export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-md border bg-card" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-md border bg-card" />
    </div>
  );
}
