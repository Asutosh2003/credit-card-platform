/**
 * Seed named users with manager hierarchy (exec → director → manager → staff)
 * and mixed entitlement scenarios (some with / without entitlements). Orphans & execs
 * have no manager.
 *
 * Usage: node src/seedNamedUsers.js
 * Set SEED_DEMO_PASSWORD in the environment before seeding.
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const { prisma, pool } = require("./prisma");
const { assignableEntitlements } = require("./entitlements");

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;
const NAMED_USERS_PATH = path.join(__dirname, "data", "shared-users.tsv");
const DEFAULT_NAMED_USER_COUNT = 100;

function resolveMaxUsers(override) {
  if (Number.isFinite(override) && override > 0) {
    return Math.min(DEFAULT_NAMED_USER_COUNT, Math.floor(override));
  }
  return DEFAULT_NAMED_USER_COUNT;
}

const FIRST_NAMES = [
  "Aarav", "Aisha", "Amelia", "Arjun", "Chloe", "Daniel", "Elena", "Ethan",
  "Fatima", "Grace", "Hannah", "Isla", "Jacob", "Jasmine", "Leo", "Liam",
  "Maya", "Noah", "Nora", "Oliver", "Priya", "Rafael", "Sofia", "William",
];
const LAST_NAMES = [
  "Anderson", "Bennett", "Carter", "Das", "Evans", "Foster", "Garcia", "Hughes",
  "Ibrahim", "Johnson", "Khan", "Lewis", "Martin", "Nguyen", "Patel", "Reed",
  "Singh", "Thompson", "Turner", "Walker", "Young",
];

function loadNamedPeople(count) {
  if (!fs.existsSync(NAMED_USERS_PATH)) {
    const managerName = `${FIRST_NAMES[0]} ${LAST_NAMES[0]}`;
    return Array.from({ length: count }, (_, index) => {
      const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
      const lastName = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
      const login = `demo.user${String(index + 1).padStart(3, "0")}`;
      return {
        login,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        email: `${login}@example.test`,
        managerId: index === 0 ? "No Manager" : "demo.user001",
        managerName: index === 0 ? "" : managerName,
        department: "Demo",
        jobTitle: index === 0 ? "Demo Manager" : "Demo Employee",
        status: "Active",
      };
    });
  }

  const rows = fs.readFileSync(NAMED_USERS_PATH, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      const [displayName, email, login, managerId, managerName, department, firstName, jobTitle, status] = line.split("\t");
      const lastName = login.split(".").slice(1).join(" ");
      return {
        login,
        firstName,
        lastName,
        displayName,
        email,
        managerId,
        managerName,
        department,
        jobTitle,
        status,
      };
    });
  if (rows.length < count) {
    throw new Error(`Expected at least ${count} named users, found ${rows.length}`);
  }
  return rows.slice(0, count);
}

/**
 * Mix pattern by index (rotating) — entitlements only; managers come from hierarchy:
 * even mixes get entitlements, odd mixes do not
 * every 11th also marked Inactive (still useful for filters)
 */
function scenarioFor(index) {
  return {
    hasEntitlements: true,
    statusLabel: "Active",
    systemStatus: "active",
  };
}

/**
 * Wipe non-admin users and insert the deterministic Loan Hub demo population.
 * @param {import("@prisma/client").PrismaClient} [db]
 * @param {{ maxUsers?: number }} [options]
 */
