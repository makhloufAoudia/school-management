export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-48 rounded-md bg-slate-200 dark:bg-slate-800" />
        <div className="h-9 w-36 rounded-md bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="mb-4 h-9 w-56 rounded-md bg-slate-200 dark:bg-slate-800" />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="h-11 border-b border-slate-100 dark:border-slate-800" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-6 border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-800"
          >
            <div className="h-4 w-1/6 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-1/6 rounded bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-4 w-1/4 rounded bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-4 w-1/6 rounded bg-slate-100 dark:bg-slate-800/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
