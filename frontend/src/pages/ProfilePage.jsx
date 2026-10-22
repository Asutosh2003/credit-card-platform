import { useEffect, useState } from 'react';
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
  const [apiKeyMeta, setApiKeyMeta] = useState({ configured: false, prefix: null, createdAt: null });
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyMsg, setApiKeyMsg] = useState('');
  const [apiKeyErr, setApiKeyErr] = useState('');
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const [bearerToken, setBearerToken] = useState('');
  const [bearerTokenErr, setBearerTokenErr] = useState('');
  const [bearerTokenMsg, setBearerTokenMsg] = useState('');
  const [bearerTokenBusy, setBearerTokenBusy] = useState(false);

  useEffect(() => {
    api
      .get('/api/schema/users')
      .then((data) => setFields(data.fields || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setApiToken(getToken() || '');
  }, [user]);

  useEffect(() => {
    if (!user?.isSystemAdmin) return undefined;
    let cancelled = false;
    api
      .get('/api/auth/api-key')
      .then((data) => {
        if (!cancelled) {
          setApiKeyMeta({
            configured: Boolean(data.configured),
            prefix: data.prefix || null,
            createdAt: data.createdAt || null,
          });
          if (data.apiKey) {
            setApiKeyValue(data.apiKey);
            setShowApiKey(false);
          } else {
            setApiKeyValue('');
            setShowApiKey(false);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setApiKeyErr(err.message || 'Could not load API key.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user?.isSystemAdmin) return undefined;
    let cancelled = false;
    api
      .get('/api/auth/bearer-token')
      .then((data) => {
        if (!cancelled) setBearerToken(data.token || '');
      })
      .catch((err) => {
        if (!cancelled) setBearerTokenErr(err.message || 'Could not load bearer token.');
      });
    return () => {
      cancelled = true;
    };
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
    const value = apiToken || getToken() || '';
    if (!value) {
      setTokenErr('No token available. Sign in again.');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setTokenMsg('Token copied. Paste it into the IdentitySphere Bearer token field.');
    } catch {
      setTokenErr('Clipboard blocked — select the token and copy manually (Ctrl+C).');
      setShowToken(true);
    }
  };

  const refreshToken = async () => {
    setTokenBusy(true);
    setTokenErr('');
    setTokenMsg('');
    try {
      const data = await api.post('/api/auth/refresh', {});
      if (data?.token) {
        setToken(data.token);
        setApiToken(data.token);
        setTokenMsg(
          `New token issued (expires in ${data.expiresIn || 'session'}). Copy it again for IdentitySphere.`
        );
      } else {
        setTokenErr('Refresh did not return a token.');
      }
      await refresh();
    } catch (err) {
      setTokenErr(err.message || 'Could not refresh token.');
    } finally {
      setTokenBusy(false);
    }
  };

  const generateApiKey = async () => {
    setApiKeyBusy(true);
    setApiKeyErr('');
    setApiKeyMsg('');
    try {
      const data = await api.post('/api/auth/api-key', {});
      setApiKeyValue(data.apiKey || '');
      setShowApiKey(true);
      setApiKeyMeta({
        configured: true,
        prefix: data.prefix || null,
        createdAt: new Date().toISOString(),
      });
      setApiKeyMsg(data.message || 'API key generated. You can copy or show it anytime.');
    } catch (err) {
      setApiKeyErr(err.message || 'Could not generate API key.');
    } finally {
      setApiKeyBusy(false);
    }
  };

  const copyApiKey = async () => {
    setApiKeyErr('');
    setApiKeyMsg('');
    if (!apiKeyValue) {
      setApiKeyErr(
        apiKeyMeta.configured
          ? 'This older API key cannot be recovered. Regenerate it to store a value you can show or copy later.'
          : 'Generate an API key first, then copy it.'
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(apiKeyValue);
      setApiKeyMsg('API key copied. Paste it into the IdentitySphere Bearer token field.');
    } catch {
      setApiKeyErr('Clipboard blocked — select the key and copy manually (Ctrl+C).');
      setShowApiKey(true);
    }
  };

  const toggleShowApiKey = () => {
    setApiKeyErr('');
    setApiKeyMsg('');
    if (!apiKeyValue) {
      setShowApiKey(false);
      setApiKeyErr(
        apiKeyMeta.configured
          ? 'This older API key cannot be recovered. Regenerate it to store a value you can show or copy later.'
          : 'Generate an API key first, then show it here.'
      );
      return;
    }
    setShowApiKey((visible) => !visible);
  };

  const revokeApiKey = async () => {
    if (!window.confirm('Revoke the current API key? IdentitySphere will stop working until you generate a new one.')) {
      return;
    }
    setApiKeyBusy(true);
    setApiKeyErr('');
    setApiKeyMsg('');
    try {
      await api.del('/api/auth/api-key');
      setApiKeyValue('');
      setShowApiKey(false);
      setApiKeyMeta({ configured: false, prefix: null, createdAt: null });
      setApiKeyMsg('API key revoked.');
    } catch (err) {
      setApiKeyErr(err.message || 'Could not revoke API key.');
    } finally {
      setApiKeyBusy(false);
    }
  };

  const generateBearerToken = async () => {
    setBearerTokenBusy(true);
    setBearerTokenErr('');
    setBearerTokenMsg('');
    try {
      const data = await api.post('/api/auth/bearer-token', {});
      setBearerToken(data.token || '');
      setBearerTokenMsg('Bearer token regenerated. Existing integrations must be updated.');
    } catch (err) {
      setBearerTokenErr(err.message || 'Could not generate bearer token.');
    } finally {
      setBearerTokenBusy(false);
    }
  };

  const copyBearerToken = async () => {
    setBearerTokenErr('');
    setBearerTokenMsg('');
    if (!bearerToken) {
      setBearerTokenErr('Generate a bearer token first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(bearerToken);
      setBearerTokenMsg('Bearer token copied. Use it in the Authorization: Bearer header.');
    } catch {
      setBearerTokenErr('Clipboard blocked — select the token and copy manually (Ctrl+C).');
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
          <h2>Persistent bearer token</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Does not expire and is stored outside the database, so database migrations and reseeding do not invalidate it. It remains the same until you regenerate it. Keep it secret.
          </p>
          {bearerTokenErr ? <div className="alert error">{bearerTokenErr}</div> : null}
          {bearerTokenMsg ? <div className="alert ok">{bearerTokenMsg}</div> : null}
          <label htmlFor="persistentBearerToken">Bearer token</label>
          <textarea
            id="persistentBearerToken"
            readOnly
            rows={3}
            placeholder="Click Generate bearer token"
            value={bearerToken}
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              wordBreak: 'break-all',
            }}
          />
          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="btn primary" onClick={generateBearerToken} disabled={bearerTokenBusy}>
              {bearerTokenBusy ? 'Working…' : bearerToken ? 'Regenerate bearer token' : 'Generate bearer token'}
            </button>
            <button type="button" className="btn ghost" onClick={copyBearerToken} disabled={!bearerToken}>
              Copy bearer token
            </button>
          </div>
        </section>
      ) : null}

      {isAdmin ? (
        <section className="panel" style={{ marginBottom: '1rem' }}>
          <h2>REST API access token</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Session JWT (expires). Prefer the API key below for IdentitySphere.
          </p>
          {tokenErr ? <div className="alert error">{tokenErr}</div> : null}
          {tokenMsg ? <div className="alert ok">{tokenMsg}</div> : null}
          <label htmlFor="apiAccessToken">Current session token</label>
          <textarea
            id="apiAccessToken"
            readOnly
            rows={4}
            value={showToken ? apiToken : apiToken ? '•'.repeat(Math.min(apiToken.length, 64)) : ''}
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              wordBreak: 'break-all',
            }}
          />
          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="btn primary" onClick={copyToken} disabled={!apiToken}>
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

      {isAdmin ? (
        <section className="panel" style={{ marginBottom: '1rem' }}>
          <h2>REST API key</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Long-lived key for IdentitySphere. Paste into the Bearer token field (or use{' '}
            <code>X-API-Key</code>). Does not expire until you revoke or regenerate it.
          </p>
          {apiKeyErr ? <div className="alert error">{apiKeyErr}</div> : null}
          {apiKeyMsg ? <div className="alert ok">{apiKeyMsg}</div> : null}
          <dl className="detail-list" style={{ marginBottom: '0.75rem' }}>
            <div>
              <dt>Status</dt>
              <dd>{apiKeyMeta.configured ? 'Configured' : 'Not created'}</dd>
            </div>
            <div>
              <dt>Prefix</dt>
              <dd>
                <code>{apiKeyMeta.prefix || '—'}</code>
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>
                {apiKeyMeta.createdAt
                  ? new Date(apiKeyMeta.createdAt).toLocaleString()
                  : '—'}
              </dd>
            </div>
          </dl>
          <label htmlFor="restApiKey">API key</label>
          <textarea
            id="restApiKey"
            readOnly
            rows={3}
            placeholder={
              apiKeyMeta.configured && !apiKeyValue
                ? 'This older key cannot be recovered. Regenerate it once to store a value you can show or copy later.'
                : 'Click Generate API key'
            }
            value={
              showApiKey
                ? apiKeyValue
                : apiKeyValue
                  ? '•'.repeat(Math.min(apiKeyValue.length, 48))
                  : ''
            }
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              wordBreak: 'break-all',
            }}
          />
          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="btn primary" onClick={generateApiKey} disabled={apiKeyBusy}>
              {apiKeyBusy ? 'Working…' : apiKeyMeta.configured ? 'Regenerate API key' : 'Generate API key'}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={copyApiKey}
            >
              Copy API key
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={toggleShowApiKey}
            >
              {showApiKey ? 'Hide' : 'Show'}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={revokeApiKey}
              disabled={apiKeyBusy || !apiKeyMeta.configured}
            >
              Revoke
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h2>Change password</h2>
        {error ? <div className="alert error">{error}</div> : null}
        {message ? <div className="alert ok">{message}</div> : null}
        <form className="form-stack" onSubmit={changePassword}>
          <label htmlFor="currentPassword">Current password</label>
          <PasswordInput
            id="currentPassword"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <label htmlFor="newPassword">New password</label>
          <PasswordInput
            id="newPassword"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={4}
            autoComplete="new-password"
            required
          />
          <div className="form-actions">
            <button className="btn primary" type="submit">
              Update password
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
