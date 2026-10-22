const express = require("express");
const { prisma } = require("../prisma");
const { authenticate, withRoles, requireAdmin } = require("../middleware/auth");
const { getCached } = require("../services/cache");
const { publicUser } = require("../services/helpers");

const router = express.Router();

router.use(authenticate);

/** Personal summary for any logged-in user */
router.get("/me", withRoles, async (req, res) => {
  try {
    const attrs = req.user.attributes || {};
    const roles = (req.user.userRoles || []).map((ur) => ur.role).filter(Boolean);
    return res.json({
      userId: req.user.userId,
      status: attrs.status || req.user.status,
      entitlementCount: roles.length,
      department: attrs.department || null,
      managerName: attrs.manager_name || null,
      lastLogin: attrs.last_login_date || null,
      user: publicUser(req.user),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load dashboard" });
  }
});

/** Admin org-wide stats — one SQL round-trip + short cache */
router.get("/stats", requireAdmin, async (req, res) => {
  try {
    const stats = await getCached("dashboard:stats", 15_000, async () => {
      const [userRow] = await prisma.$queryRaw`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE is_system_admin)::int AS system_admins,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active_system,
          COUNT(*) FILTER (WHERE status = 'disabled')::int AS disabled_system,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM user_roles ur WHERE ur.user_id = users.id
            )
          )::int AS no_entitlement,
          COUNT(*) FILTER (
            WHERE COALESCE(NULLIF(TRIM(attributes->>'manager_id'), ''), NULL) IS NULL
          )::int AS no_manager
        FROM users
      `;

      const statusRows = await prisma.$queryRaw`
        SELECT
          COALESCE(NULLIF(TRIM(attributes->>'status'), ''), 'Unknown') AS status,
          COUNT(*)::int AS count
        FROM users
        GROUP BY 1
      `;

      const [entRow] = await prisma.$queryRaw`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM user_roles ur WHERE ur.role_id = roles.id
            )
          )::int AS unassigned,
          COUNT(*) FILTER (
            WHERE COALESCE(NULLIF(TRIM(attributes->>'owner'), ''), NULL) IS NULL
          )::int AS missing_owner
        FROM roles
      `;

      const [schemaRow] = await prisma.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE entity_type = 'user')::int AS user_columns,
          COUNT(*) FILTER (WHERE entity_type = 'entitlement')::int AS entitlement_columns
        FROM schema_fields
      `;

      const [auditRow] = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS last_24h
        FROM audit_events
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `;

      const byStatus = {};
      for (const row of statusRows) {
        byStatus[row.status] = row.count;
      }

      return {
        users: {
          total: userRow.total,
          systemAdmins: userRow.system_admins,
          activeSystem: userRow.active_system,
          disabledSystem: userRow.disabled_system,
          noManager: userRow.no_manager,
          noEntitlement: userRow.no_entitlement,
          byStatus: {
            Active: byStatus.Active || 0,
            Inactive: byStatus.Inactive || 0,
          },
        },
        entitlements: {
          total: entRow.total,
          unassigned: entRow.unassigned,
          missingOwner: entRow.missing_owner,
          assigned: entRow.total - entRow.unassigned,
        },
        schema: {
          userColumns: schemaRow.user_columns,
          entitlementColumns: schemaRow.entitlement_columns,
        },
        audit: {
          last24Hours: auditRow.last_24h,
        },
      };
    });

    res.setHeader("Cache-Control", "private, max-age=10");
    return res.json(stats);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load dashboard stats" });
  }
});

module.exports = router;
