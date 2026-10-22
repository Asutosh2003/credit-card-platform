import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import DynamicForm from '../components/DynamicForm';

export default function RolesPage() {
  const { id } = useParams();
  const isForm = Boolean(id);
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [fields, setFields] = useState([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [attributes, setAttributes] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [list, schema] = await Promise.all([
        api.get('/api/entitlements'),
        api.get('/api/schema/entitlements'),
      ]);
      setRoles(list.entitlements || list.roles || []);
      setFields(schema.fields || []);
      if (isForm && !isNew) {
        const one = await api.get(`/api/entitlements/${id}`);
        const ent = one.entitlement || one.role;
        setName(ent.name || '');
        setCode(ent.code || '');
        if (ent.attributes && typeof ent.attributes === 'object') {
          setAttributes(ent.attributes);
        } else {
          const reserved = new Set([
            'id',
            'name',
            'code',
            'assignmentCount',
            'createdAt',
            'updatedAt',
          ]);
          const flat = {};
          for (const [k, v] of Object.entries(ent)) {
            if (!reserved.has(k)) flat[k] = v;
          }
          setAttributes(flat);
        }
      } else if (isNew) {
        setName('');
        setCode('');
        setAttributes({});
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const columns = useMemo(() => {
    const dynamic = fields.map((f) => ({ key: f.columnName, label: f.displayName }));
    return [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      ...dynamic,
      { key: 'assignmentCount', label: 'Assigned' },
    ];
  }, [fields]);

  const getCell = (row, key) => {
    if (key === 'code') return <code>{row.code}</code>;
    if (key === 'name') return row.name;
    if (key === 'assignmentCount') {
      const n = row.assignmentCount ?? 0;
      return n === 0 ? <span className="warn-text">Unassigned</span> : String(n);
    }
    const val = row[key] ?? row.attributes?.[key];
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (key === 'owner' && (val === null || val === undefined || val === '')) {
      return <span className="warn-text">Missing owner</span>;
    }
    if (val === null || val === undefined || val === '') return '—';
    return String(val);
  };

  const onDelete = async (role) => {
    if (!window.confirm(`Delete entitlement "${role.name}"?`)) return;
    try {
      await api.del(`/api/entitlements/${role.id}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { name, attributes };
      if (code.trim()) body.code = code.trim();
      if (isNew) {
        await api.post('/api/entitlements', body);
      } else {
        await api.put(`/api/entitlements/${id}`, body);
      }
      navigate('/entitlements');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (isForm) {
    return (
      <div className="page">
        <header className="page-header row">
          <div>
            <h1>{isNew ? 'Create entitlement' : 'Edit entitlement'}</h1>
            <p>ID and Name are fixed fields. Other columns come from Administration.</p>
          </div>
          <Link className="btn ghost" to="/entitlements">
            Back
          </Link>
        </header>
        {error ? <div className="alert error">{error}</div> : null}
        {loading ? (
          <p>Loading…</p>
        ) : (
          <form className="panel form" onSubmit={onSubmit}>
            <DynamicForm
              fields={fields}
              values={attributes}
              onChange={setAttributes}
              systemFields={
                <>
                  {!isNew ? (
                    <div className="form-field">
                      <label>ID (fixed)</label>
                      <input value={id} disabled />
                    </div>
                  ) : null}
                  <div className="form-field">
                    <label htmlFor="name">Name *</label>
                    <input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="code">Code (optional, auto from name)</label>
                    <input
                      id="code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="CREDIT_ANALYST"
                      disabled={!isNew}
                    />
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
        )}
      </div>
    );
  }

  const missingOwner = roles.filter((r) => {
    const owner = r.owner ?? r.attributes?.owner;
    return !owner && owner !== 0;
  }).length;
  const unassigned = roles.filter((r) => (r.assignmentCount ?? 0) === 0).length;

  return (
    <div className="page">
      <header className="page-header row">
        <div>
          <h1>Entitlements</h1>
          <p>
            {roles.length} entitlements · {missingOwner} missing owner · {unassigned} unassigned
          </p>
        </div>
        <Link className="btn primary" to="/entitlements/new">
          Create
        </Link>
      </header>
      {error ? <div className="alert error">{error}</div> : null}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className="table-wrap panel">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1}>No entitlements yet.</td>
                </tr>
              ) : (
                roles.map((role) => (
                  <tr key={role.id}>
                    {columns.map((col) => (
                      <td key={col.key}>{getCell(role, col.key)}</td>
                    ))}
                    <td className="actions">
                      <Link to={`/entitlements/${role.id}`}>Edit</Link>
                      <button
                        type="button"
                        className="link danger"
                        onClick={() => onDelete(role)}
                      >
                        Delete
                      </button>
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
