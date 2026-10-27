const { prisma } = require("../prisma");
const {
  publicUser,
  publicUserListItem,
  userInclude,
  writeAudit,
  syncLoanhubRoles,
} = require("./helpers");
const { invalidateCache } = require("./cache");

/**
 * Create a user from a normalized joiner payload (provision / admin create).
 * @param {object} joiner - output of normalizeJoinerBody
 * @param {object} data - output of applyUserPayload (passwordHash, userId, attributes, status)
 */
async function createUserFromJoiner(joiner, data) {
  const wantsRoles = Array.isArray(joiner.roleCodes) && joiner.roleCodes.length > 0;

  // Fast path: one insert, no role join / no follow-up SELECT (bulk Joiners).
  const user = await prisma.user.create({
    data,
    ...(wantsRoles ? { include: userInclude } : {}),
  });

  let missingRoleCodes = [];
  if (wantsRoles) {
    const roles = await prisma.role.findMany({
      where: { code: { in: joiner.roleCodes } },
      select: { id: true, code: true },
    });
    const foundCodes = new Set(roles.map((r) => r.code));
    missingRoleCodes = joiner.roleCodes.filter((c) => !foundCodes.has(c));
    if (roles.length) {
      await prisma.userRole.createMany({
        data: roles.map((r) => ({ userId: user.id, roleId: r.id })),
        skipDuplicates: true,
      });
      await syncLoanhubRoles(user.id);
      const refreshed = await prisma.user.findUnique({
        where: { id: user.id },
        include: userInclude,
      });
      invalidateCache("dashboard:");
      return {
        user: refreshed || user,
        missingRoleCodes,
      };
    }
  }

  // Shape matches publicUser() without an extra round-trip.
  if (!user.userRoles) user.userRoles = [];
  if (!user.loanhubRoles) user.loanhubRoles = [];

  invalidateCache("dashboard:");
  return {
    user,
    missingRoleCodes,
  };
}

function buildProvisionResult(joiner, user, { created = false, missingRoleCodes = [] } = {}) {
  const requestedAttributes = joiner?.attributes || {};
  const existingAttributes = user?.attributes || {};
  const newFields = [];
  const alreadyPresentFields = [];
  const notAppliedFields = [];

  for (const [key, value] of Object.entries(requestedAttributes)) {
    if (created) {
      newFields.push(key);
    } else if (existingAttributes[key] === value) {
      alreadyPresentFields.push(key);
    } else {
      notAppliedFields.push(key);
    }
  }

  const existingRoleCodes = new Set(
    (user?.userRoles || [])
      .map((assignment) => assignment.role?.code)
      .filter(Boolean)
  );
  const addedRoleCodes = created
    ? (joiner?.roleCodes || []).filter((code) => !missingRoleCodes.includes(code))
    : [];
  const alreadyPresentRoleCodes = (joiner?.roleCodes || []).filter((code) =>
    existingRoleCodes.has(code)
  );
  const notAppliedRoleCodes = created
    ? []
    : (joiner?.roleCodes || []).filter(
        (code) => !alreadyPresentRoleCodes.includes(code)
      );

  return {
    outcome: created ? "created" : "already_exists",
    fields: {
      new: newFields,
      alreadyPresent: alreadyPresentFields,
      notApplied: notAppliedFields,
    },
    roles: {
      added: addedRoleCodes,
      alreadyPresent: alreadyPresentRoleCodes,
      notApplied: notAppliedRoleCodes,
      missing: missingRoleCodes,
    },
  };
}

function serializeProvisionRequest(row, user = null) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const attrs = payload.attributes || {};
  return {
    id: row.id,
    status: row.status,
    provisionStatus:
      row.status === "approved"
        ? "approved"
        : row.status === "rejected"
          ? "rejected"
          : "pending_approval",
    targetUserLogin: row.targetUserLogin,
    displayName:
      attrs.display_name ||
      [attrs.first_name, attrs.last_name].filter(Boolean).join(" ") ||
      row.targetUserLogin,
    email: attrs.email || null,
    department: attrs.department || null,
    roleCodes: Array.isArray(payload.roleCodes) ? payload.roleCodes : [],
    appliedResult: row.appliedResult || {},
    rejectMessage: row.rejectMessage || null,
    message:
      row.status === "rejected"
        ? row.rejectMessage || "Provision request rejected"
        : row.status === "approved"
          ? "User provisioned successfully"
          : "Awaiting admin approval",
    createdUserId: row.createdUserId || null,
    requestedAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    source: row.source,
    user: user ? publicUser(user) : undefined,
    userListItem: user ? publicUserListItem(user) : undefined,
  };
}

