require("dotenv").config();
const bcrypt = require("bcryptjs");
const { prisma, pool } = require("./prisma");
const {
  DEFAULT_ENTITLEMENTS,
  DEFAULT_ENTITLEMENT_FIELDS,
} = require("./entitlements");
const { DEFAULT_USER_FIELDS } = require("./userFields");
const {
  seedNamedUsers,
  DEFAULT_NAMED_USER_COUNT,
} = require("./seedNamedUsers");

async function seed() {
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be set before seeding");
  }
  if (!process.env.SEED_DEMO_PASSWORD) {
    throw new Error("SEED_DEMO_PASSWORD must be set before seeding demo users");
  }
  console.log("Seeding Wisibility Loan Hub…");

  const keepUserColumns = DEFAULT_USER_FIELDS.map((f) => f.columnName);
  for (const field of DEFAULT_USER_FIELDS) {
    await prisma.schemaField.upsert({
      where: {
        entityType_columnName: {
          entityType: field.entityType,
          columnName: field.columnName,
        },
      },
      update: {
        displayName: field.displayName,
        dataType: field.dataType,
        length: field.length,
        required: field.required,
        isPrimaryKey: field.isPrimaryKey,
        isAuto: field.isAuto,
        options: field.options || [],
        sortOrder: field.sortOrder,
      },
      create: field,
    });
  }
  await prisma.schemaField.deleteMany({
    where: {
      entityType: "user",
      columnName: { notIn: keepUserColumns },
    },
  });

  for (const field of DEFAULT_ENTITLEMENT_FIELDS) {
    await prisma.schemaField.upsert({
      where: {
        entityType_columnName: {
          entityType: field.entityType,
          columnName: field.columnName,
        },
      },
      update: {
        displayName: field.displayName,
        dataType: field.dataType,
        length: field.length,
        required: field.required,
        sortOrder: field.sortOrder,
        options: field.options || [],
      },
      create: field,
    });
  }

  const keepCodes = DEFAULT_ENTITLEMENTS.map((e) => e.code);
  for (const role of DEFAULT_ENTITLEMENTS) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        attributes: role.attributes,
      },
      create: role,
    });
  }
  await prisma.role.deleteMany({
    where: { code: { notIn: keepCodes } },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const now = new Date().toISOString();
  await prisma.user.upsert({
    where: { userId: "admin" },
    update: {
      isSystemAdmin: true,
      status: "active",
      passwordHash,
      attributes: {
        user_id: "admin",
        username: "admin",
        first_name: "System",
        last_name: "Admin",
        display_name: "System Admin",
        email: "admin@example.test",
        status: "Active",
        user_type: "Employee",
        department: "Administration",
        failed_login_count: 0,
        memberofentitlement: [],
        created_date: now,
        updated_date: now,
        password_last_changed: now,
      },
    },
    create: {
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
        department: "Administration",
        failed_login_count: 0,
        memberofentitlement: [],
        created_date: now,
        updated_date: now,
        password_last_changed: now,
      },
    },
  });

  // Named employees only (from named-users.tsv). No connector/provisioned users.
  const stats = await seedNamedUsers(prisma);

  console.log(
    `Seed complete. User columns: ${DEFAULT_USER_FIELDS.length}. ` +
      `Entitlements: ${keepCodes.length}. Named users: ${stats.total || DEFAULT_NAMED_USER_COUNT}. ` +
      "Admin: admin | Demo users: configured"
  );
  console.log("Named user stats:", stats);
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
