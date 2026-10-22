const express = require("express");
const bcrypt = require("bcryptjs");
const { prisma } = require("../prisma");
const { authenticate, requireAdmin } = require("../middleware/auth");
const {
  publicUser,
  publicUserListItem,
  userInclude,
  userListSelect,
  writeAudit,
  syncLoanhubRoles,
} = require("../services/helpers");
const { invalidateCache } = require("../services/cache");
const { normalizeJoinerBody } = require("../services/provision");
const { applyUserPayload, tentativeLoginFromJoiner } = require("../services/userPayload");
const { applyAutoUserAttributes } = require("../services/userAttributes");
const {
  createUserFromJoiner,
  buildProvisionResult,
} = require("../services/joinerCreate");

const router = express.Router();

router.use(authenticate);

router.get("/", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "25", 10) || 25));
    const q = String(req.query.q || "").trim();
    const filter = String(req.query.filter || "").trim();

    const where = { AND: [] };

    if (q) {
      where.AND.push({
        OR: [
          { userId: { contains: q, mode: "insensitive" } },
          { attributes: { path: ["display_name"], string_contains: q } },
          { attributes: { path: ["manager_name"], string_contains: q } },
          { attributes: { path: ["department"], string_contains: q } },
          { attributes: { path: ["email"], string_contains: q } },
        ],
      });
    }

    if (filter === "no_entitlement") {
      where.AND.push({ userRoles: { none: {} } });
    }

    if (filter === "no_manager") {
      // Avoid loading every id into memory — filter in SQL via raw ids for this page only
      const rows = await prisma.$queryRaw`
        SELECT id FROM users
        WHERE COALESCE(NULLIF(TRIM(attributes->>'manager_id'), ''), NULL) IS NULL
        ORDER BY created_at DESC, id ASC
        OFFSET ${(page - 1) * limit}
        LIMIT ${limit}
      `;
      const countRows = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count FROM users
        WHERE COALESCE(NULLIF(TRIM(attributes->>'manager_id'), ''), NULL) IS NULL
      `;
      const ids = rows.map((r) => r.id);
      const total = countRows[0]?.count || 0;
      if (!ids.length) {
        return res.json({ users: [], page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
      }
      const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: userListSelect,
      });
      const byId = Object.fromEntries(users.map((u) => [u.id, u]));
      const ordered = ids.map((id) => byId[id]).filter(Boolean);
      return res.json({
        users: ordered.map(publicUserListItem),
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    }

    const whereClause = where.AND.length ? where : undefined;
    const [total, users] = await Promise.all([
      prisma.user.count({ where: whereClause }),
      prisma.user.findMany({
        where: whereClause,
        select: userListSelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.setHeader("Cache-Control", "private, max-age=5");
    return res.json({
      users: users.map(publicUserListItem),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to list users" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.id);
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: key }, { userId: key }],
      },
      include: userInclude,
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (!req.user.isSystemAdmin && req.user.id !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to get user" });
  }
});

/** Admin user dashboard: profile summary, reporting chain, direct reports */
router.get("/:id/dashboard", requireAdmin, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.id);
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: key }, { userId: key }],
      },
      include: userInclude,
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const attrs = user.attributes || {};
    const managerLogin = String(attrs.manager_id || "").trim();

    const [manager, directReports, auditCount] = await Promise.all([
      managerLogin
        ? prisma.user.findFirst({
            where: { userId: managerLogin },
            select: {
              id: true,
              userId: true,
              status: true,
              attributes: true,
            },
          })
        : Promise.resolve(null),
      prisma.$queryRaw`
        SELECT id, user_id AS "userId", status, attributes
        FROM users
        WHERE TRIM(COALESCE(attributes->>'manager_id', '')) = ${user.userId}
        ORDER BY attributes->>'display_name' ASC NULLS LAST, user_id ASC
        LIMIT 100
      `,
      prisma.auditEvent.count({
        where: {
          OR: [{ actorUserId: user.id }, { entityId: user.id }],
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    // Build reporting chain upward (user → manager → …), max 8 levels
    const chain = [];
    let cursor = managerLogin;
    const seen = new Set([user.userId]);
    for (let depth = 0; depth < 8 && cursor; depth += 1) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const node = await prisma.user.findFirst({
        where: { userId: cursor },
        select: { id: true, userId: true, status: true, attributes: true },
      });
      if (!node) break;
      chain.push({
        id: node.id,
        userId: node.userId,
        displayName: node.attributes?.display_name || node.userId,
        jobTitle: node.attributes?.job_title || null,
        department: node.attributes?.department || null,
        status: node.attributes?.status || node.status,
      });
      cursor = String(node.attributes?.manager_id || "").trim() || null;
    }

    const reports = (directReports || []).map((r) => ({
      id: r.id,
      userId: r.userId,
      displayName: r.attributes?.display_name || r.userId,
      department: r.attributes?.department || null,
      jobTitle: r.attributes?.job_title || null,
      status: r.attributes?.status || r.status,
      entitlementCount: null,
    }));

    // Enrich report entitlement counts in one query when there are reports
    if (reports.length) {
      const ids = reports.map((r) => r.id);
      const counts = await prisma.userRole.groupBy({
        by: ["userId"],
        where: { userId: { in: ids } },
        _count: { _all: true },
      });
      const byId = Object.fromEntries(counts.map((c) => [c.userId, c._count._all]));
      for (const r of reports) {
        r.entitlementCount = byId[r.id] || 0;
      }
    }

    return res.json({
      user: publicUser(user),
      manager: manager
        ? {
            id: manager.id,
            userId: manager.userId,
            displayName: manager.attributes?.display_name || manager.userId,
            department: manager.attributes?.department || null,
            jobTitle: manager.attributes?.job_title || null,
            status: manager.attributes?.status || manager.status,
          }
        : null,
      reportingChain: chain,
      directReports: reports,
      stats: {
        entitlementCount: (user.userRoles || []).length,
        directReportCount: reports.length,
        auditEvents30d: auditCount,
        lastLogin: attrs.last_login_date || null,
        failedLogins: Number(attrs.failed_login_count || 0),
        mfaEnabled: Boolean(attrs.mfa_enabled),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load user dashboard" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const joiner = await normalizeJoinerBody(req.body);
    const tentativeLogin = tentativeLoginFromJoiner(joiner);
    const viaApiKey = req.auth?.via === "api_key";
    let existingEarly = null;

    if (tentativeLogin) {
      existingEarly = await prisma.user.findUnique({
        where: { userId: tentativeLogin },
        include: userInclude,
      });
      if (existingEarly && !viaApiKey) {
        return res.status(200).json({
          user: publicUser(existingEarly),
          userListItem: publicUserListItem(existingEarly),
          provisionStatus: "already_exists",
          message: "User already exists in Loan Hub",
        });
      }
    }

    if (viaApiKey) {
      if (!tentativeLogin) {
        return res.status(400).json({
          error: "User ID is required — send user_id (or userId) or first_name + last_name",
        });
      }

      if (existingEarly) {
        const appliedResult = buildProvisionResult(joiner, existingEarly);
        const request = await prisma.provisionRequest.create({
          data: {
            targetUserLogin: existingEarly.userId,
            payload: joiner,
            rawPayload: req.body || {},
            appliedResult,
            requestedByUserId: req.user.id,
            source: "identitysphere",
            status: "approved",
            createdUserId: existingEarly.id,
            reviewedByUserId: req.user.id,
            reviewedAt: new Date(),
          },
        });

        return res.status(200).json({
          user: publicUser(existingEarly),
          userListItem: publicUserListItem(existingEarly),
          requestId: request.id,
          provisionStatus: "already_exists",
          message: "Provision request received; requested values were already present or were not applied",
          appliedResult,
        });
      }

      const { errors, data } = await applyUserPayload(joiner, { isCreate: true });
      if (errors.length) {
        return res.status(400).json({ error: errors.join("; ") });
      }

      const { user, missingRoleCodes } = await createUserFromJoiner(joiner, data);
      const appliedResult = buildProvisionResult(joiner, user, {
        created: true,
        missingRoleCodes,
      });

      const request = await prisma.provisionRequest.create({
        data: {
          targetUserLogin: user.userId,
          payload: joiner,
          rawPayload: req.body || {},
          appliedResult,
          requestedByUserId: req.user.id,
          source: "identitysphere",
          status: "approved",
          createdUserId: user.id,
          reviewedByUserId: req.user.id,
          reviewedAt: new Date(),
        },
      });

      writeAudit({
        actorUserId: req.user.id,
        action: "provision_user",
        entityType: "user",
        entityId: user.id,
        details: {
          userId: user.userId,
          roleCodes: joiner.roleCodes,
          missingRoleCodes,
          via: "api_key",
          requestId: request.id,
          autoAccepted: true,
        },
      });

      return res.status(201).json({
        user: publicUser(user),
        userListItem: publicUserListItem(user),
        requestId: request.id,
        provisionStatus: "created",
        message: "User provisioned successfully",
        appliedResult,
        missingRoleCodes: missingRoleCodes.length ? missingRoleCodes : undefined,
      });
    }

    const { errors, data } = await applyUserPayload(joiner, { isCreate: true });
    if (errors.length) {
      return res.status(400).json({ error: errors.join("; ") });
    }

    const { user, missingRoleCodes } = await createUserFromJoiner(joiner, data);

    writeAudit({
      actorUserId: req.user.id,
      action: "provision_user",
      entityType: "user",
      entityId: user.id,
      details: {
        userId: user.userId,
        roleCodes: joiner.roleCodes,
        missingRoleCodes,
        via: req.auth?.via || "session",
      },
    });

    return res.status(201).json({
      user: publicUser(user),
      userListItem: publicUserListItem(user),
      provisionStatus: "created",
      missingRoleCodes: missingRoleCodes.length ? missingRoleCodes : undefined,
    });
  } catch (err) {
    if (err.code === "P2002") {
      const login = req.body?.userId || req.body?.user_id || req.body?.attributes?.user_id;
      if (login) {
        const existing = await prisma.user.findUnique({
          where: { userId: String(login) },
          include: userInclude,
        });
        if (existing) {
          return res.status(200).json({
            user: publicUser(existing),
            userListItem: publicUserListItem(existing),
            provisionStatus: "already_exists",
          });
        }
      }
      return res.status(409).json({ error: "userId already exists" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to create user" });
  }
});

async function updateUserHandler(req, res) {
  try {
    const existing = await prisma.user.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    // Same normalization as create — IdentitySphere sends flat JSON (department,
    // job_title, …). Without this, applyUserPayload sees no `attributes` and
    // returns 400 "No fields to update" while roles may still succeed on IGA.
    const joiner = await normalizeJoinerBody(req.body);
    const { errors, data } = await applyUserPayload(joiner, {
      isCreate: false,
      excludeUserId: req.params.id,
      existingUser: existing,
    });
    if (errors.length) {
      return res.status(400).json({ error: errors.join("; ") });
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      include: userInclude,
    });
    invalidateCache("dashboard:");
    writeAudit({
      actorUserId: req.user.id,
      action: "update_user",
      entityType: "user",
      entityId: user.id,
      details: { fields: Object.keys(data) },
    });
    return res.json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "userId already exists" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to update user" });
  }
}

router.put("/:id", requireAdmin, updateUserHandler);
router.patch("/:id", requireAdmin, updateUserHandler);

router.post("/:id/enable", requireAdmin, async (req, res) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }
    const attrs = { ...(existing.attributes || {}), status: "Active" };
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: "active", attributes: attrs },
      include: userInclude,
    });
    invalidateCache("dashboard:");
    writeAudit({
      actorUserId: req.user.id,
      action: "enable_user",
      entityType: "user",
      entityId: user.id,
    });
    return res.json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to enable user" });
  }
});

router.post("/:id/disable", requireAdmin, async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: "Cannot disable your own account" });
    }
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }
    const attrs = { ...(existing.attributes || {}), status: "Inactive" };
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: "disabled", attributes: attrs },
      include: userInclude,
    });
    invalidateCache("dashboard:");
    writeAudit({
      actorUserId: req.user.id,
      action: "disable_user",
      entityType: "user",
      entityId: user.id,
    });
    return res.json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to disable user" });
  }
});

router.post("/:id/reset-password", requireAdmin, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password || password.length < 4) {
      return res.status(400).json({ error: "password (min 4 chars) is required" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }
    const attrs = applyAutoUserAttributes(existing.attributes || {}, {
      isCreate: false,
      existingAttrs: existing.attributes || {},
      passwordChanged: true,
    });
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        passwordHash,
        attributes: attrs,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
      include: userInclude,
    });
    invalidateCache("dashboard:");
    writeAudit({
      actorUserId: req.user.id,
      action: "admin_reset_password",
      entityType: "user",
      entityId: user.id,
    });
    return res.json({ user: publicUser(user), ok: true });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to reset password" });
  }
});

router.post("/:id/roles", requireAdmin, async (req, res) => {
  try {
    const { roleId } = req.body || {};
    if (!roleId) {
      return res.status(400).json({ error: "roleId is required" });
    }
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }

    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
    await syncLoanhubRoles(user.id);
    const updated = await prisma.user.findUnique({
      where: { id: user.id },
      include: userInclude,
    });
    invalidateCache("dashboard:");
    writeAudit({
      actorUserId: req.user.id,
      action: "assign_role",
      entityType: "user",
      entityId: user.id,
      details: { roleId: role.id, roleCode: role.code },
    });
    return res.status(201).json({ user: publicUser(updated) });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Role already assigned" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to assign role" });
  }
});

router.delete("/:id/roles/:roleId", requireAdmin, async (req, res) => {
  try {
    const assignment = await prisma.userRole.findUnique({
      where: {
        userId_roleId: {
          userId: req.params.id,
          roleId: req.params.roleId,
        },
      },
    });
    if (!assignment) {
      return res.status(404).json({ error: "Role assignment not found" });
    }
    await prisma.userRole.delete({ where: { id: assignment.id } });
    await syncLoanhubRoles(req.params.id);
    const updated = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: userInclude,
    });
    invalidateCache("dashboard:");
    writeAudit({
      actorUserId: req.user.id,
      action: "remove_role",
      entityType: "user",
      entityId: req.params.id,
      details: { roleId: req.params.roleId },
    });
    return res.json({ user: publicUser(updated) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to remove role" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    invalidateCache("dashboard:");
    writeAudit({
      actorUserId: req.user.id,
      action: "delete_user",
      entityType: "user",
      entityId: req.params.id,
    });
    return res.json({ ok: true });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to delete user" });
  }
});

module.exports = router;
