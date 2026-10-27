import { useEffect, useState } from 'react';
import { api } from '../api/client';

function Row({ label, value, badge }) {
  return (
    <div className="settings-row">
      <span className="muted">{label}</span>
      {badge !== undefined ? (
        <span className={`badge ${badge ? 'ok' : ''}`}>{badge ? 'Configured' : 'Not configured'}</span>
      ) : (
        <code>{value ?? '—'}</code>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState(null);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/api/settings')
      .then((body) => {
        if (!cancelled) setData(body.data || body);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message || 'Failed to load settings');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadToken = async () => {
    setErr('');
    try {
      const body = await api.get('/api/settings/rest-connector/token');
      setToken(body.token || '');
      setShowToken(true);
    } catch (e) {
      setErr(e.message || 'Token not available — set API_BEARER_TOKEN in backend/.env');
    }
  };

  const copyToken = async () => {
    let value = token;
    if (!value) {
      try {
        const body = await api.get('/api/settings/rest-connector/token');
        value = body.token || '';
        setToken(value);
      } catch (e) {
        setErr(e.message || 'Could not load token');
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(value);
      setMsg('Bearer token copied.');
    } catch {
      setErr('Clipboard unavailable');
    }
  };

  const connector = data?.connector || {};
  const application = data?.application || {};
  const database = data?.database || {};
  const restApi = data?.restApi || {};

  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <p>IdentitySphere REST connector — static bearer token (same model as Wisbility HRMS).</p>
      </header>

      {err ? <div className="alert error">{err}</div> : null}
      {msg ? <div className="alert ok">{msg}</div> : null}

      <div className="settings-grid">
        <div className="settings-stack">
          <section className="panel">
            <h2>Application &amp; Database</h2>
            <Row label="Application Name" value={application.name} />
            <Row label="Environment" value={application.environment} />
            <div className="settings-panel-divider" aria-hidden="true" />
            <Row label="Connection Status" badge={Boolean(database.connected)} />
            <Row label="Database" value={database.name} />
            <p className="muted" style={{ marginTop: '0.5rem' }}>
              Set DATABASE_URL in backend/.env. Credentials are never displayed here.
            </p>
          </section>

          <section className="panel">
            <h2>REST API</h2>
            <Row label="Base URL" value={restApi.baseUrl || connector.baseUrl} />
            <Row label="Users Endpoint" value={restApi.usersEndpoint || connector.usersPath} />
            <Row
              label="Entitlements Endpoint"
              value={restApi.entitlementsEndpoint || connector.entitlementsPath}
            />
            <Row label="Authentication" value={restApi.authentication || 'Bearer Token'} />
            <Row label="Bearer Token" badge={Boolean(connector.bearerTokenConfigured)} />
            {connector.bearerTokenConfigured ? (
              <div className="form-actions" style={{ marginTop: '0.75rem' }}>
                <button type="button" className="btn primary" onClick={copyToken}>
                  Copy bearer token
                </button>
                <button type="button" className="btn ghost" onClick={loadToken}>
                  {showToken ? 'Refresh' : 'Show'}
                </button>
              </div>
            ) : (
              <p className="muted">
                Add <code>API_BEARER_TOKEN</code> to <code>backend/.env</code> and restart the server.
              </p>
            )}
            {showToken && token ? (
              <textarea
                readOnly
                rows={2}
                value={token}
                style={{
                  marginTop: '0.75rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  wordBreak: 'break-all',
                  width: '100%',
                }}
              />
            ) : null}
            <Row label="Pagination" value={connector.pagination || restApi.pagination} />
          </section>
        </div>

        <section className="panel">
          <h2>REST Connector Configuration</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Values to enter in IdentitySphere App Registry for this target.
          </p>
          <Row label="Application Name" value={connector.applicationName} />
          <Row label="Base URL" value={connector.baseUrl} />
          <Row label="Users Path" value={connector.usersPath} />
          <Row label="Users JSON Path" value={connector.usersJsonPath} />
          <Row label="Entitlements Path" value={connector.entitlementsPath} />
          <Row label="Entitlements JSON Path" value={connector.entitlementsJsonPath} />
          <Row label="User ID Field" value={connector.userIdField} />
          <Row label="User Name Field" value={connector.userNameField} />
          <Row label="Entitlement ID Field" value={connector.entitlementIdField} />
          <Row label="Entitlement Name Field" value={connector.entitlementNameField} />
          <Row label="Page Parameter" value={connector.pageParameter} />
          <Row label="Page Size Parameter" value={connector.pageSizeParameter} />
          <Row label="Page Size" value={String(connector.pageSize ?? 100)} />
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            Auth type: <strong>Bearer</strong>. Token: the static value from{' '}
            <code>API_BEARER_TOKEN</code> — not a session JWT, not a regenerating API key.
          </p>
        </section>
      </div>
    </div>
  );
}
