import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken, setToken } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const [fields, setFields] = useState([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [apiToken, setApiToken] = useState(() => getToken() || '');
  const [showToken, setShowToken] = useState(false);
  const [tokenMsg, setTokenMsg] = useState('');
  const [tokenErr, setTokenErr] = useState('');
  const [tokenBusy, setTokenBusy] = useState(false);

  useEffect(() => {
    api
      .get('/api/schema/users')
      .then((data) => setFields(data.fields || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setApiToken(getToken() || '');
  }, [user]);

  const changePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword });
      setMessage('Password changed.');
      setCurrentPassword('');
      setNewPassword('');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const copyToken = async () => {
    setTokenErr('');
    setTokenMsg('');
    if (!apiToken) {
      setTokenErr('No session token.');
      return;
    }
    try {
      await navigator.clipboard.writeText(apiToken);
      setTokenMsg('Session token copied (UI login only — not for IdentitySphere).');
    } catch {
      setTokenErr('Clipboard unavailable');
    }
  };

  const refreshToken = async () => {
    setTokenBusy(true);
    setTokenErr('');
    setTokenMsg('');
    try {
      const data = await api.post('/api/auth/refresh', {});
      if (data.token) {
        setToken(data.token);
        setApiToken(data.token);
        setTokenMsg('Session refreshed.');
      }
    } catch (err) {
      setTokenErr(err.message || 'Refresh failed');
    } finally {
      setTokenBusy(false);
    }
  };

  const attrs = user?.attributes || {};
  const isAdmin = Boolean(user?.isSystemAdmin);

  return (
    <div className="page">
      <header className="page-header">
        <h1>My Profile</h1>
        <p>Your account details and assigned entitlements.</p>
      </header>

      <section className="panel" style={{ marginBottom: '1rem' }}>
        <h2>Account</h2>
        <dl className="detail-list">
          <div>
            <dt>User ID</dt>
            <dd>{user?.userId}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{user?.status}</dd>
          </div>
          <div>
            <dt>System Admin</dt>
            <dd>{user?.isSystemAdmin ? 'Yes' : 'No'}</dd>
          </div>
          {fields
            .filter((f) => !f.isAuto)
            .map((f) => (
              <div key={f.id}>
                <dt>{f.displayName}</dt>
                <dd>
                  {attrs[f.columnName] === undefined ||
                  attrs[f.columnName] === null ||
                  attrs[f.columnName] === ''
                    ? '—'
                    : String(attrs[f.columnName])}
                </dd>
              </div>
            ))}
        </dl>
      </section>

      <section className="panel" style={{ marginBottom: '1rem' }}>
        <h2>Assigned entitlements</h2>
        <div className="chip-row">
          {(user?.roles || []).length === 0 ? (
            <span className="muted">None</span>
          ) : (
            user.roles.map((r) => (
              <span className="role-chip" key={r.id}>
                {r.name}
                <small>{r.code}</small>
              </span>
            ))
          )}
        </div>
      </section>

      {isAdmin ? (
        <section className="panel" style={{ marginBottom: '1rem' }}>
          <h2>IdentitySphere connector</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Loan Hub uses a <strong>static bearer token</strong> from{' '}
            <code>API_BEARER_TOKEN</code> in <code>backend/.env</code> — the same model as
            Wisbility HRMS. No regenerating API keys or session JWTs for provisioning.
          </p>
          <p>
            <Link to="/settings">Open Settings</Link> to copy the static bearer and connector
            field values for IdentitySphere App Registry.
          </p>
        </section>
      ) : null}

      {isAdmin ? (
        <section className="panel" style={{ marginBottom: '1rem' }}>
          <h2>UI session token</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Session JWT for this browser login only. It expires. Do <strong>not</strong> paste it
            into IdentitySphere.
          </p>
          {tokenErr ? <div className="alert error">{tokenErr}</div> : null}
          {tokenMsg ? <div className="alert ok">{tokenMsg}</div> : null}
          <label htmlFor="apiAccessToken">Current session token</label>
          <textarea
            id="apiAccessToken"
            readOnly
            rows={3}
            value={showToken ? apiToken : apiToken ? '•'.repeat(Math.min(apiToken.length, 64)) : ''}
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              wordBreak: 'break-all',
            }}
          />
          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="btn ghost" onClick={copyToken} disabled={!apiToken}>
              Copy token
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setShowToken((v) => !v)}
              disabled={!apiToken}
            >
              {showToken ? 'Hide' : 'Show'}
            </button>
            <button type="button" className="btn ghost" onClick={refreshToken} disabled={tokenBusy}>
              {tokenBusy ? 'Refreshing…' : 'Refresh token'}
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h2>Change password</h2>
        {error ? <div className="alert error">{error}</div> : null}
        {message ? <div className="alert ok">{message}</div> : null}
        <form onSubmit={changePassword} className="form-grid">
          <label htmlFor="currentPassword">Current password</label>
          <PasswordInput
            id="currentPassword"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <label htmlFor="newPassword">New password</label>
          <PasswordInput
            id="newPassword"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <div className="form-actions">
            <button type="submit" className="btn primary">
              Update password
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
