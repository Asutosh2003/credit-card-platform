require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const connectionString =
  process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL || "";
const isSupabase = /supabase\.(co|com)/i.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 20000,
  // Keep warm connections — Supabase cold connects are ~1s from APAC clients.
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 60_000) || 60_000,
  max: Number(process.env.PG_POOL_MAX || 10) || 10,
  allowExitOnIdle: false,
  keepAlive: true,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/** Open one connection so the first API request is not a cold TLS handshake. */
async function warmPool() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.warn("Database warm-up failed:", err.message || err);
  }
}

async function disconnectAll() {
  await prisma.$disconnect();
  await pool.end();
}

module.exports = { prisma, pool, disconnectAll, warmPool };
