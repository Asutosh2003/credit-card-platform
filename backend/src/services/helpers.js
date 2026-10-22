const { prisma } = require("../prisma");

function writeAudit({ actorUserId, action, entityType, entityId = null, details = {} }) {
  // Fire-and-forget — never block the HTTP response
  prisma.auditEvent
    .create({
      data: {
        actorUserId: actorUserId || null,
        action,
        entityType,
        entityId,
        details,
      },
    })
    .catch((err) => console.error("Failed to write audit event", err));
}

function publicRole(role) {
  if (!role) return null;
  const attrs = publicAttributes(role.attributes || {});
  const isPrivilege = Boolean(
    attrs.is_privilege !== undefined ? attrs.is_privilege : attrs.privilege
  );
  const isActive =
    attrs.is_active === undefined || attrs.is_active === null
      ? true
      : Boolean(attrs.is_active);
  return {
    ...attrs,
    // IdentitySphere-aligned aliases (flat)
    entitlement_id: role.code,
    entitlement_name: role.name,
    entitlement_description: attrs.description ?? null,
    entitlement_type: attrs.entitlement_type || "Business",
    is_privilege: isPrivilege,
    privilege: isPrivilege,
    is_active: isActive,
    source: attrs.source || "Wisibility Loan Hub",
    // Core identifiers
    id: role.id,
    name: role.name,
    code: role.code,
    description: attrs.description ?? null,
    assignmentCount: role._count?.userRoles ?? role.assignmentCount ?? 0,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

function rolesFromUser(user) {
  if (!user?.userRoles) return [];
  return user.userRoles
    .map((ur) => publicRole(ur.role))
    .filter(Boolean);
}

function loanhubRolesFromUser(user) {
  if (Array.isArray(user?.loanhubRoles)) {
    return user.loanhubRoles;
  }
  const fromJoin = rolesFromUser(user)
    .map((r) => r.code)
    .filter(Boolean);
  return fromJoin.sort();
}

/** Rebuild users.loanhub_roles + attributes.memberofentitlement from user_roles */
async function syncLoanhubRoles(userId) {
  if (!userId) return [];
  const assignments = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { select: { code: true } } },
  });
  const codes = [
    ...new Set(
      assignments
        .map((a) => a.role?.code)
        .filter((c) => typeof c === "string" && c.length > 0)
    ),
  ].sort();
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { attributes: true },
  });
  const attrs =
    existing?.attributes && typeof existing.attributes === "object"
      ? { ...existing.attributes }
      : {};
  attrs.memberofentitlement = codes;
  await prisma.user.update({
    where: { id: userId },
    data: { loanhubRoles: codes, attributes: attrs },
  });
  return codes;
}

/** Bulk rebuild loanhub_roles for every user (backfill / repair) */
async function syncAllLoanhubRoles() {
  const rows = await prisma.$queryRaw`
    SELECT u.id AS id,
      COALESCE(
        array_agg(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL),
        ARRAY[]::text[]
      ) AS codes
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    GROUP BY u.id
  `;
  let updated = 0;
  for (const row of rows) {
    const codes = Array.isArray(row.codes) ? row.codes : [];
    const existing = await prisma.user.findUnique({
      where: { id: row.id },
      select: { attributes: true },
    });
    const attrs =
      existing?.attributes && typeof existing.attributes === "object"
        ? { ...existing.attributes }
        : {};
    attrs.memberofentitlement = codes;
    await prisma.user.update({
      where: { id: row.id },
      data: { loanhubRoles: codes, attributes: attrs },
    });
    updated += 1;
  }
  return updated;
}

/** Strip auth secrets if they ever appear inside dynamic attributes */
const SENSITIVE_ATTR_KEYS = new Set([
  "password",
  "passwordHash",
  "password_hash",
  "resetTokenHash",
  "reset_token_hash",
  "resetTokenExpiresAt",
  "reset_token_expires_at",
  "currentPassword",
  "newPassword",
  "api_key_hash",
  "api_key_prefix",
  "api_key_created_at",
  "api_key_encrypted",
]);

function publicAttributes(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (SENSITIVE_ATTR_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function withMemberOfEntitlement(attrs, loanhubRoles) {
  const next = { ...attrs };
  if (
    next.memberofentitlement === undefined ||
    next.memberofentitlement === null ||
    next.memberofentitlement === ""
  ) {
    next.memberofentitlement = loanhubRoles;
  }
  return next;
}

function publicUser(user) {
  if (!user) return null;
  const roles = rolesFromUser(user);
  const loanhubRoles = loanhubRolesFromUser(user);
  const roleCount =
    user._count?.userRoles ??
    (Array.isArray(user.userRoles) ? user.userRoles.length : undefined) ??
    loanhubRoles.length;
  return {
    id: user.id,
    userId: user.userId,
    status: user.status,
    isSystemAdmin: Boolean(user.isSystemAdmin),
    attributes: withMemberOfEntitlement(
      publicAttributes(user.attributes),
      loanhubRoles
    ),
    loanhubRoles,
    roles,
    roleCount: roleCount ?? roles.length,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * List row for aggregation / IdentitySphere: dynamic fields at top level (not nested).
 * Does not join roles; assignment codes come from loanhubRoles when present.
 */
function publicUserListItem(user) {
  if (!user) return null;
  const loanhubRoles = Array.isArray(user.loanhubRoles)
    ? user.loanhubRoles
    : [];
  const attrs = withMemberOfEntitlement(
    publicAttributes(user.attributes),
    loanhubRoles
  );
  return {
    ...attrs,
    id: user.id,
    userId: user.userId,
    /** Account status from schema when present (e.g. Active); else system status */
    status:
      attrs.status !== undefined && attrs.status !== null && attrs.status !== ""
        ? attrs.status
        : user.status,
    /** System login status for admin enable/disable (active | disabled) */
    systemStatus: user.status,
    isSystemAdmin: Boolean(user.isSystemAdmin),
    loanhubRoles,
    memberofentitlement: attrs.memberofentitlement,
    roles: [],
    roleCount: user._count?.userRoles ?? loanhubRoles.length,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

const userInclude = {
  userRoles: { include: { role: true } },
};

const userListSelect = {
  id: true,
  userId: true,
  status: true,
  isSystemAdmin: true,
  attributes: true,
  loanhubRoles: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { userRoles: true } },
};

module.exports = {
  writeAudit,
  publicRole,
  publicUser,
  publicUserListItem,
  userInclude,
  userListSelect,
  syncLoanhubRoles,
  syncAllLoanhubRoles,
};
