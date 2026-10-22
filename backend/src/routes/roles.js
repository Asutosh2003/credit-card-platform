const express = require("express");
const { prisma } = require("../prisma");
const { authenticate, requireAdmin } = require("../middleware/auth");
const {
  validateRoleBody,
  validateAttributes,
} = require("../services/validation");
const { publicRole, writeAudit, syncLoanhubRoles } = require("../services/helpers");
const { getSchemaFields } = require("../services/cache");

const router = express.Router();

router.use(authenticate, requireAdmin);

async function loadEntitlementFields() {
  return getSchemaFields("entitlement");
}

router.get("/", async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { userRoles: true } } },
    });
    const mapped = roles.map(publicRole);
    return res.json({
      roles: mapped,
      entitlements: mapped,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to list roles" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const role = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }
    return res.json({ role: publicRole(role), entitlement: publicRole(role) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to get role" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { errors, data } = validateRoleBody(req.body || {});
    if (errors.length) {
      return res.status(400).json({ error: errors.join("; ") });
    }
    const fields = await loadEntitlementFields();
    const attrResult = validateAttributes(req.body?.attributes || {}, fields);
    if (attrResult.errors.length) {
      return res.status(400).json({ error: attrResult.errors.join("; ") });
    }
    const role = await prisma.role.create({
      data: { ...data, attributes: attrResult.cleaned },
    });
    await writeAudit({
      actorUserId: req.user.id,
      action: "create_role",
      entityType: "role",
      entityId: role.id,
      details: { code: role.code },
    });
    return res.status(201).json({ role: publicRole(role), entitlement: publicRole(role) });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Entitlement code already exists" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to create role" });
  }
});

async function updateRole(req, res) {
  try {
    const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: "Role not found" });
    }
    const { errors, data } = validateRoleBody(req.body || {}, { partial: true });
    if (errors.length) {
      return res.status(400).json({ error: errors.join("; ") });
    }
    if (req.body?.attributes !== undefined) {
      const fields = await loadEntitlementFields();
      const attrResult = validateAttributes(req.body.attributes || {}, fields);
      if (attrResult.errors.length) {
        return res.status(400).json({ error: attrResult.errors.join("; ") });
      }
      data.attributes = attrResult.cleaned;
    }
    const codeChanged = data.code !== undefined && data.code !== existing.code;
    const role = await prisma.role.update({
      where: { id: req.params.id },
      data,
    });
    if (codeChanged) {
      const assignees = await prisma.userRole.findMany({
        where: { roleId: role.id },
        select: { userId: true },
      });
      await Promise.all(assignees.map((a) => syncLoanhubRoles(a.userId)));
    }
    await writeAudit({
      actorUserId: req.user.id,
      action: "update_role",
      entityType: "role",
      entityId: role.id,
    });
    return res.json({ role: publicRole(role), entitlement: publicRole(role) });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Entitlement code already exists" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to update role" });
  }
}

router.put("/:id", updateRole);
router.patch("/:id", updateRole);

router.delete("/:id", async (req, res) => {
  try {
    const assignees = await prisma.userRole.findMany({
      where: { roleId: req.params.id },
      select: { userId: true },
    });
    await prisma.role.delete({ where: { id: req.params.id } });
    await Promise.all(assignees.map((a) => syncLoanhubRoles(a.userId)));
    await writeAudit({
      actorUserId: req.user.id,
      action: "delete_role",
      entityType: "role",
      entityId: req.params.id,
    });
    return res.json({ ok: true });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Role not found" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to delete role" });
  }
});

module.exports = router;
