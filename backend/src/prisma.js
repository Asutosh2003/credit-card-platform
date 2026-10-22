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
  idleTimeoutMillis: 10000,
  max: 10,
  allowExitOnIdle: true,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function disconnectAll() {
  await prisma.$disconnect();
  await pool.end();
}

module.exports = { prisma, pool, disconnectAll };
