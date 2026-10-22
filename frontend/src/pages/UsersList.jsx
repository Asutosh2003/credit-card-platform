import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search, Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import DynamicTable from '../components/DynamicTable';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import { TableSkeleton } from '../components/ui/Skeleton';
import { TopProgress } from '../components/ui/TopProgress';

const PAGE_SIZES = [10, 25, 50, 100];

function buildPageList(current, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set([1, totalPages, current, current - 1, current + 1]);
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (current >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }
  return [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
}

export default function UsersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1));
  const [limit, setLimit] = useState(() => {
    const n = Number(searchParams.get('limit')) || 25;
    return PAGE_SIZES.includes(n) ? n : 25;
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ] = useState(() => searchParams.get('q') || '');
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') || '');
  const [filter, setFilter] = useState(() => searchParams.get('filter') || '');

  const syncUrl = (next) => {
    const params = {};
    if (next.page && next.page > 1) params.page = String(next.page);
    if (next.limit && next.limit !== 25) params.limit = String(next.limit);
    if (next.q) params.q = next.q;
    if (next.filter) params.filter = next.filter;
    setSearchParams(params);
  };

  useEffect(() => {
    const urlFilter = searchParams.get('filter') || '';
    const urlQ = searchParams.get('q') || '';
    const urlPage = Math.max(1, Number(searchParams.get('page')) || 1);
    const urlLimit = Number(searchParams.get('limit')) || 25;
    setFilter(urlFilter);
    setQ(urlQ);
    setSearchInput(urlQ);
    setPage(urlPage);
    setLimit(PAGE_SIZES.includes(urlLimit) ? urlLimit : 25);
  }, [searchParams]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (q) params.set('q', q);
      if (filter) params.set('filter', filter);
      const u = await api.get(`/api/users?${params.toString()}`);
      setUsers(u.users || []);
      setTotal(u.total || 0);
      setTotalPages(u.totalPages || 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, q, filter, limit]);

  const columns = useMemo(
    () => [
      { key: 'userId', label: 'User ID' },
      { key: 'display_name', label: 'Name' },
      { key: 'department', label: 'Department' },
      { key: 'manager_id', label: 'Manager ID' },
      { key: 'manager_name', label: 'Manager Name' },
      { key: 'status', label: 'Status' },
      { key: 'entitlements', label: 'Entitlements' },
    ],
    []
  );

  const getCell = (row, key) => {
    const field = (k) =>
      row[k] !== undefined && row[k] !== null && row[k] !== ''
        ? row[k]
        : row.attributes?.[k];

    if (key === 'userId') {
      return (
        <Link className="manager-link" to={`/users/${encodeURIComponent(row.userId)}`}>
          <code className="cell-code">{row.userId}</code>
        </Link>
      );
    }
    if (key === 'status') {
      return <StatusBadge status={field('status') || row.systemStatus || row.status} />;
    }
    if (key === 'display_name') {
      return (
        <Link className="manager-link" to={`/users/${encodeURIComponent(row.userId)}`}>
          {field('display_name') || row.userId}
        </Link>
      );
    }
    if (key === 'department') return field('department') || '—';
    if (key === 'manager_id') {
      const mid = field('manager_id');
      if (!mid) return <span className="muted">—</span>;
      return (
        <Link className="manager-link" to={`/users/${encodeURIComponent(mid)}`}>
          <code className="cell-code">{mid}</code>
        </Link>
      );
    }
    if (key === 'manager_name') {
      const mid = field('manager_id');
      const mname = field('manager_name');
      if (!mid && !mname) return <span className="muted">—</span>;
      if (!mid) return mname;
      return (
        <Link className="manager-link" to={`/users/${encodeURIComponent(mid)}`}>
          {mname || mid}
        </Link>
      );
    }
    if (key === 'entitlements') {
      const n = row.roleCount ?? (row.roles || []).length;
      return n === 0 ? <span className="warn-text">None</span> : <span className="ent-count">{n}</span>;
    }
    const val = field(key);
    return val === null || val === undefined || val === '' ? '—' : String(val);
  };

  const onDelete = async (row) => {
    if (!window.confirm(`Delete user ${row.userId}?`)) return;
    try {
      await api.del(`/api/users/${row.id}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleStatus = async (row) => {
    try {
      const sys = row.systemStatus || row.status;
      if (sys === 'active') {
        await api.post(`/api/users/${row.id}/disable`, {});
      } else {
        await api.post(`/api/users/${row.id}/enable`, {});
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const onSearch = (e) => {
    e.preventDefault();
    const nextQ = searchInput.trim();
    syncUrl({ page: 1, limit, q: nextQ, filter });
  };

  const onFilterChange = (value) => {
    syncUrl({ page: 1, limit, q, filter: value });
  };

  const goPage = (nextPage) => {
    syncUrl({ page: nextPage, limit, q, filter });
  };

  const onLimitChange = (value) => {
    syncUrl({ page: 1, limit: Number(value), q, filter });
  };

  const pageList = buildPageList(page, totalPages);

  return (
    <div className="page page-wide">
      <TopProgress active={loading} />
      <PageHeader
        icon={Users}
        title="Users"
        subtitle={`${total.toLocaleString()} employees — manager hierarchy, filters for gaps.`}
        actions={
          <Link className="btn primary btn-icon-text" to="/users/new">
            <Plus size={18} aria-hidden="true" />
            Create user
          </Link>
        }
      />
      {error ? <div className="alert error">{error}</div> : null}

      <div className="panel toolbar-panel">
        <form className="toolbar-row" onSubmit={onSearch}>
          <div className="input-icon-wrap toolbar-search">
            <Search size={18} className="input-icon" aria-hidden="true" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search user id, name, manager, department…"
              aria-label="Search users"
            />
          </div>
          <button className="btn primary btn-icon-text" type="submit">
            <Search size={16} aria-hidden="true" />
            Search
          </button>
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            aria-label="Filter users"
          >
            <option value="">All users</option>
            <option value="no_manager">No manager</option>
            <option value="no_entitlement">No entitlements</option>
          </select>
          <select
            value={limit}
            onChange={(e) => onLimitChange(e.target.value)}
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </form>
      </div>

      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : (
        <>
          <DynamicTable
            columns={columns}
            rows={users}
            getCell={getCell}
            emptyMessage="No users match this page/filter."
            actions={(row) => (
              <>
                <Link to={`/users/${row.id}`}>Dashboard</Link>
                <Link to={`/users/${row.id}/edit`}>Edit</Link>
                <button type="button" className="link" onClick={() => toggleStatus(row)}>
                  {(row.systemStatus || row.status) === 'active' ? 'Disable' : 'Enable'}
                </button>
                {!row.isSystemAdmin ? (
                  <button type="button" className="link danger" onClick={() => onDelete(row)}>
                    Delete
                  </button>
                ) : null}
              </>
            )}
          />
          <div className="pager">
            <button
              type="button"
              className="btn ghost btn-icon-text"
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Previous
            </button>
            <div className="pager-pages">
              {pageList.map((p, idx) => {
                const prev = pageList[idx - 1];
                const showEllipsis = prev && p - prev > 1;
                return (
                  <span key={p} className="pager-page-wrap">
                    {showEllipsis ? <span className="muted">…</span> : null}
                    <button
                      type="button"
                      className={p === page ? 'btn primary pager-page' : 'btn ghost pager-page'}
                      onClick={() => goPage(p)}
                    >
                      {p}
                    </button>
                  </span>
                );
              })}
            </div>
            <span className="muted pager-meta">{total.toLocaleString()} total</span>
            <button
              type="button"
              className="btn ghost btn-icon-text"
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
            >
              Next
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
