export function SkeletonTableRows({
  rows = 5,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-gray-100 dark:border-gray-800">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-6 py-3">
              <div
                className="skeleton-shimmer h-4 rounded"
                style={{ width: `${60 + ((r * cols + c) % 5) * 8}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-gray-900 rounded-xl shadow p-4"
        >
          <div className="skeleton-shimmer h-3 rounded w-20 mb-3" />
          <div className="skeleton-shimmer h-8 rounded w-12" />
        </div>
      ))}
    </>
  );
}

export function SkeletonDetailPage() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <div className="skeleton-shimmer h-4 rounded w-16" />
        <div className="skeleton-shimmer h-7 rounded w-48" />
        <div className="skeleton-shimmer h-5 rounded-full w-20" />
      </div>
      <div className="grid grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 rounded-xl shadow p-4"
          >
            <div className="skeleton-shimmer h-3 rounded w-16 mb-3" />
            <div className="skeleton-shimmer h-8 rounded w-10" />
          </div>
        ))}
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="skeleton-shimmer h-5 rounded w-32" />
        </div>
        <table className="w-full text-sm">
          <tbody>
            <SkeletonTableRows rows={6} cols={6} />
          </tbody>
        </table>
      </div>
    </main>
  );
}
