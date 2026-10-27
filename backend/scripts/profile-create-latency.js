/**
 * Profile POST /api/users latency without printing secrets.
 * Uses API_BEARER_TOKEN from backend/.env.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000";
const TOKEN = String(process.env.API_BEARER_TOKEN || "").trim();

if (!TOKEN) {
  console.error("API_BEARER_TOKEN missing in backend/.env");
  process.exit(1);
}

async function timed(label, fn) {
  const t0 = Date.now();
  const result = await fn();
  const ms = Date.now() - t0;
  console.log(`${label.padEnd(28)} ${String(ms).padStart(5)}ms  http=${result.status}`);
  return { ms, ...result };
}

async function main() {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    "X-Connector-Site": "latency-profile",
  };

  await timed("GET /api/health", async () => {
    const res = await fetch(`${BASE}/api/health`);
    return { status: res.status };
  });

  await timed("GET /api/users?limit=1", async () => {
    const res = await fetch(`${BASE}/api/users?page=1&limit=1`, { headers });
    return { status: res.status };
  });

  // Warm then measure N creates
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const id = `lat_${Date.now()}_${i}`;
    const r = await timed(`POST /api/users #${i + 1}`, async () => {
      const res = await fetch(`${BASE}/api/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          user_id: id,
          email: `${id}@lat.local`,
          first_name: "Lat",
          last_name: `Probe${i}`,
          status: "Active",
        }),
      });
      return { status: res.status };
    });
    samples.push(r.ms);
  }

  // Local CPU: bcrypt cost alone (no network)
  const bcrypt = require("bcryptjs");
  for (const rounds of [4, 6, 8, 10]) {
    const t0 = Date.now();
    await bcrypt.hash("Password@123", rounds);
    console.log(`${`bcrypt.hash cost ${rounds}`.padEnd(28)} ${String(Date.now() - t0).padStart(5)}ms`);
  }

  samples.sort((a, b) => a - b);
  console.log(
    "create p50/p95/max",
    samples[Math.floor(samples.length / 2)],
    samples[samples.length - 1],
    samples[samples.length - 1],
  );

  try {
    const u = new URL(process.env.DATABASE_URL || "");
    console.log("database host", u.hostname);
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
