/**
 * Upsert IdentitySphere entitlement schema fields + backfill role attributes.
 * Run: node scripts/backfill-entitlement-fields.js
 */
require("dotenv").config();
const { prisma, pool } = require("../src/prisma");
const {
  DEFAULT_ENTITLEMENTS,
  DEFAULT_ENTITLEMENT_FIELDS,
} = require("../src/entitlements");
const { invalidateSchemaCache } = require("../src/services/cache");

async function main() {
  console.log("Upserting entitlement schema fields…");
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
        options: field.options || [],
        sortOrder: field.sortOrder,
      },
      create: field,
    });
  }
  invalidateSchemaCache("entitlement");

  console.log("Backfilling entitlement attributes…");
  let updated = 0;
  for (const def of DEFAULT_ENTITLEMENTS) {
    const existing = await prisma.role.findUnique({ where: { code: def.code } });
    if (!existing) {
      await prisma.role.create({ data: def });
      updated += 1;
      continue;
    }
    const merged = {
      ...(existing.attributes || {}),
      ...def.attributes,
      // preserve custom owner if already set and def omitted it
      owner:
        def.attributes.owner !== undefined
          ? def.attributes.owner
          : existing.attributes?.owner,
    };
    await prisma.role.update({
      where: { id: existing.id },
      data: { name: def.name, attributes: merged },
    });
    updated += 1;
  }

  console.log(`Done. Entitlements updated: ${updated}. Schema fields: ${DEFAULT_ENTITLEMENT_FIELDS.length}`);
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
