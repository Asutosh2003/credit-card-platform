import EmptyState from './ui/EmptyState';

export default function DynamicTable({
  columns,
  rows,
  getCell,
  actions,
  emptyMessage = 'No records found.',
}) {
  if (!rows.length) {
    return <EmptyState title="No results" message={emptyMessage} />;
  }

  return (
    <div className="table-wrap panel table-panel">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
            {actions ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((col) => (
                <td key={col.key}>{getCell(row, col.key)}</td>
              ))}
              {actions ? <td className="actions">{actions(row)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