async function findUserForProvisionRequest(row) {
  if (!row.createdUserId) return null;
  return prisma.user.findUnique({
    where: { id: row.createdUserId },
    include: userInclude,
  });
}

async function approveProvisionRequest(requestId, reviewerUserId) {
  const row = await prisma.provisionRequest.findUnique({ where: { id: requestId } });
  if (!row) return { error: "Provision request not found", status: 404 };
  if (row.status === "approved") {
    const user = await findUserForProvisionRequest(row);
    return {
      ok: true,
      request: serializeProvisionRequest(row, user),
      alreadyReviewed: true,
    };
  }
  if (row.status === "rejected") {
    return {
      error: "Provision request was already rejected",
      status: 409,
      request: serializeProvisionRequest(row),
    };
  }

  const joiner = row.payload;
  const existing = await prisma.user.findUnique({
    where: { userId: row.targetUserLogin },
    include: userInclude,
  });
  if (existing) {
    const appliedResult = buildProvisionResult(joiner, existing);
    const updated = await prisma.provisionRequest.update({
      where: { id: row.id },
      data: {
        status: "approved",
        createdUserId: existing.id,
        reviewedByUserId: reviewerUserId,
        reviewedAt: new Date(),
        appliedResult,
      },
    });
    writeAudit({
      actorUserId: reviewerUserId,
      action: "approve_provision_request",
      entityType: "provision_request",
      entityId: row.id,
      details: { userId: existing.userId, alreadyExists: true },
    });
    return {
      ok: true,
      request: serializeProvisionRequest(updated, existing),
      appliedResult,
      alreadyExists: true,
    };
  }

  const { applyUserPayload } = require("./userPayload");
  const { errors, data } = await applyUserPayload(joiner, { isCreate: true });
  if (errors.length) {
    return { error: errors.join("; "), status: 400 };
  }

  const { user, missingRoleCodes } = await createUserFromJoiner(joiner, data);
  const appliedResult = buildProvisionResult(joiner, user, {
    created: true,
    missingRoleCodes,
  });
  const updated = await prisma.provisionRequest.update({
    where: { id: row.id },
    data: {
      status: "approved",
      createdUserId: user.id,
      reviewedByUserId: reviewerUserId,
      reviewedAt: new Date(),
      appliedResult,
    },
  });

  writeAudit({
    actorUserId: reviewerUserId,
    action: "approve_provision_request",
    entityType: "provision_request",
    entityId: row.id,
    details: {
      userId: user.userId,
      missingRoleCodes,
    },
  });

  return {
    ok: true,
    request: serializeProvisionRequest(updated, user),
    appliedResult,
    missingRoleCodes,
  };
}

async function rejectProvisionRequest(requestId, reviewerUserId, rejectMessage) {
  const row = await prisma.provisionRequest.findUnique({ where: { id: requestId } });
  if (!row) return { error: "Provision request not found", status: 404 };
  if (row.status === "approved") {
    return { error: "Provision request was already approved", status: 409 };
  }
  if (row.status === "rejected") {
    return {
      ok: true,
      request: serializeProvisionRequest(row),
      alreadyReviewed: true,
    };
  }

  const message = String(rejectMessage || "Provision request rejected by administrator").trim();
  const updated = await prisma.provisionRequest.update({
    where: { id: row.id },
    data: {
      status: "rejected",
      rejectMessage: message,
      reviewedByUserId: reviewerUserId,
      reviewedAt: new Date(),
    },
  });

  writeAudit({
    actorUserId: reviewerUserId,
    action: "reject_provision_request",
    entityType: "provision_request",
    entityId: row.id,
    details: { targetUserLogin: row.targetUserLogin, rejectMessage: message },
  });

  return { ok: true, request: serializeProvisionRequest(updated) };
}

module.exports = {
  createUserFromJoiner,
  serializeProvisionRequest,
  buildProvisionResult,
  approveProvisionRequest,
  rejectProvisionRequest,
  findUserForProvisionRequest,
};
