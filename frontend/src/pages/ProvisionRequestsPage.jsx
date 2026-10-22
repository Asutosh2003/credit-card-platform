import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import PageHeader from '../components/ui/PageHeader';
import { TopProgress } from '../components/ui/TopProgress';

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function ProvisionRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/api/provision/requests?status=all');
      setRequests(data.requests || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to load provision history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <TopProgress active={loading} />
      <PageHeader
        icon={ClipboardList}
        title="Provision history"
        subtitle="Connector (IdentitySphere) joiners — auto-accepted. View only."
        actions={
          <button type="button" className="btn ghost btn-icon-text" onClick={load} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {error ? <div className="alert error">{error}</div> : null}

      <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="stat">
          <div className="stat-top"><span>Connector provisions</span></div>
          <strong>{total.toLocaleString()}</strong>
          <small>From IdentitySphere / API key</small>
        </div>
      </div>

      <section className="panel section-panel">
        <div className="panel-head" style={{ marginBottom: '0.75rem' }}>
          <h2>History</h2>
        </div>

        {loading && requests.length === 0 ? (
          <p>Loading…</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No connector provision history yet.</td>
                  </tr>
                ) : (
                  requests.map((r) => (
                    <tr key={r.id}>
                      <td>{formatWhen(r.requestedAt)}</td>
                      <td>
                        <code>{r.targetUserLogin}</code>
                      </td>
                      <td>{r.displayName || '—'}</td>
                      <td>{r.email || '—'}</td>
                      <td>{r.department || '—'}</td>
                      <td>
                        <Link
                          className="manager-link"
                          to={`/users/${encodeURIComponent(r.targetUserLogin)}`}
                        >
                          View user
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
