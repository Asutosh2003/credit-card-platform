const bcrypt = require("bcryptjs");
const { prisma } = require("./prisma");
const {
  DEFAULT_ENTITLEMENTS,
  DEFAULT_ENTITLEMENT_FIELDS,
} = require("./entitlements");
const { DEFAULT_USER_FIELDS } = require("./userFields");

let seeded = false;

async function upsertField(field) {
  await prisma.schemaField.upsert({
    where: {
      entityType_columnName: {
        entityType: field.entityType,
        columnName: field.columnName,
      },
    },
    update: {},
    create: field,
  });
}

async function ensureSeeded() {
  if (seeded) return;

  // Fast path: schema already present — skip heavy upserts (avoids Supabase timeouts on restart)
  const [userFieldCount, entitlementFieldCount, roleCount, admin] =
    await Promise.all([
      prisma.schemaField.count({ where: { entityType: "user" } }),
      prisma.schemaField.count({ where: { entityType: "entitlement" } }),
      prisma.role.count(),
      prisma.user.findUnique({ where: { userId: "admin" } }),
    ]);

  const needsUserFields = userFieldCount < DEFAULT_USER_FIELDS.length;
  const needsEntitlementFields =
    entitlementFieldCount < DEFAULT_ENTITLEMENT_FIELDS.length;
  const needsRoles = roleCount < DEFAULT_ENTITLEMENTS.length;

  if (needsUserFields) {
    for (const field of DEFAULT_USER_FIELDS) {
      await upsertField(field);
    }
  }

  if (needsEntitlementFields) {
    for (const field of DEFAULT_ENTITLEMENT_FIELDS) {
      await upsertField(field);
    }
  }

  if (needsRoles) {
    for (const role of DEFAULT_ENTITLEMENTS) {
      await prisma.role.upsert({
        where: { code: role.code },
        update: {},
        create: role,
      });
    }
  }

  if (!admin) {
    const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!bootstrapPassword) {
      throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be set before creating the initial admin");
    }
    const passwordHash = await bcrypt.hash(bootstrapPassword, 10);
    const now = new Date().toISOString();
    await prisma.user.create({
      data: {
        userId: "admin",
        passwordHash,
        status: "active",
        isSystemAdmin: true,
        attributes: {
          user_id: "admin",
          username: "admin",
          first_name: "System",
          last_name: "Admin",
          display_name: "System Admin",
          email: "admin@example.test",
          status: "Active",
          user_type: "Employee",
          failed_login_count: 0,
          memberofentitlement: [],
          created_date: now,
          updated_date: now,
          password_last_changed: now,
        },
      },
    });
    console.log("Created initial admin account");
  } else if (!admin.isSystemAdmin) {
    await prisma.user.update({
      where: { id: admin.id },
      data: { isSystemAdmin: true, status: "active" },
    });
  }

  seeded = true;
  if (!needsUserFields && !needsEntitlementFields && !needsRoles) {
    console.log("Bootstrap: schema already present, skipped reseeding");
  }
}

module.exports = { ensureSeeded };