async function seedNamedUsers(db = prisma, options = {}) {
  if (!DEMO_PASSWORD) {
    throw new Error("SEED_DEMO_PASSWORD must be set before seeding demo users");
  }
  const MAX_USERS = resolveMaxUsers(options.maxUsers);
  const people = loadNamedPeople(MAX_USERS);
  const usingSyntheticData = !fs.existsSync(NAMED_USERS_PATH);
  console.log(`Loaded ${people.length} ${usingSyntheticData ? "synthetic demo" : "local"} Loan Hub users`);
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 8);

  const roles = await db.role.findMany({ select: { id: true, code: true } });
  const roleByCode = Object.fromEntries(roles.map((r) => [r.code, r.id]));
  const assignableIds = assignableEntitlements()
    .map((e) => roleByCode[e.code])
    .filter(Boolean);
  if (assignableIds.length === 0) {
    throw new Error("No assignable entitlements in DB — run npm run db:seed first");
  }

  const count = people.length;
  console.log(`Using ${usingSyntheticData ? "synthetic demo" : "local"} user records`);

  console.log("Clearing Loan Hub demo data…");
  await db.connectorAccessEvent.deleteMany({});
  await db.connectorSite.deleteMany({});
  await db.provisionRequest.deleteMany({});
  await db.auditEvent.deleteMany({});
  await db.userRole.deleteMany({ where: { user: { isSystemAdmin: false } } });
  await db.user.deleteMany({ where: { isSystemAdmin: false } });

  const counts = {
    ents_no_manager: 0,
    active_no_ents: 0,
    complete: 0,
    no_ents_no_manager: 0,
    inactive: 0,
  };

  const userRows = people.map((person, index) => {
    const sc = {
      ...scenarioFor(index),
      statusLabel: person.status,
      systemStatus: String(person.status).toLowerCase() === "active" ? "active" : "disabled",
    };
    const manager = person.managerId && person.managerId !== "No Manager"
      ? { login: person.managerId, displayName: person.managerName }
      : null;
    const mixLabel = manager
      ? sc.hasEntitlements
        ? "complete"
        : "active_no_ents"
      : sc.hasEntitlements
        ? "ents_no_manager"
        : "no_ents_no_manager";
    counts[mixLabel] += 1;
    if (sc.statusLabel === "Inactive") counts.inactive += 1;

    const attributes = {
      user_id: person.login,
      username: person.login,
      first_name: person.firstName,
      last_name: person.lastName,
      display_name: person.displayName,
      email: person.email,
      phone_number: `+1-555-${String(1000 + (index % 9000)).padStart(4, "0")}`,
      employee_id: `E${String(index + 1).padStart(4, "0")}`,
      department: person.department,
      job_title: person.jobTitle,
      user_type: "Employee",
      status: sc.statusLabel,
      failed_login_count: 0,
      created_date: now,
      updated_date: now,
      password_last_changed: now,
      account_expiry_date: null,
      memberofentitlement: [],
    };
    if (manager) {
      attributes.manager_id = manager.login;
      attributes.manager_name = manager.displayName;
    }

    return {
      userId: person.login,
      passwordHash,
      status: sc.systemStatus,
      isSystemAdmin: false,
      attributes,
      loanhubRoles: [],
      _index: index,
      _hasEntitlements: sc.hasEntitlements,
    };
  });

  console.log(`Inserting ${userRows.length} users…`);
  const BATCH = 100;
  const created = [];
  for (let i = 0; i < userRows.length; i += BATCH) {
    const chunk = userRows.slice(i, i + BATCH).map(({ _index, _hasEntitlements, ...row }) => row);
    await db.user.createMany({ data: chunk });
    const logins = userRows.slice(i, i + BATCH).map((r) => r.userId);
    const inserted = await db.user.findMany({
      where: { userId: { in: logins } },
      select: { id: true, userId: true },
    });
    const byLogin = Object.fromEntries(inserted.map((u) => [u.userId, u.id]));
    for (let j = 0; j < logins.length; j += 1) {
      const src = userRows[i + j];
      created.push({
        id: byLogin[logins[j]],
        index: src._index,
        hasEntitlements: src._hasEntitlements,
      });
    }
    process.stdout.write(`  ${Math.min(i + BATCH, userRows.length)}/${userRows.length}\r`);
  }

  console.log("\nAssigning loan entitlements to demo users…");
  const roleLinks = [];
  for (const u of created) {
    if (!u.hasEntitlements || !u.id) continue;
    const count = 1 + (u.index % 3);
    const chosen = new Set();
    for (let k = 0; k < count; k += 1) {
      const roleId = assignableIds[(u.index + k * 5) % assignableIds.length];
      if (roleId) chosen.add(roleId);
    }
    for (const roleId of chosen) {
      roleLinks.push({ userId: u.id, roleId });
    }
  }
  for (let i = 0; i < roleLinks.length; i += 500) {
    await db.userRole.createMany({
      data: roleLinks.slice(i, i + 500),
      skipDuplicates: true,
    });
  }

  console.log("Syncing loanhub_roles…");
  await db.$executeRaw`
    UPDATE users u
    SET loanhub_roles = COALESCE(sub.codes, '[]'::jsonb),
        attributes = jsonb_set(
          COALESCE(u.attributes, '{}'::jsonb),
          '{memberofentitlement}',
          COALESCE(sub.codes, '[]'::jsonb),
          true
        )
    FROM (
      SELECT ur.user_id AS id,
        COALESCE(jsonb_agg(r.code ORDER BY r.code), '[]'::jsonb) AS codes
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      GROUP BY ur.user_id
    ) sub
    WHERE u.id = sub.id
  `;
  await db.$executeRaw`
    UPDATE users
    SET loanhub_roles = '[]'::jsonb,
        attributes = jsonb_set(
          COALESCE(attributes, '{}'::jsonb),
          '{memberofentitlement}',
          '[]'::jsonb,
          true
        )
    WHERE is_system_admin = false
      AND id NOT IN (SELECT DISTINCT user_id FROM user_roles)
  `;

  const noMgr = await db.$queryRaw`
    SELECT COUNT(*)::int AS c FROM users
    WHERE is_system_admin = false
      AND COALESCE(NULLIF(TRIM(attributes->>'manager_id'), ''), NULL) IS NULL
  `;
  const noEnt = await db.$queryRaw`
    SELECT COUNT(*)::int AS c FROM users u
    WHERE u.is_system_admin = false
      AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id)
  `;
  const active = await db.user.count({
    where: { isSystemAdmin: false, status: "active" },
  });

  const stats = {
    total: people.length,
    mix: counts,
    dbNoManager: noMgr[0]?.c,
    dbNoEntitlements: noEnt[0]?.c,
    dbActive: active,
    roleLinks: roleLinks.length,
  };
  console.log("Named users seed complete.");
  console.log(stats);
  return stats;
}

module.exports = {
  seedNamedUsers,
  loadNamedPeople,
  DEFAULT_NAMED_USER_COUNT,
};

if (require.main === module) {
  seedNamedUsers()
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
      await pool.end();
    });
}
