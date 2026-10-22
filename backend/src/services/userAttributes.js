function normalizePart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Build login/user id as firstname.lastname */
function buildUserIdFromNames(attrs = {}) {
  const first = normalizePart(attrs.first_name);
  const last = normalizePart(attrs.last_name);
  if (!first || !last) return null;
  return `${first}.${last}`;
}

function buildDisplayName(attrs = {}) {
  return [attrs.first_name, attrs.last_name].filter(Boolean).join(" ").trim() || null;
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Apply auto-managed user attribute values.
 * Schema auto fields: user_id, display_name, created_date, updated_date,
 * password_last_changed, memberofentitlement (synced from roles).
 * Internal (not schema columns): last_login_date, failed_login_count — kept for auth.
 */
function applyAutoUserAttributes(
  inputAttrs = {},
  {
    isCreate = false,
    existingAttrs = {},
    passwordChanged = false,
  } = {}
) {
  const next = { ...(existingAttrs || {}), ...(inputAttrs || {}) };

  const explicitLogin = String(
    inputAttrs.user_id || inputAttrs.username || ""
  ).trim();
  const generatedId = buildUserIdFromNames(next);
  if (generatedId) {
    if (explicitLogin) {
      next.user_id = explicitLogin;
      if (!next.username) next.username = explicitLogin;
    } else {
      next.user_id = generatedId;
      if (!next.username) {
        next.username = generatedId;
      }
    }
  } else if (explicitLogin) {
    next.user_id = explicitLogin;
    if (!next.username) next.username = explicitLogin;
  }

  next.display_name = buildDisplayName(next) || next.user_id || null;

  const now = nowIso();
  if (isCreate) {
    next.created_date = now;
    next.failed_login_count = 0;
    next.password_last_changed = now;
    next.last_login_date = null;
    if (!Array.isArray(next.memberofentitlement)) {
      next.memberofentitlement = [];
    }
    if (!next.status) {
      next.status = "Active";
    }
  } else {
    next.created_date = existingAttrs.created_date || next.created_date || now;
    next.failed_login_count =
      existingAttrs.failed_login_count ?? next.failed_login_count ?? 0;
    next.last_login_date =
      existingAttrs.last_login_date ?? next.last_login_date ?? null;
    if (
      next.memberofentitlement === undefined ||
      next.memberofentitlement === null ||
      next.memberofentitlement === ""
    ) {
      next.memberofentitlement = existingAttrs.memberofentitlement ?? [];
    }
    if (passwordChanged) {
      next.password_last_changed = now;
    } else {
      next.password_last_changed =
        existingAttrs.password_last_changed ?? next.password_last_changed ?? null;
    }
  }

  next.updated_date = now;
  return next;
}

function mapAccountStatusToSystem(statusValue) {
  const s = String(statusValue || "Active").toLowerCase();
  if (s === "active") return "active";
  return "disabled";
}

function isLoginBlockedByStatus(attrs = {}, systemStatus) {
  if (systemStatus === "disabled") return true;
  const s = String(attrs.status || "Active").toLowerCase();
  // Only Active can sign in; Inactive (and any other non-active) cannot
  return s !== "active";
}

module.exports = {
  buildUserIdFromNames,
  buildDisplayName,
  applyAutoUserAttributes,
  mapAccountStatusToSystem,
  isLoginBlockedByStatus,
  nowIso,
};
