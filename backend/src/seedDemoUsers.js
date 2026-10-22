const bcrypt = require("bcryptjs");
const {
  DEFAULT_ENTITLEMENTS,
  UNASSIGNED_ENTITLEMENT_CODES,
  assignableEntitlements,
} = require("./entitlements");

const DEMO_USER_COUNT = 100;
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;

const FIRST_NAMES = [
  "Aisha", "Ben", "Priya", "Carlos", "Mei", "Omar", "Elena", "Jonah", "Fatima", "Noah",
  "Sofia", "Liam", "Anya", "Diego", "Hana", "Ethan", "Zara", "Mason", "Iris", "Kai",
  "Nina", "Owen", "Leila", "Ryan", "Amira", "Luke", "Sara", "Theo", "Maya", "Jack",
  "Ravi", "Chloe", "Marcus", "Yuki", "Ines", "Viktor", "Naomi", "Felix", "Grace", "Hassan",
];

const LAST_NAMES = [
  "Patel", "Nguyen", "Garcia", "Kim", "Singh", "Brown", "Lopez", "Chen", "Wilson", "Khan",
  "Martinez", "Ali", "Taylor", "Shah", "Anderson", "Park", "Reed", "Costa", "Murphy", "Das",
  "Brooks", "Foster", "Hayes", "Rossi", "Wright",
];

const DEPARTMENTS = [
  "Credit",
  "Lending",
  "Risk",
  "Collections",
  "Administration",
  "Audit",
  "Operations",
];

const JOB_TITLES_BY_LEVEL = {
  exec: ["Chief Credit Officer", "Head of Lending", "Chief Risk Officer", "VP Collections"],
  director: ["Credit Director", "Lending Director", "Risk Director", "Operations Director"],
  manager: ["Team Manager", "Branch Manager", "Portfolio Manager", "Unit Lead"],
  staff: ["Analyst", "Specialist", "Officer", "Associate", "Coordinator"],
  orphan: ["Contractor", "Consultant", "Temp Specialist"],
};

const STATUSES = ["Active", "Active", "Active", "Active", "Active", "Inactive"];

