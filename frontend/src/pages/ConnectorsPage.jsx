import { useCallback, useEffect, useState } from 'react';
import { Cable, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import PageHeader from '../components/ui/PageHeader';
import { TopProgress } from '../components/ui/TopProgress';

function formatBytes(n) {
  const value = Number(n) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function ConnectorsPage() {
  const [summary, setSummary] = useState(null);
  const [sites, setSites] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sitesData, eventsData] = await Promise.all([
        api.get('/api/connectors'),
        api.get('/api/connectors/events?limit=100'),
      ]);
      setSummary(sitesData.summary || null);
      setSites(sitesData.sites || []);
      setEvents(eventsData.events || []);
    } catch (err) {
      setError(err.message || 'Failed to load connector activity');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startRename = (site) => {
    setRenamingId(site.id);
    setRenameValue(site.name || '');
  };

  const saveRename = async (siteId) => {
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/api/connectors/${siteId}`, { name });
      setRenamingId(null);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to rename site');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <TopProgress active={loading} />
      <PageHeader
        icon={Cable}
        title="Connectors"
        subtitle="Sites connected through the REST connector — data sent and last activity."
        actions={
          <button type="button" className="btn ghost btn-icon-text" onClick={load} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {error ? <div className="alert error">{error}</div> : null}

      {summary ? (
        <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
          <div className="stat">
            <div className="stat-top">
              <span>Connected</span>
            </div>
            <strong>{summary.connectedSites.toLocaleString()}</strong>
            <small>Sites via connector</small>
          </div>
          <div className="stat">
            <div className="stat-top">
              <span>Data sent</span>
            </div>
            <strong className="stat-value">{formatBytes(summary.totalBytesSent)}</strong>
            <small>{summary.totalRequests.toLocaleString()} requests</small>
          </div>
          <div className="stat">
            <div className="stat-top">
              <span>Last activity</span>
            </div>
            <strong className="stat-value">{formatWhen(summary.lastActivityAt)}</strong>
            <small>Most recent pull</small>
          </div>
        </div>
      ) : null}

      <section className="panel section-panel">
        <h2>Connected sites</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Each row is a connector consumer identified by its API key. Totals update when IdentitySphere
          (or another client) pulls users or entitlements with that key.
        </p>
        {loading && sites.length === 0 ? (
          <p>Loading…</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>API key</th>
                  <th>Owner</th>
                  <th>Data sent</th>
                  <th>Requests</th>
                  <th>First seen</th>
                  <th>Last sent</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sites.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      No connector activity yet. Generate an API key on My Profile and pull data from
                      IdentitySphere to see connected sites here.
                    </td>
                  </tr>
                ) : (
                  sites.map((site) => (
                    <tr key={site.id}>
                      <td>
                        {renamingId === site.id ? (
                          <input
                            className="input"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(site.id);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            disabled={busy}
                            autoFocus
                          />
                        ) : (
                          site.name
                        )}
                      </td>
                      <td>
                        <code>{site.keyPrefix}…</code>
                      </td>
                      <td>{site.ownerUserLogin || '—'}</td>
                      <td>{formatBytes(site.totalBytesSent)}</td>
                      <td>{site.totalRequests.toLocaleString()}</td>
                      <td>{formatWhen(site.firstSeenAt)}</td>
                      <td>{formatWhen(site.lastSeenAt)}</td>
                      <td>
                        {renamingId === site.id ? (
                          <div className="page-header-actions" style={{ gap: '0.35rem' }}>
                            <button
                              type="button"
                              className="btn primary"
                              disabled={busy}
                              onClick={() => saveRename(site.id)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn ghost"
                              disabled={busy}
                              onClick={() => setRenamingId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button type="button" className="btn ghost" onClick={() => startRename(site)}>
                            Rename
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel section-panel">
        <h2>Recent data sent</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Latest connector pulls — when data left this API, how much, and which path.
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Site</th>
                <th>Method</th>
                <th>Path</th>
                <th>Status</th>
                <th>Data sent</th>
                <th>Records</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7}>No transfers logged yet.</td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id}>
                    <td>{formatWhen(ev.createdAt)}</td>
                    <td>{ev.siteName || '—'}</td>
                    <td>{ev.method}</td>
                    <td>
                      <code>{ev.path}</code>
                    </td>
                    <td>{ev.statusCode}</td>
                    <td>{formatBytes(ev.bytesOut)}</td>
                    <td>{ev.recordCount == null ? '—' : ev.recordCount.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
