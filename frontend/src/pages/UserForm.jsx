import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import DynamicForm from '../components/DynamicForm';
import PasswordInput from '../components/PasswordInput';

export default function UserForm() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const [fields, setFields] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  const [password, setPassword] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [attributes, setAttributes] = useState({ status: 'Active', user_type: 'Employee' });
  const [assignedRoles, setAssignedRoles] = useState([]);
  const [roleToAdd, setRoleToAdd] = useState('');
  const [loginId, setLoginId] = useState('');
  const [recordId, setRecordId] = useState(isNew ? null : id);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [schema, rolesData] = await Promise.all([
        api.get('/api/schema/users'),
        api.get('/api/entitlements'),
      ]);
      setFields(schema.fields || []);
      setAllRoles(rolesData.entitlements || rolesData.roles || []);
      if (!isNew) {
        const data = await api.get(`/api/users/${encodeURIComponent(id)}`);
        setLoginId(data.user.userId);
        setRecordId(data.user.id);
        setIsSystemAdmin(Boolean(data.user.isSystemAdmin));
        setAttributes(data.user.attributes || {});
        setAssignedRoles(data.user.roles || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id, isNew]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { isSystemAdmin, attributes };
      if (isNew) {
        body.password = password;
        await api.post('/api/users', body);
        navigate('/users');
      } else {
        if (password) body.password = password;
        await api.put(`/api/users/${recordId || id}`, body);
        navigate(`/users/${recordId || id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const assignRole = async () => {
    if (!roleToAdd || isNew) return;
    try {
      const data = await api.post(`/api/users/${recordId || id}/roles`, { roleId: roleToAdd });
      setAssignedRoles(data.user.roles || []);
      setRoleToAdd('');
    } catch (err) {
      setError(err.message);
    }
  };

  const removeRole = async (roleId) => {
    try {
      const data = await api.del(`/api/users/${recordId || id}/roles/${roleId}`);
      setAssignedRoles(data.user.roles || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const doResetPassword = async () => {
    if (!resetPassword || resetPassword.length < 4) {
      setError('Temporary password must be at least 4 characters');
      return;
    }
    try {
      await api.post(`/api/users/${recordId || id}/reset-password`, { password: resetPassword });
      setResetPassword('');
      setError('');
      alert('Password reset successfully');
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="page"><p>Loading…</p></div>;

  const availableRoles = allRoles.filter(
    (r) => !assignedRoles.some((a) => a.id === r.id)
  );

  const previewId =
    attributes.user_id ||
    ([attributes.first_name, attributes.last_name]
      .filter(Boolean)
      .map((p) => String(p).trim().toLowerCase().replace(/[^a-z0-9]+/g, ''))
      .filter(Boolean)
      .join('.') || '');

  const backTo = isNew ? '/users' : `/users/${encodeURIComponent(recordId || id)}`;

  return (
    <div className="page">
      <header className="page-header row">
        <div>
          <h1>{isNew ? 'Create user' : 'Edit user'}</h1>
          <p>
            User ID is auto-generated as <code>firstname.lastname</code>. Display name and
            timestamps update automatically.
          </p>
        </div>
        <Link className="btn ghost" to={backTo}>
          {isNew ? 'Back' : 'Back to dashboard'}
        </Link>
      </header>
      {error ? <div className="alert error">{error}</div> : null}

      <form className="panel form" onSubmit={onSubmit}>
        <DynamicForm
          fields={fields}
          values={attributes}
          onChange={setAttributes}
          showAutoFields={false}
          systemFields={
            <>
              <div className="form-field">
                <label>User ID (auto)</label>
                <input value={isNew ? previewId || 'firstname.lastname' : loginId} disabled />
              </div>
              <div className="form-field">
                <label htmlFor="password">
                  Password {isNew ? '*' : '(leave blank to keep)'}
                </label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={isNew}
                  minLength={4}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-field">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={isSystemAdmin}
                    onChange={(e) => setIsSystemAdmin(e.target.checked)}
                  />
                  System Admin
                </label>
              </div>
            </>
          }
        />
        <div className="form-actions">
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {!isNew ? (
        <>
          <section className="panel" style={{ marginTop: '1rem' }}>
            <h2>Assign entitlements</h2>
            <div className="chip-row" style={{ marginBottom: '1rem' }}>
              {assignedRoles.length === 0 ? (
                <span className="muted">None assigned</span>
              ) : (
                assignedRoles.map((r) => (
                  <span className="role-chip" key={r.id}>
                    {r.name}
                    <button type="button" className="link danger" onClick={() => removeRole(r.id)}>
                      Remove
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="inline-row">
              <select value={roleToAdd} onChange={(e) => setRoleToAdd(e.target.value)}>
                <option value="">Select entitlement…</option>
                {availableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn primary" onClick={assignRole} disabled={!roleToAdd}>
                Assign
              </button>
            </div>
          </section>

          <section className="panel" style={{ marginTop: '1rem' }}>
            <h2>Reset password</h2>
            <div className="inline-row">
              <PasswordInput
                id="resetPassword"
                placeholder="Temporary password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                minLength={4}
                autoComplete="new-password"
              />
              <button type="button" className="btn ghost" onClick={doResetPassword}>
                Reset password
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
