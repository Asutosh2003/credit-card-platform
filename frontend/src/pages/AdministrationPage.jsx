import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Database,
  FileKey2,
  Info,
  LockKeyhole,
  Pencil,
  Plus,
  SlidersHorizontal,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api } from '../api/client';

const DATA_TYPES = [
  { value: 'string', label: 'Text' },
  { value: 'dropdown', label: 'Dropdown (select list)' },
  { value: 'integer', label: 'Integer' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'boolean', label: 'Boolean (checkbox)' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'timestamp', label: 'Timestamp' },
];

const emptyForm = {
  columnName: '',
  displayName: '',
  dataType: 'string',
  length: '',
  required: false,
  isPrimaryKey: false,
  options: [],
};

function normalizeOptions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((o) => String(o).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[\n,]/)
      .map((o) => o.trim())
      .filter(Boolean);
  }
  return [];
}

function OptionsEditor({ options, onChange, disabled }) {
  const [draft, setDraft] = useState('');

  const addOption = () => {
    const value = draft.trim();
    if (!value) return;
    if (options.includes(value)) {
      setDraft('');
      return;
    }
    onChange([...options, value]);
    setDraft('');
  };

  const removeOption = (value) => {
    onChange(options.filter((o) => o !== value));
  };

  return (
    <div className={`options-editor ${disabled ? 'disabled' : ''}`}>
      <div className="options-editor-head">
        <strong>Dropdown options</strong>
        <span className="muted">Add values users can select</span>
      </div>
      {options.length === 0 ? (
        <p className="muted options-empty">No options yet. Add at least one.</p>
      ) : (
        <ul className="options-chips">
          {options.map((opt) => (
            <li key={opt}>
              <span>{opt}</span>
              {!disabled ? (
                <button type="button" className="chip-remove" onClick={() => removeOption(opt)} aria-label={`Remove ${opt}`}>
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!disabled ? (
        <div className="options-add-row">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type an option and press Add"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addOption();
              }
            }}
          />
          <button type="button" className="btn ghost btn-icon-text" onClick={addOption} disabled={!draft.trim()}>
            <Plus size={16} aria-hidden="true" />
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function AdministrationPage() {
  const [tab, setTab] = useState('users');
  const entityPath = tab === 'users' ? 'users' : 'entitlements';
  const [fields, setFields] = useState([]);
  const [fixedColumns, setFixedColumns] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const editorRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/api/schema/${entityPath}`);
      setFields(data.fields || []);
      setFixedColumns(data.fixedColumns || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setForm(emptyForm);
    setEditingId(null);
    setEditorOpen(false);
    load();
  }, [tab]);

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setEditorOpen(false);
  };

  const openNewColumn = () => {
    setEditingId(null);
    setForm(emptyForm);
    setEditorOpen(true);
    focusEditor();
  };

  const focusEditor = () => {
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const startEdit = (field) => {
    setEditingId(field.id);
    setEditorOpen(true);
    setForm({
      columnName: field.columnName,
      displayName: field.displayName,
      dataType: field.dataType,
      length: field.length ?? '',
      required: field.required,
      isPrimaryKey: Boolean(field.isPrimaryKey),
      options: normalizeOptions(field.options),
    });
    focusEditor();
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const options = form.dataType === 'dropdown' ? form.options : [];
    if (form.dataType === 'dropdown' && options.length === 0) {
      setError('Dropdown fields need at least one option. Use Add under Dropdown options.');
      setSaving(false);
      return;
    }
    const payload = {
      columnName: form.columnName.trim(),
      displayName: form.displayName.trim(),
      dataType: form.dataType,
      length: form.length === '' ? null : Number(form.length),
      required: form.isPrimaryKey ? true : form.required,
      isPrimaryKey: form.isPrimaryKey,
      options,
    };
    try {
      if (editingId) {
        await api.put(`/api/schema/${entityPath}/${editingId}`, payload);
      } else {
        await api.post(`/api/schema/${entityPath}`, payload);
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (field) => {
    if (!window.confirm(`Delete column "${field.displayName}"? Forms will stop using it.`)) {
      return;
    }
    try {
      await api.del(`/api/schema/${entityPath}/${field.id}`);
      if (editingId === field.id) cancelEdit();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const setDataType = (dataType) => {
    setForm((prev) => ({
      ...prev,
      dataType,
      options: dataType === 'dropdown' ? prev.options : [],
    }));
  };

  const editingField = fields.find((f) => f.id === editingId);
  const isDropdown = form.dataType === 'dropdown';
  const autoFieldCount = fields.filter((field) => field.isAuto).length;
  const dropdownCount = fields.filter((field) => field.dataType === 'dropdown').length;
  const requiredCount = fields.filter((field) => field.required).length;
  const entityLabel = tab === 'users' ? 'user' : 'entitlement';

  return (
    <div className="page administration-page">
      <header className="page-header admin-header">
        <div className="page-header-text">
          <div className="page-header-icon admin-header-icon">
            <Settings2 size={23} aria-hidden="true" />
          </div>
          <div>
            <div className="eyebrow">Workspace configuration</div>
            <h1>Administration</h1>
            <p>Shape the fields your team sees across create and edit forms.</p>
          </div>
        </div>
        <div className="admin-header-note">
          <ShieldCheck size={17} aria-hidden="true" />
          <span>Changes apply to new forms immediately</span>
        </div>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="admin-toolbar">
        <div className="tabs admin-tabs" role="tablist" aria-label="Schema type">
        <button
          type="button"
          className={tab === 'users' ? 'tab active' : 'tab'}
          onClick={() => setTab('users')}
          role="tab"
          aria-selected={tab === 'users'}
        >
          <Database size={16} aria-hidden="true" />
          User columns
        </button>
        <button
          type="button"
          className={tab === 'entitlements' ? 'tab active' : 'tab'}
          onClick={() => setTab('entitlements')}
          role="tab"
          aria-selected={tab === 'entitlements'}
        >
          <FileKey2 size={16} aria-hidden="true" />
          Entitlement columns
        </button>
        </div>
        <span className="admin-toolbar-caption">Managing {entityLabel} schema</span>
      </div>

      <div className="admin-stats" aria-label="Schema summary">
        <div className="admin-stat">
          <span className="admin-stat-icon blue"><Database size={17} aria-hidden="true" /></span>
          <span><strong>{fields.length}</strong><small>Configurable fields</small></span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-icon teal"><ShieldCheck size={17} aria-hidden="true" /></span>
          <span><strong>{requiredCount}</strong><small>Required fields</small></span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-icon gold"><ChevronRight size={17} aria-hidden="true" /></span>
          <span><strong>{dropdownCount}</strong><small>Dropdown lists</small></span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-icon slate"><LockKeyhole size={17} aria-hidden="true" /></span>
          <span><strong>{autoFieldCount}</strong><small>System-managed</small></span>
        </div>
      </div>

      <div className="split">
        <section className="panel admin-fields-panel">
          <div className="panel-head admin-panel-head">
            <div>
              <div className="section-kicker"><Database size={14} aria-hidden="true" /> Schema fields</div>
              <h2>{tab === 'users' ? 'User columns' : 'Entitlement columns'}</h2>
              <p className="panel-subtitle">These fields power your {entityLabel} forms.</p>
            </div>
            <span className="field-count">{fields.length} total</span>
          </div>

          <div className="fixed-cols admin-help-card">
            <div className="admin-help-icon"><Info size={18} aria-hidden="true" /></div>
            <div>
              <strong>Build smarter select fields</strong>
              <ol className="help-steps">
                <li><span>1</span> Edit an existing column or create a new one.</li>
                <li><span>2</span> Choose <strong>Dropdown</strong> as the data type.</li>
                <li><span>3</span> Add the values your team can select.</li>
              </ol>
            </div>
            {tab === 'users' ? (
              <p className="muted admin-help-footnote">
                Auto fields (user id, timestamps, failed login) stay system-managed.
              </p>
            ) : (
              <ul className="admin-fixed-list">
                {fixedColumns.map((c) => (
                  <li key={c.columnName}>
                    <code>{c.columnName}</code> — {c.displayName}
                    <span className="muted"> ({c.note})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {loading ? (
            <p>Loading…</p>
          ) : fields.length === 0 ? (
            <div className="empty-state">No configurable columns yet. Add one on the right.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Display</th>
                    <th>Type</th>
                    <th>Options</th>
                    <th>Required</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => {
                    const opts = normalizeOptions(field.options);
                    const isDd = field.dataType === 'dropdown';
                    return (
                      <tr key={field.id} className={editingId === field.id ? 'row-editing' : ''}>
                        <td>
                          <div className="column-name-cell"><code>{field.columnName}</code>
                          {field.isAuto ? <span className="badge-auto">auto</span> : null}
                          {field.isPrimaryKey ? <span className="badge-pk">pk</span> : null}
                          </div>
                        </td>
                        <td><strong className="display-name">{field.displayName}</strong></td>
                        <td>
                          {isDd ? <span className="type-pill"><ChevronRight size={12} aria-hidden="true" /> dropdown</span> : <span className="data-type-label">{field.dataType}</span>}
                        </td>
                        <td className="options-cell">
                          {isDd && opts.length ? (
                            <span title={opts.join(', ')}>{opts.join(', ')}</span>
                          ) : isDd ? (
                            <span className="warn-text">No options — edit to add</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{field.required ? <span className="required-state"><Check size={13} aria-hidden="true" /> Required</span> : <span className="muted">Optional</span>}</td>
                        <td className="actions">
                          <button type="button" className="link action-button" onClick={() => startEdit(field)}>
                            <Pencil size={14} aria-hidden="true" />
                            Edit
                          </button>
                          {!field.isAuto ? (
                            <button
                              type="button"
                              className="link danger action-button"
                              onClick={() => onDelete(field)}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              Delete
                            </button>
                          ) : (
                            <span className="muted">locked</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          className={`panel column-editor ${editingId ? 'is-editing' : ''} ${editorOpen ? 'is-open' : 'is-closed'}`}
          ref={editorRef}
          id="column-editor"
        >
          {!editorOpen ? (
            <div className="editor-launcher">
              <div className="editor-launcher-icon"><Plus size={22} aria-hidden="true" /></div>
              <div className="section-kicker">Schema builder</div>
              <h2>Add a new field</h2>
              <p>Create a field once and it becomes available across your {entityLabel} forms.</p>
              <button type="button" className="btn primary btn-icon-text editor-launch-button" onClick={openNewColumn}>
                <Plus size={17} aria-hidden="true" />
                Add new column
              </button>
              <div className="editor-launcher-footer">
                <span><SlidersHorizontal size={14} aria-hidden="true" /> {fields.length} fields configured</span>
                <span><LockKeyhole size={14} aria-hidden="true" /> System fields protected</span>
              </div>
            </div>
          ) : (
            <>
              <div className="editor-heading">
                <div className="editor-heading-icon">{editingId ? <Pencil size={18} aria-hidden="true" /> : <Plus size={19} aria-hidden="true" />}</div>
                <div>
                  <div className="section-kicker">{editingId ? 'Update schema' : 'New field'}</div>
                  <h2>{editingId ? `Edit ${editingField?.displayName || form.displayName}` : 'Add column'}</h2>
                </div>
                <button type="button" className="icon-button editor-close-button" onClick={cancelEdit} aria-label="Close editor" title="Close editor">
                  ×
                </button>
              </div>
              {editingId ? (
                <div className="edit-banner">
                  <Pencil size={15} aria-hidden="true" />
                  Editing <code>{form.columnName}</code>. Update the field details below.
                </div>
              ) : null}
              <form className="form-stack" onSubmit={onSubmit}>
            <label htmlFor="columnName">Column name</label>
            <input
              id="columnName"
              value={form.columnName}
              onChange={(e) => setForm({ ...form, columnName: e.target.value })}
              placeholder="e.g. region"
              required
              disabled={Boolean(editingId)}
            />
            <label htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              required
            />
            <label htmlFor="dataType">Data type</label>
            <select
              id="dataType"
              value={form.dataType}
              onChange={(e) => setDataType(e.target.value)}
              disabled={Boolean(editingField?.isAuto)}
            >
              {DATA_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            {isDropdown ? (
              <OptionsEditor
                options={form.options}
                onChange={(options) => setForm({ ...form, options })}
                disabled={Boolean(editingField?.isAuto)}
              />
            ) : (
              <div className="options-hint">
                To show a select list on forms, change Data type to{' '}
                <button type="button" className="link" onClick={() => setDataType('dropdown')}>
                  Dropdown (select list)
                </button>
                .
              </div>
            )}

            {!isDropdown ? (
              <>
                <label htmlFor="length">Length</label>
                <input
                  id="length"
                  type="number"
                  min="1"
                  value={form.length}
                  onChange={(e) => setForm({ ...form, length: e.target.value })}
                />
              </>
            ) : null}

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isPrimaryKey}
                disabled={Boolean(editingField?.isAuto)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    isPrimaryKey: e.target.checked,
                    required: e.target.checked ? true : form.required,
                  })
                }
              />
              Primary key (always unique)
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isPrimaryKey || form.required}
                disabled={form.isPrimaryKey || Boolean(editingField?.isAuto)}
                onChange={(e) => setForm({ ...form, required: e.target.checked })}
              />
              Required
            </label>
            <div className="form-actions">
              {editingId ? (
                <button type="button" className="btn ghost" onClick={cancelEdit}>
                  Cancel
                </button>
              ) : null}
                <button className="btn primary btn-icon-text" type="submit" disabled={saving}>
                {!saving ? (editingId ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />) : null}
                {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