function slug(part) {
  return String(part || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function pick(arr, i) {
  return arr[i % arr.length];
}

function buildDemoPeople(count) {
  const people = [];
  const usedLogins = new Set(["admin"]);
  const comboTotal = FIRST_NAMES.length * LAST_NAMES.length;

  if (count > comboTotal) {
    throw new Error(
      `Cannot seed ${count} unique firstname.lastname users — max ${comboTotal} combinations`
    );
  }

  for (let i = 0; i < count; i += 1) {
    const fi = i % FIRST_NAMES.length;
    const li = Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length;
    const first = FIRST_NAMES[fi];
    const last = LAST_NAMES[li];
    const login = `${slug(first)}.${slug(last)}`;

    if (usedLogins.has(login)) {
      throw new Error(`Duplicate user id generated: ${login}`);
    }
    usedLogins.add(login);

    const seq = String(i + 1).padStart(4, "0");
    people.push({
      index: i,
      first,
      last,
      login,
      displayName: `${first} ${last}`,
      employeeId: `E${seq}`,
    });
  }

  // Hierarchy sizes scaled to DEMO_USER_COUNT (exec → director → manager → staff)
  const execCount = Math.max(1, Math.round(count * 0.008));
  const directorCount = Math.max(2, Math.round(count * 0.024));
  const managerCount = Math.max(5, Math.round(count * 0.096));
  const orphanCount = Math.max(3, Math.round(count * 0.05));
  const staffCount = count - execCount - directorCount - managerCount - orphanCount;
  if (staffCount < 0) {
    throw new Error(
      `Hierarchy sizes exceed count=${count} (exec=${execCount}, director=${directorCount}, manager=${managerCount}, orphan=${orphanCount})`
    );
  }

  let cursor = 0;
  const assignLevel = (n, level) => {
    const slice = people.slice(cursor, cursor + n);
    slice.forEach((p) => {
      p.level = level;
    });
    cursor += n;
    return slice;
  };

  const execs = assignLevel(execCount, "exec");
  const directors = assignLevel(directorCount, "director");
  const managers = assignLevel(managerCount, "manager");
  const staff = assignLevel(staffCount, "staff");
  const orphans = assignLevel(orphanCount, "orphan");

  directors.forEach((p, i) => {
    p.manager = execs[i % execs.length];
  });
  managers.forEach((p, i) => {
    p.manager = directors[i % directors.length];
  });
  staff.forEach((p, i) => {
    p.manager = managers[i % managers.length];
  });
  // orphans / execs: no manager

  return { people, execs, directors, managers, staff, orphans };
}

function buildAttributes(person, now) {
  const dept = pick(DEPARTMENTS, person.index);
  const titles = JOB_TITLES_BY_LEVEL[person.level] || JOB_TITLES_BY_LEVEL.staff;
  const status = pick(STATUSES, person.index * 3);
  const attrs = {
    user_id: person.login,
    username: person.login,
    first_name: person.first,
    last_name: person.last,
    display_name: person.displayName,
    email: `${person.login}@example.test`,
    phone_number: `+1-555-${String(1000 + (person.index % 9000)).padStart(4, "0")}`,
    employee_id: person.employeeId,
    department: dept,
    job_title: pick(titles, person.index),
    user_type: person.level === "orphan" ? "Contractor" : "Employee",
    status,
    failed_login_count: person.index % 11 === 0 ? person.index % 4 : 0,
    created_date: now,
    updated_date: now,
    password_last_changed: now,
    account_expiry_date: null,
    memberofentitlement: [],
  };

  if (person.manager) {
    attrs.manager_id = person.manager.login;
    attrs.manager_name = person.manager.displayName;
  }

  return attrs;
}

/**
 * Wipe non-admin users and insert DEMO_USER_COUNT demo employees
 * with manager hierarchy + selective entitlement assignments.
 */
async function seedDemoUsers(prisma) {
  if (!DEMO_PASSWORD) {
    throw new Error("SEED_DEMO_PASSWORD must be set before seeding demo users");
  }
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 8);

  console.log("Clearing non-admin users…");
  await prisma.userRole.deleteMany({
    where: { user: { isSystemAdmin: false } },
  });
  await prisma.user.deleteMany({
    where: { isSystemAdmin: false },
  });

  const roles = await prisma.role.findMany({ select: { id: true, code: true } });
  const roleByCode = Object.fromEntries(roles.map((r) => [r.code, r.id]));
  const assignableCodes = assignableEntitlements().map((e) => e.code);
  const assignableIds = assignableCodes
    .map((c) => roleByCode[c])
    .filter(Boolean);

  const unassignedPresent = UNASSIGNED_ENTITLEMENT_CODES.filter((c) => roleByCode[c]);
  console.log(
    `Entitlements: ${roles.length} total, ${assignableIds.length} assignable, ` +
      `${unassignedPresent.length} kept unassigned (${unassignedPresent.join(", ") || "none"})`
  );

  const { people } = buildDemoPeople(DEMO_USER_COUNT);
  console.log(
    `User IDs: ${DEMO_USER_COUNT} unique firstname.lastname values (no numeric suffixes)`
  );
  const userRows = people.map((person) => {
    const attributes = buildAttributes(person, now);
    const systemStatus =
      String(attributes.status).toLowerCase() === "active" ? "active" : "disabled";
    return {
      userId: person.login,
      passwordHash,
      status: systemStatus,
      isSystemAdmin: false,
      attributes,
      _person: person,
    };
  });

  console.log(`Inserting ${userRows.length} users…`);
  const createdIds = [];
  const BATCH = 100;
  for (let i = 0; i < userRows.length; i += BATCH) {
    const chunk = userRows.slice(i, i + BATCH).map(({ _person, ...row }) => row);
    await prisma.user.createMany({ data: chunk });
    const logins = userRows.slice(i, i + BATCH).map((r) => r.userId);
    const inserted = await prisma.user.findMany({
      where: { userId: { in: logins } },
      select: { id: true, userId: true },
    });
    const byLogin = Object.fromEntries(inserted.map((u) => [u.userId, u.id]));
    for (let j = 0; j < logins.length; j += 1) {
      const login = logins[j];
      const person = userRows[i + j]._person;
      createdIds.push({ id: byLogin[login], login, index: person.index });
    }
    process.stdout.write(`  ${Math.min(i + BATCH, userRows.length)}/${userRows.length}\r`);
  }
  console.log(`\nAssigning entitlements…`);

  // ~15% of users get no entitlements; rest get 1–3 from assignable only
  const roleLinks = [];
  for (const u of createdIds) {
    if (u.index % 7 === 0) continue; // no entitlements
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
    await prisma.userRole.createMany({
      data: roleLinks.slice(i, i + 500),
      skipDuplicates: true,
    });
  }

  console.log(`Syncing loanhub_roles…`);
  await prisma.$executeRaw`
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
  await prisma.$executeRaw`
    UPDATE users
    SET loanhub_roles = '[]'::jsonb,
        attributes = jsonb_set(
          COALESCE(attributes, '{}'::jsonb),
          '{memberofentitlement}',
          '[]'::jsonb,
          true
        )
    WHERE id NOT IN (SELECT DISTINCT user_id FROM user_roles)
      AND (loanhub_roles IS NULL OR loanhub_roles::text = 'null')
  `;

  const withMgr = people.filter((p) => p.manager).length;
  const noMgr = people.length - withMgr;
  const noEntApprox = createdIds.filter((u) => u.index % 7 === 0).length;

  console.log(
    `Demo users ready: ${people.length} users | hierarchy with managers: ${withMgr} | ` +
      `no manager: ${noMgr} | no entitlements: ~${noEntApprox} | ` +
      `role links: ${roleLinks.length}`
  );

  return {
    users: people.length,
    uniqueUserIds: people.length,
    withManager: withMgr,
    withoutManager: noMgr,
    withoutEntitlements: noEntApprox,
    entitlementsTotal: DEFAULT_ENTITLEMENTS.length,
    unassignedEntitlements: unassignedPresent,
  };
}

module.exports = { seedDemoUsers, DEMO_USER_COUNT };
