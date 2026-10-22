require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { disconnectAll } = require("./prisma");

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const rolesRoutes = require("./routes/roles");
const schemaRoutes = require("./routes/schema");
const auditRoutes = require("./routes/audit");
const healthRoutes = require("./routes/health");

const app = express();
const PORT = Number(process.env.PORT) || 4000;
/** Bind address — 0.0.0.0 allows localhost and LAN clients */
const HOST = process.env.HOST || "0.0.0.0";
/**
 * Public base URL for this API (no trailing slash).
 * Configure per environment (localhost, LAN hostname, or hosted URL).
 * Not used for routing — for clients / connectors / startup visibility.
 */
const API_BASE_URL = (
  process.env.API_BASE_URL ||
  process.env.PUBLIC_API_URL ||
  `http://localhost:${PORT}`
).replace(/\/$/, "");

const DEFAULT_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
];

/**
 * CORS_ORIGINS:
 * - unset → default local Vite origins
 * - "*" → reflect any Origin (LAN / hosted frontends without hardcoding IPs)
 * - comma-separated list → exact allowlist
 */
function resolveCorsOrigin() {
  const raw = process.env.CORS_ORIGINS;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return DEFAULT_CORS_ORIGINS;
  }
  const value = String(raw).trim();
  if (value === "*") {
    return true;
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

app.use(
  cors({
    origin: resolveCorsOrigin(),
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(require("./middleware/timing").requestTiming);
app.use(require("./middleware/connectorUsage").connectorUsage);
app.use(require("./middleware/compression").compression);

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/users", usersRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/entitlements", rolesRoutes);
app.use("/api/schema", schemaRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/connectors", require("./routes/connectors"));
app.use("/api/provision", require("./routes/provision"));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

let server = null;
let shuttingDown = false;

async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nShutting down (${reason})…`);

  // Keep short so nodemon can restart without port conflicts on Windows
  const forceTimer = setTimeout(() => {
    console.warn("Shutdown timed out — forcing exit");
    process.exit(1);
  }, 1500);

  try {
    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve());
        // Don't hang on keep-alive clients during nodemon restart
        setTimeout(resolve, 800);
      });
      server = null;
    }
    await Promise.race([
      disconnectAll(),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
  } catch (err) {
    console.error("Shutdown error:", err.message);
  }

  clearTimeout(forceTimer);
  process.exit(0);
}

function bindSignals() {
  const stop = (signal) => {
    shutdown(signal).catch(() => process.exit(1));
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  if (process.platform === "win32") {
    process.on("SIGBREAK", () => stop("SIGBREAK"));
  }
}

async function start() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
  }

  const { prisma } = require("./prisma");
  if (!prisma.provisionRequest) {
    throw new Error(
      "Prisma client is out of date (missing provisionRequest). " +
        "Run: npm run db:generate --prefix backend — then restart npm run dev"
    );
  }

  if (process.env.BOOTSTRAP_ON_START === "1") {
    try {
      const { ensureSeeded } = require("./bootstrap");
      await ensureSeeded();
    } catch (err) {
      console.warn("Bootstrap warning (continuing):", err.code || err.message);
    }
  }

  bindSignals();

  server = app.listen(PORT, HOST, () => {
    console.log(`Wisibility Loan Hub API listening on ${HOST}:${PORT}`);
    console.log(`  Local:     http://localhost:${PORT}`);
    console.log(`  API base:  ${API_BASE_URL}`);
    console.log(`  Health:    ${API_BASE_URL}/api/health`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use. Run: npm run stop --prefix backend (then restart)`
      );
    } else {
      console.error("Server error:", err);
    }
    process.exit(1);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
