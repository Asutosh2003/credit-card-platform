export default function DynamicForm({
  fields,
  values,
  onChange,
  systemFields,
  readOnlyFields = [],
  showAutoFields = false,
}) {
  const handleField = (columnName, value) => {
    onChange({ ...values, [columnName]: value });
  };

  const AUTO_COLUMNS = new Set([
    'user_id',
    'display_name',
    'created_date',
    'updated_date',
    'password_last_changed',
    'memberofentitlement',
  ]);

  const isAutoField = (f) => Boolean(f.isAuto) || AUTO_COLUMNS.has(f.columnName);
  const editableFields = (fields || []).filter((f) => !isAutoField(f));
  const autoFields = showAutoFields
    ? (fields || []).filter((f) => isAutoField(f))
    : [];

  function fieldOptions(field) {
    if (Array.isArray(field.options)) {
      return field.options.map((o) => String(o).trim()).filter(Boolean);
    }
    if (typeof field.options === 'string' && field.options.trim()) {
      return field.options
        .split(/[\n,]/)
        .map((o) => o.trim())
        .filter(Boolean);
    }
    return [];
  }

  function renderInput(field, readOnly = false) {
    const id = `field-${field.columnName}`;
    const value = values[field.columnName] ?? '';
    const label = `${field.displayName}${field.required && !readOnly ? ' *' : ''}${readOnly ? ' (auto)' : ''}`;
    const options = fieldOptions(field);
    const isDropdown = field.dataType === 'dropdown' || options.length > 0;

    if (field.dataType === 'boolean') {
      return (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={Boolean(values[field.columnName])}
            disabled={readOnly}
            onChange={(e) => {
              if (!readOnly) handleField(field.columnName, e.target.checked);
            }}
          />
          {label}
        </label>
      );
    }

    if (isDropdown) {
      return (
        <>
          <label htmlFor={id}>{label}</label>
          <select
            id={id}
            value={value || ''}
            disabled={readOnly || options.length === 0}
            required={!readOnly && field.required}
            onChange={(e) => handleField(field.columnName, e.target.value)}
          >
            <option value="">
              {options.length === 0
                ? 'No options configured'
                : field.required
                  ? 'Select…'
                  : '—'}
            </option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {options.length === 0 ? (
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              Add options in Administration
            </span>
          ) : null}
        </>
      );
    }

    let inputType = 'text';
    let step;
    if (field.dataType === 'integer' || field.dataType === 'decimal') {
      inputType = 'number';
      step = field.dataType === 'decimal' ? '0.01' : '1';
    } else if (field.dataType === 'date') {
      inputType = 'date';
    } else if (field.dataType === 'email') {
      inputType = 'email';
    }

    return (
      <>
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          name={field.columnName}
          type={inputType}
          step={step}
          required={!readOnly && field.required}
          disabled={readOnly}
          value={value}
          maxLength={field.length || undefined}
          placeholder={field.dataType === 'timestamp' ? 'ISO timestamp' : undefined}
          onChange={(e) => {
            if (!readOnly) handleField(field.columnName, e.target.value);
          }}
        />
      </>
    );
  }

  return (
    <div className="form-grid">
      {systemFields}
      {editableFields.map((field) => (
        <div className="form-field" key={field.id || field.columnName}>
          {renderInput(field, readOnlyFields.includes(field.columnName))}
        </div>
      ))}
      {autoFields.map((field) => (
        <div className="form-field" key={field.id || field.columnName}>
          {renderInput(field, true)}
        </div>
      ))}
    </div>
  );
}
