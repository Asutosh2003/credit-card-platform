export function Skeleton({ className = '', style }) {
  return <div className={`skeleton ${className}`.trim()} style={style} aria-hidden="true" />;
}

export function StatSkeletonGrid({ count = 4 }) {
  return (
    <div className="stat-grid">
      {Array.from({ length: count }, (_, i) => (
        <div className="stat stat-skeleton" key={i}>
          <Skeleton className="sk-line sk-sm" />
          <Skeleton className="sk-line sk-lg" />
          <Skeleton className="sk-line sk-md" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="table-skeleton panel">
      <div className="table-skeleton-head">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="sk-line sk-sm" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div className="table-skeleton-row" key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="sk-line" />
          ))}
        </div>
      ))}
    </div>
  );
}
