const { prisma } = require("../prisma");

const TTL_MS = 60_000;
const store = new Map();

async function getSchemaFields(entityType) {
  const key = `schema:${entityType}`;
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.value;
  }
  const fields = await prisma.schemaField.findMany({
    where: { entityType },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  store.set(key, { at: Date.now(), value: fields });
  return fields;
}

function invalidateSchemaCache(entityType) {
  if (entityType) store.delete(`schema:${entityType}`);
  else {
    for (const key of store.keys()) {
      if (key.startsWith("schema:")) store.delete(key);
    }
  }
}

/** Short-lived cache for expensive dashboard stats */
async function getCached(key, ttlMs, loader) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) {
    return hit.value;
  }
  const value = await loader();
  store.set(key, { at: Date.now(), value });
  return value;
}

function invalidateCache(keyPrefix) {
  for (const key of [...store.keys()]) {
    if (!keyPrefix || key.startsWith(keyPrefix)) store.delete(key);
  }
}

module.exports = {
  getSchemaFields,
  invalidateSchemaCache,
  getCached,
  invalidateCache,
};
