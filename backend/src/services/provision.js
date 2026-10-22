const crypto = require("crypto");
const { getSchemaFields } = require("./cache");

const DEFAULT_PROVISION_PASSWORD = process.env.PROVISION_DEFAULT_PASSWORD;

/** Common IdentitySphere / REST connector field aliases */
const FIELD_ALIASES = {
  userId: "user_id",
  userid: "user_id",
  login: "user_id",
  username: "username",
  firstName: "first_name",
  lastName: "last_name",
  displayName: "display_name",
  emailAddress: "email",
  phone: "phone_number",
  phoneNumber: "phone_number",
  employeeId: "employee_id",
  jobTitle: "job_title",
  managerId: "manager_id",
  managerName: "manager_name",
  userType: "user_type",
  accountExpiryDate: "account_expiry_date",
  memberOfEntitlement: "memberofentitlement",
  memberOf: "memberofentitlement",
};

const META_KEYS = new Set([
  "password",
  "isSystemAdmin",
  "attributes",
  "user",
  "roleCodes",
  "roleId",
  "roleIds",
  "entitlementCodes",
  "entitlements",
  "loanhubRoles",
  "roles",
  "memberofentitlement",
]);

function provisionPassword(body = {}) {
  const raw = body.password;
  if (typeof raw === "string" && raw.length >= 4) return raw;
  if (!DEFAULT_PROVISION_PASSWORD) {
    throw new Error("PROVISION_DEFAULT_PASSWORD must be configured when a joiner has no password");
  }
  return DEFAULT_PROVISION_PASSWORD;
}

function applyAliases(obj) {
  const out = { ...obj };
  for (const [from, to] of Object.entries(FIELD_ALIASES)) {
    if (out[from] !== undefined && out[from] !== null && out[from] !== "") {
      if (out[to] === undefined || out[to] === null || out[to] === "") {
        out[to] = out[from];
      }
    }
  }
  return out;
}

/**
 * IdentitySphere joiner payloads may be nested, flat, or mixed.
 * Merge known user columns into a single attributes object for validation.
 */
async function normalizeJoinerBody(body) {
  const root = body && typeof body === "object" ? body : {};
  const nestedUser =
    root.user && typeof root.user === "object" && !Array.isArray(root.user)
      ? root.user
      : {};
  const nestedAttrs =
    root.attributes && typeof root.attributes === "object" && !Array.isArray(root.attributes)
      ? root.attributes
      : nestedUser.attributes && typeof nestedUser.attributes === "object"
        ? nestedUser.attributes
        : {};

  const fields = await getSchemaFields("user");
  const columnNames = new Set(fields.map((f) => f.columnName));

  const raw = {};
  const sources = [nestedAttrs, nestedUser, root];
  for (const src of sources) {
    for (const [key, value] of Object.entries(src)) {
      if (value === undefined || value === null || value === "") continue;
      if (META_KEYS.has(key)) continue;
      raw[key] = value;
    }
  }

  const aliased = applyAliases(raw);
  const flat = {};
  for (const [key, value] of Object.entries(aliased)) {
    if (columnNames.has(key)) {
      flat[key] = value;
    }
  }

  const roleCodes = collectRoleCodes(root, nestedUser);

  return {
    password: provisionPassword(root),
    isSystemAdmin:
      root.isSystemAdmin !== undefined
        ? root.isSystemAdmin
        : nestedUser.isSystemAdmin,
    attributes: flat,
    roleCodes,
  };
}

function collectRoleCodes(root, nestedUser) {
  const codes = new Set();
  const nestedAttrs =
    root.attributes && typeof root.attributes === "object"
      ? root.attributes
      : nestedUser.attributes && typeof nestedUser.attributes === "object"
        ? nestedUser.attributes
        : {};
  const buckets = [
    root.roleCodes,
    root.entitlementCodes,
    root.loanhubRoles,
    root.roles,
    root.entitlements,
    root.memberofentitlement,
    nestedUser.roleCodes,
    nestedUser.entitlementCodes,
    nestedUser.loanhubRoles,
    nestedUser.roles,
    nestedUser.entitlements,
    nestedUser.memberofentitlement,
    nestedAttrs.memberofentitlement,
  ];
  for (const bucket of buckets) {
    const list = Array.isArray(bucket)
      ? bucket
      : typeof bucket === "string" && bucket.trim()
        ? bucket.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
        : [];
    for (const item of list) {
      if (typeof item === "string" && item.trim()) {
        codes.add(item.trim());
      } else if (item && typeof item === "object") {
        const code = item.code || item.entitlement_id || item.roleCode;
        if (code && String(code).trim()) codes.add(String(code).trim());
      }
    }
  }
  return [...codes];
}

function randomProvisionPassword() {
  return `Wl${crypto.randomBytes(12).toString("base64url")}`;
}

module.exports = {
  normalizeJoinerBody,
  provisionPassword,
  randomProvisionPassword,
};
