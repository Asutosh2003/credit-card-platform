const express = require("express");
const { prisma } = require("../prisma");
const { authenticate, requireAdmin } = require("../middleware/auth");
const { validateFieldDefinition } = require("../services/validation");
const { writeAudit } = require("../services/helpers");
const { getSchemaFields, invalidateSchemaCache } = require("../services/cache");

const router = express.Router();

/** Fixed system columns — never stored as SchemaField, never deletable */
const FIXED_COLUMNS = {
  user: [],
  entitlement: [
    { columnName: "id", displayName: "ID", note: "System primary key" },
    { columnName: "name", displayName: "Name", note: "Entitlement name (required)" },
  ],
};

router.use(authenticate);

async function listFields(entityType, res) {
  const fields = await getSchemaFields(entityType);
  res.setHeader("Cache-Control", "private, max-age=30");
  return res.json({
    fields,
    fixedColumns: FIXED_COLUMNS[entityType] || [],
  });
}

router.get("/users", (req, res, next) =>
  listFields("user", res).catch(next)
);
router.get("/entitlements", (req, res, next) =>
  listFields("entitlement", res).catch(next)
);

router.use(requireAdmin);

async function ensureSinglePrimaryKey(entityType, isPrimaryKey, excludeId) {
  if (!isPrimaryKey) return;
  const existingPk = await prisma.schemaField.findFirst({
    where: {
      entityType,
      isPrimaryKey: true,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (existingPk) {
    await prisma.schemaField.update({
      where: { id: existingPk.id },
      data: { isPrimaryKey: false },
    });
  }
}

function reservedNames(entityType) {
  return new Set(
    (FIXED_COLUMNS[entityType] || []).map((c) => c.columnName)
  );
}

async function createField(entityType, req, res) {
  const { errors, data } = validateFieldDefinition(req.body || {});
  if (errors.length) {
    return res.status(400).json({ error: errors.join("; ") });
  }
  if (reservedNames(entityType).has(data.columnName)) {
    return res.status(400).json({
      error: `"${data.columnName}" is a fixed system column and cannot be created`,
    });
  }
  await ensureSinglePrimaryKey(entityType, data.isPrimaryKey);
  const count = await prisma.schemaField.count({ where: { entityType } });
  const field = await prisma.schemaField.create({
    data: {
      entityType,
      ...data,
      sortOrder: data.sortOrder ?? count,
    },
  });
  invalidateSchemaCache(entityType);
  writeAudit({
    actorUserId: req.user.id,
    action: "create_schema_field",
    entityType: "schema_field",
    entityId: field.id,
    details: { columnName: field.columnName, entityType },
  });
  return res.status(201).json({ field });
}

async function updateField(entityType, req, res) {
  const existing = await prisma.schemaField.findFirst({
    where: { id: req.params.fieldId, entityType },
  });
  if (!existing) {
    return res.status(404).json({ error: "Field not found" });
  }
  const { errors, data } = validateFieldDefinition(req.body || {}, {
    partial: true,
  });
  if (errors.length) {
    return res.status(400).json({ error: errors.join("; ") });
  }
  if (data.columnName && reservedNames(entityType).has(data.columnName)) {
    return res.status(400).json({
      error: `"${data.columnName}" is a fixed system column`,
    });
  }
  const willBePk =
    data.isPrimaryKey !== undefined ? data.isPrimaryKey : existing.isPrimaryKey;
  await ensureSinglePrimaryKey(entityType, willBePk, existing.id);
  const field = await prisma.schemaField.update({
    where: { id: existing.id },
    data,
  });
  invalidateSchemaCache(entityType);
  writeAudit({
    actorUserId: req.user.id,
    action: "update_schema_field",
    entityType: "schema_field",
    entityId: field.id,
  });
  return res.json({ field });
}

async function deleteField(entityType, req, res) {
  const existing = await prisma.schemaField.findFirst({
    where: { id: req.params.fieldId, entityType },
  });
  if (!existing) {
    return res.status(404).json({ error: "Field not found" });
  }
  if (existing.isAuto) {
    return res.status(400).json({
      error: "Auto-managed columns cannot be deleted",
    });
  }
  await prisma.schemaField.delete({ where: { id: existing.id } });
  invalidateSchemaCache(entityType);
  writeAudit({
    actorUserId: req.user.id,
    action: "delete_schema_field",
    entityType: "schema_field",
    entityId: existing.id,
  });
  return res.json({ ok: true });
}

router.post("/users", (req, res, next) =>
  createField("user", req, res).catch(next)
);
router.put("/users/:fieldId", (req, res, next) =>
  updateField("user", req, res).catch(next)
);
router.delete("/users/:fieldId", (req, res, next) =>
  deleteField("user", req, res).catch(next)
);

router.post("/entitlements", (req, res, next) =>
  createField("entitlement", req, res).catch(next)
);
router.put("/entitlements/:fieldId", (req, res, next) =>
  updateField("entitlement", req, res).catch(next)
);
router.delete("/entitlements/:fieldId", (req, res, next) =>
  deleteField("entitlement", req, res).catch(next)
);

router.use((err, req, res, next) => {
  if (err.code === "P2002") {
    return res
      .status(409)
      .json({ error: "A field with this columnName already exists" });
  }
  console.error(err);
  res.status(500).json({ error: "Schema operation failed" });
});

module.exports = router;
