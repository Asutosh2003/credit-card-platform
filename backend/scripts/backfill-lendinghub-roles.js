/**
 * Rename users.lendinghub_roles to users.loanhub_roles and backfill from user_roles.
 * Run: node scripts/backfill-lendinghub-roles.js
 */
require("dotenv").config();
const { prisma, pool } = require("../src/prisma");

async function main() {
  console.log("Ensuring users.loanhub_roles column…");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    RENAME COLUMN lendinghub_roles TO loanhub_roles
  `).catch(async (error) => {
    if (error.code !== "42701" && error.code !== "42703") throw error;
    await prisma.$executeRawUnsafe(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS loanhub_roles JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
  });

  console.log("Backfilling loanhub_roles from user_roles…");
  await prisma.$executeRaw`
    UPDATE users u
    SET loanhub_roles = COALESCE(sub.codes, '[]'::jsonb)
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
    SET loanhub_roles = '[]'::jsonb
    WHERE id NOT IN (SELECT user_id FROM user_roles)
  `;

  const [sample] = await prisma.$queryRaw`
    SELECT user_id, loanhub_roles
    FROM users
    WHERE jsonb_array_length(loanhub_roles) > 0
    LIMIT 3
  `;
  const [{ count }] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM users
    WHERE jsonb_array_length(loanhub_roles) > 0
  `;

  console.log(`Done. Users with entitlements in loanhub_roles: ${count}`);
  if (sample) {
    console.log("Sample:", sample.user_id, JSON.stringify(sample.loanhub_roles));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
