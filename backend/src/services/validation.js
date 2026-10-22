const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_TYPES = new Set([
  "string",
  "integer",
  "decimal",
  "boolean",
  "date",
  "email",
  "timestamp",
  "dropdown",
]);

function isValidColumnName(name) {
  return typeof name === "string" && /^[a-z][a-z0-9_]*$/.test(name);
}

function normalizeOptions(raw) {
  if (raw === undefined || raw === null || raw === "") return [];
  if (Array.isArray(raw)) {
    return raw.map((o) => String(o).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[\n,]/)
      .map((o) => o.trim())
      .filter(Boolean);
  }
  return [];
}

function fieldOptions(field) {
  return normalizeOptions(field?.options);
}

function validateFieldDefinition(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.columnName !== undefined) {
    if (!isValidColumnName(body.columnName)) {
      errors.push(
        "columnName must be snake_case starting with a letter (e.g. first_name)"
      );
    } else {
      data.columnName = body.columnName;
    }
  }

  if (!partial || body.displayName !== undefined) {
    if (!body.displayName || typeof body.displayName !== "string") {
      errors.push("displayName is required");
    } else {
      data.displayName = body.displayName.trim();
    }
  }

  if (!partial || body.dataType !== undefined) {
    if (!ALLOWED_TYPES.has(body.dataType)) {
      errors.push(`dataType must be one of: ${[...ALLOWED_TYPES].join(", ")}`);
    } else {
      data.dataType = body.dataType;
    }
  }

  if (body.length !== undefined && body.length !== null && body.length !== "") {
    const len = Number(body.length);
    if (!Number.isInteger(len) || len < 1) {
      errors.push("length must be a positive integer");
    } else {
      data.length = len;
    }
  } else if (!partial) {
    data.length = null;
  }

  if (body.required !== undefined) {
    data.required = Boolean(body.required);
  } else if (!partial) {
    data.required = false;
  }

  if (body.isPrimaryKey !== undefined) {
    data.isPrimaryKey = Boolean(body.isPrimaryKey);
  } else if (!partial) {
    data.isPrimaryKey = false;
  }

  if (body.isAuto !== undefined) {
    data.isAuto = Boolean(body.isAuto);
  } else if (!partial) {
    data.isAuto = false;
  }

  if (body.options !== undefined) {
    data.options = normalizeOptions(body.options);
  } else if (!partial) {
    data.options = [];
  }

  const typeForOptions = data.dataType;
  if (typeForOptions === "dropdown") {
    const opts = data.options !== undefined ? data.options : normalizeOptions(body.options);
    if (!opts || opts.length === 0) {
      errors.push("dropdown fields require at least one option");
    }
  }

  if (data.isPrimaryKey) {
    data.required = true;
  }

  if (body.sortOrder !== undefined) {
    const order = Number(body.sortOrder);
    if (!Number.isInteger(order)) {
      errors.push("sortOrder must be an integer");
    } else {
      data.sortOrder = order;
    }
  }

  return { errors, data };
}

function coerceValue(value, dataType) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  switch (dataType) {
    case "integer": {
      const n = Number(value);
      if (!Number.isInteger(n)) throw new Error("must be an integer");
      return n;
    }
    case "decimal": {
      const n = Number(value);
      if (Number.isNaN(n)) throw new Error("must be a decimal number");
      return n;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === "1" || value === 1) return true;
      if (value === "false" || value === "0" || value === 0) return false;
      throw new Error("must be a boolean");
    case "date": {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new Error("must be a valid date");
      return value;
    }
    case "timestamp": {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new Error("must be a valid timestamp");
      return new Date(value).toISOString();
    }
    case "email": {
      const s = String(value).trim();
      if (!EMAIL_RE.test(s)) throw new Error("must be a valid email");
      return s;
    }
    case "dropdown":
    case "string":
    default:
      if (Array.isArray(value)) {
        return value.map((v) => String(v)).filter((v) => v.length > 0);
      }
      return String(value);
  }
}

function validateAttributes(attributes, fields) {
  const errors = [];
  const cleaned = {};
  const input = attributes && typeof attributes === "object" ? attributes : {};

  for (const field of fields) {
    // Auto fields are filled by server functions — skip client required checks
    if (field.isAuto) {
      const raw = input[field.columnName];
      if (raw !== undefined && raw !== null && raw !== "") {
        try {
          cleaned[field.columnName] = coerceValue(raw, field.dataType);
        } catch {
          // ignore invalid client-provided auto values; server will overwrite
        }
      }
      continue;
    }

    const raw = input[field.columnName];
    const missing = raw === undefined || raw === null || raw === "";

    if (missing) {
      if (field.required) {
        errors.push(`${field.displayName} is required`);
      }
      continue;
    }

    try {
      const value = coerceValue(raw, field.dataType);
      if (
        value !== null &&
        field.length &&
        typeof value === "string" &&
        value.length > field.length
      ) {
        errors.push(
          `${field.displayName} must be at most ${field.length} characters`
        );
        continue;
      }
      if (
        value !== null &&
        field.length &&
        Array.isArray(value) &&
        JSON.stringify(value).length > field.length
      ) {
        errors.push(
          `${field.displayName} must be at most ${field.length} characters`
        );
        continue;
      }
      // Dropdown options are UI hints only — accept any value so connector /
      // as-is payloads (any department, user_type, etc.) are not rejected.
      cleaned[field.columnName] = value;
    } catch (err) {
      errors.push(`${field.displayName} ${err.message}`);
    }
  }

  return { errors, cleaned };
}

function slugifyCode(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function validateRoleBody(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.name !== undefined) {
    if (!body.name || typeof body.name !== "string") {
      errors.push("name is required");
    } else {
      data.name = body.name.trim();
    }
  }

  if (body.code !== undefined && String(body.code).trim() !== "") {
    const code = String(body.code).trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(code)) {
      errors.push(
        "code must start with a letter and contain only letters, numbers, and underscores"
      );
    } else {
      data.code = code;
    }
  } else if (!partial && data.name) {
    data.code = slugifyCode(data.name).toUpperCase();
  }

  return { errors, data };
}

module.exports = {
  ALLOWED_TYPES,
  validateFieldDefinition,
  validateAttributes,
  validateRoleBody,
  slugifyCode,
  isValidColumnName,
  normalizeOptions,
};
