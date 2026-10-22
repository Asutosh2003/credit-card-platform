const jwt = require("jsonwebtoken");
const { prisma } = require("../prisma");
const { userInclude } = require("../services/helpers");
const { isApiKeyToken, findUserByApiKey } = require("../services/apiKeys");
const {
  isBearerTokenToken,
  matchesBearerToken,
} = require("../services/bearerToken");

const JWT_EXPIRES_IN =
  process.env.JWT_EXPIRES_IN ||
  (process.env.NODE_ENV === "production" ? "30m" : "8h");

function expiresInMs(value) {
  const match = String(value || "30m").match(/^(\d+)([smhd])$/i);
  if (!match) return 30 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] || 60_000;
  return n * mult;
}

const JWT_COOKIE_MAX_AGE = expiresInMs(JWT_EXPIRES_IN);

const leanUserSelect = {
  id: true,
  userId: true,
  status: true,
  isSystemAdmin: true,
  passwordHash: true,
  attributes: true,
};

function getToken(req) {
  const apiKeyHeader = req.headers["x-api-key"];
  if (apiKeyHeader && String(apiKeyHeader).trim()) {
    return String(apiKeyHeader).trim();
  }
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  return null;
}

function authFailure(res, err) {
  if (err?.name === "TokenExpiredError") {
    return res.status(401).json({ error: "Session expired — sign in again", code: "TOKEN_EXPIRED" });
  }
  if (err?.name === "JsonWebTokenError") {
    return res.status(401).json({ error: "Invalid session — sign in again", code: "TOKEN_INVALID" });
  }
  console.error("authenticate error:", err?.message || err);
  return res.status(503).json({
    error: "Authentication service unavailable. Check database connection.",
    code: "AUTH_UNAVAILABLE",
  });
}

async function authenticateWithApiKey(rawKey) {
  const user = await findUserByApiKey(rawKey, leanUserSelect);
  if (!user || user.status === "disabled") return null;
  return user;
}

async function authenticateWithBearerToken(token) {
  if (!(await matchesBearerToken(token))) return null;
  return prisma.user.findFirst({
    where: { isSystemAdmin: true, status: "active" },
    orderBy: { userId: "asc" },
    select: leanUserSelect,
  });
}

/** Fast auth: API key or JWT + lean user row (no roles join). */
async function authenticate(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ error: "Authentication required", code: "NO_TOKEN" });
    }

    if (isBearerTokenToken(token) || isApiKeyToken(token)) {
      const isBearerToken = isBearerTokenToken(token);
      const user = isBearerToken
        ? await authenticateWithBearerToken(token)
        : await authenticateWithApiKey(token);
      if (!user) {
        return res.status(401).json({
          error: isBearerToken ? "Invalid bearer token" : "Invalid API key",
          code: isBearerToken ? "BEARER_TOKEN_INVALID" : "API_KEY_INVALID",
        });
      }
      req.user = user;
      req.auth = {
        sub: user.id,
        userId: user.userId,
        isSystemAdmin: Boolean(user.isSystemAdmin),
        via: isBearerToken ? "bearer_token" : "api_key",
      };
      return next();
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: leanUserSelect,
    });
    if (!user) {
      return res.status(401).json({ error: "Invalid session — sign in again", code: "TOKEN_INVALID" });
    }
    if (user.status === "disabled") {
      return res.status(401).json({ error: "Account is inactive" });
    }
    req.user = user;
    req.auth = payload;
    next();
  } catch (err) {
    return authFailure(res, err);
  }
}

/** Loads roles onto req.user when the route needs entitlements (profile /me). */
async function withRoles(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (req.user.userRoles) return next();
    const full = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: userInclude,
    });
    if (!full || full.status === "disabled") {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.user = full;
    next();
  } catch (err) {
    return authFailure(res, err);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isSystemAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      userId: user.userId,
      isSystemAdmin: Boolean(user.isSystemAdmin),
    },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

module.exports = {
  authenticate,
  withRoles,
  requireAdmin,
  signToken,
  JWT_EXPIRES_IN,
  JWT_COOKIE_MAX_AGE,
  getToken,
  leanUserSelect,
  authFailure,
};
