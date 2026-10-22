import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function AuditPage() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get('/api/audit');
        setEvents(data.events || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const checkApi = async () => {
    setChecking(true);
    setHealthError('');
    setHealth(null);
    try {
      setHealth(await api.get('/api/health'));
    } catch (err) {
      setHealthError(err.message || 'API not reachable');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Audit</h1>
        <p>API health check and recent administrative events.</p>
      </header>

      <section className="panel api-panel">
        <div className="panel-head">
          <div>
            <h2>REST API status</h2>
            <p className="muted">JSON over HTTP — GET, POST, PUT, PATCH, DELETE.</p>
          </div>
          <button type="button" className="btn primary" onClick={checkApi} disabled={checking}>
            {checking ? 'Checking…' : 'Check API'}
          </button>
        </div>
        {healthError ? <div className="alert error">{healthError}</div> : null}
        {health ? (
          <div className="alert ok">
            REST API is up — {health.name || health.service} ({health.status})
          </div>
        ) : null}
        <p className="muted tip">
          Browser check: <code>http://localhost:4000/api/health</code>
        </p>
      </section>

      {error ? <div className="alert error">{error}</div> : null}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className="table-wrap panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5}>No audit events yet.</td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.createdAt).toLocaleString()}</td>
                    <td>{e.actorUserLogin || '—'}</td>
                    <td>{e.action}</td>
                    <td>
                      {e.entityType}
                      {e.entityId ? ` / ${e.entityId.slice(0, 8)}…` : ''}
                    </td>
                    <td>
                      <code>{JSON.stringify(e.details || {})}</code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
