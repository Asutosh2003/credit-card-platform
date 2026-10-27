const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { prisma } = require("../prisma");
const { userInclude } = require("../services/helpers");
const { isApiKeyToken, findUserByApiKey } = require("../services/apiKeys");
const {
  isBearerTokenToken,
  matchesBearerToken,
  getEnvBearerToken,
} = require("../services/bearerToken");
const { cacheGet, cacheSet } = require("../services/authCache");

/** HRMS-style static bearer: no DB round-trip (survives Supabase blips during bulk). */
const CONNECTOR_PRINCIPAL = Object.freeze({
  id: null,
  userId: "identitysphere-connector",
  status: "active",
  isSystemAdmin: true,
  passwordHash: null,
  attributes: { display_name: "IdentitySphere Connector" },
});

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

function credentialCacheKey(kind, raw) {
  const digest = crypto.createHash("sha256").update(String(raw)).digest("hex").slice(0, 24);
  return `auth:${kind}:${digest}`;
}

async function authenticateWithApiKey(rawKey) {
  const key = credentialCacheKey("api", rawKey);
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const user = await findUserByApiKey(rawKey, leanUserSelect);
  const resolved = !user || user.status === "disabled" ? null : user;
  return cacheSet(key, resolved);
}

async function authenticateWithBearerToken(token) {
  const envToken = getEnvBearerToken();
  // Preferred path (Wisbility HRMS pattern): static env bearer, no DB.
  if (envToken && token === envToken) {
    return CONNECTOR_PRINCIPAL;
  }

  const key = credentialCacheKey("bearer", token);
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  if (!(await matchesBearerToken(token))) {
    return cacheSet(key, null);
  }
  // Legacy file-token path removed; env mismatch already handled above.
  return cacheSet(key, null);
}

/** Fast auth: static bearer (preferred), legacy API key, or session JWT. */
async function authenticate(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ error: "Authentication required", code: "NO_TOKEN" });
    }

    // Static API_BEARER_TOKEN first — same model as Wisbility HRMS.
    const envToken = getEnvBearerToken();
    if (envToken && token === envToken) {
      req.user = CONNECTOR_PRINCIPAL;
      req.auth = {
        sub: null,
        userId: CONNECTOR_PRINCIPAL.userId,
        isSystemAdmin: true,
        via: "bearer_token",
      };
      return next();
    }

    if (isBearerTokenToken(token) || isApiKeyToken(token)) {
      const isBearerToken = isBearerTokenToken(token);
      const user = isBearerToken
        ? await authenticateWithBearerToken(token)
        : await authenticateWithApiKey(token);
      if (!user) {
        return res.status(401).json({
          error: isBearerToken
            ? "Invalid bearer token — set API_BEARER_TOKEN in backend/.env"
            : "Invalid API key — prefer API_BEARER_TOKEN (HRMS-style static bearer)",
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
