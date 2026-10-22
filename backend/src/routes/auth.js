const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { prisma } = require("../prisma");
const { authenticate, signToken, getToken, JWT_EXPIRES_IN, JWT_COOKIE_MAX_AGE, requireAdmin } = require("../middleware/auth");
const {
  generateApiKey,
  encryptApiKey,
  revealApiKeyFromAttrs,
  apiKeyMetaFromAttrs,
  saveApiKeyOnUser,
  clearApiKeyOnUser,
} = require("../services/apiKeys");
const {
  readBearerToken,
  generateBearerToken,
} = require("../services/bearerToken");
const { findUserByLoginIdentifier } = require("../services/loginLookup");
const { publicUser, userInclude, writeAudit } = require("../services/helpers");
const {
  isLoginBlockedByStatus,
  nowIso,
  applyAutoUserAttributes,
} = require("../services/userAttributes");

const router = express.Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: JWT_COOKIE_MAX_AGE,
};

async function bumpFailedLogin(user) {
  if (!user) return;
  const attrs = { ...(user.attributes || {}) };
  attrs.failed_login_count = Number(attrs.failed_login_count || 0) + 1;
  attrs.updated_date = nowIso();
  await prisma.user.update({
    where: { id: user.id },
    data: { attributes: attrs },
  });
}

router.post("/login", async (req, res) => {
  try {
    const loginId = String(req.body?.userId || "").trim();
    const password = req.body?.password;
    if (!loginId || !password) {
      return res.status(400).json({ error: "User ID, email, or full name and password are required" });
    }

    const { user, ambiguous } = await findUserByLoginIdentifier(loginId);
    if (ambiguous) {
      return res.status(401).json({
        error: "Multiple accounts match that name — sign in with User ID or email instead",
      });
    }
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (isLoginBlockedByStatus(user.attributes || {}, user.status)) {
      return res.status(403).json({ error: "Account is inactive" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await bumpFailedLogin(user);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const attrs = { ...(user.attributes || {}) };
    attrs.last_login_date = nowIso();
    attrs.failed_login_count = 0;
    attrs.updated_date = nowIso();

    const [updated] = await Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: { attributes: attrs },
        include: userInclude,
      }),
    ]);

    const token = signToken(updated);
    res.cookie("token", token, cookieOptions);
    writeAudit({
      actorUserId: updated.id,
      action: "login",
      entityType: "user",
      entityId: updated.id,
    });
    return res.json({ token, user: publicUser(updated), expiresIn: JWT_EXPIRES_IN });
  } catch (err) {
    console.error("login error", err);
    const code = err.code || err.meta?.driverAdapterError?.cause?.code;
    if (
      code === "P1008" ||
      code === "ETIMEDOUT" ||
      code === "ECONNREFUSED" ||
      /timeout|terminat|connect/i.test(String(err.message || ""))
    ) {
      return res.status(503).json({
        error:
          "Database unreachable. Check DATABASE_URL (use Session pooler) and restart the API.",
      });
    }
    return res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const token = getToken(req);
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        writeAudit({
          actorUserId: payload.sub,
          action: "logout",
          entityType: "user",
          entityId: payload.sub,
        });
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ error: "Not authenticated", code: "NO_TOKEN" });
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: userInclude,
    });
    if (!user || user.status === "disabled") {
      return res.status(401).json({ error: "Not authenticated", code: "TOKEN_INVALID" });
    }
    return res.json({ user: publicUser(user) });
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired — sign in again", code: "TOKEN_EXPIRED" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid session — sign in again", code: "TOKEN_INVALID" });
    }
    console.error("me error", err.message);
    return res.status(503).json({ error: "Could not verify session" });
  }
});

/** Extend an active (or recently expired) session without re-entering password. */
router.post("/refresh", async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ error: "Not authenticated", code: "NO_TOKEN" });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name !== "TokenExpiredError") {
        return res.status(401).json({ error: "Invalid session — sign in again", code: "TOKEN_INVALID" });
      }
      payload = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
      const expiredMs = Date.now() - payload.exp * 1000;
      if (expiredMs > 7 * 24 * 60 * 60 * 1000) {
        return res.status(401).json({ error: "Session expired — sign in again", code: "TOKEN_EXPIRED" });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: userInclude,
    });
    if (!user || user.status === "disabled") {
      return res.status(401).json({ error: "Not authenticated", code: "TOKEN_INVALID" });
    }

    const newToken = signToken(user);
    res.cookie("token", newToken, cookieOptions);
    return res.json({ token: newToken, user: publicUser(user), expiresIn: JWT_EXPIRES_IN });
  } catch (err) {
    console.error("refresh error", err.message);
    return res.status(503).json({ error: "Could not refresh session" });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const loginId = String(req.body?.userId || "").trim();
    if (!loginId) {
      return res.status(400).json({ error: "User ID, email, or full name is required" });
    }

    const { user } = await findUserByLoginIdentifier(loginId);
    // Always return success to avoid user enumeration
    if (user && user.status !== "disabled") {
      const rawToken = crypto.randomBytes(24).toString("hex");
      const resetTokenHash = await bcrypt.hash(rawToken, 10);
      const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: user.id },
        data: { resetTokenHash, resetTokenExpiresAt },
      });
      console.log(
        `[forgot-password] Reset token for ${user.userId}: ${rawToken} (valid 1h)`
      );
      writeAudit({
        actorUserId: user.id,
        action: "forgot_password",
        entityType: "user",
        entityId: user.id,
      });
    }

    return res.json({
      ok: true,
      message:
        "If the account exists, a reset token was generated. Check server logs in this demo.",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Forgot password failed" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const loginId = String(req.body?.userId || "").trim();
    const { token, newPassword } = req.body || {};
    if (!loginId || !token || !newPassword || newPassword.length < 4) {
      return res.status(400).json({
        error: "User ID, email, or full name, token, and newPassword (min 4 chars) are required",
      });
    }

    const { user, ambiguous } = await findUserByLoginIdentifier(loginId);
    if (ambiguous || !user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }
    if (
      !user ||
      !user.resetTokenHash ||
      !user.resetTokenExpiresAt ||
      user.resetTokenExpiresAt < new Date()
    ) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const ok = await bcrypt.compare(token, user.resetTokenHash);
    if (!ok) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const attrs = applyAutoUserAttributes(user.attributes || {}, {
      isCreate: false,
      existingAttrs: user.attributes || {},
      passwordChanged: true,
    });
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        attributes: attrs,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
    });
    writeAudit({
      actorUserId: user.id,
      action: "reset_password",
      entityType: "user",
      entityId: user.id,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Reset password failed" });
  }
});

router.post("/change-password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword || newPassword.length < 4) {
      return res.status(400).json({
        error: "currentPassword and newPassword (min 4 chars) are required",
      });
    }

    const ok = await bcrypt.compare(currentPassword, req.user.passwordHash);
    if (!ok) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const attrs = applyAutoUserAttributes(req.user.attributes || {}, {
      isCreate: false,
      existingAttrs: req.user.attributes || {},
      passwordChanged: true,
    });
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash, attributes: attrs },
    });
    writeAudit({
      actorUserId: req.user.id,
      action: "change_password",
      entityType: "user",
      entityId: req.user.id,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Change password failed" });
  }
});

/** Long-lived API key for IdentitySphere / external REST clients (admin only). */
router.get("/api-key", authenticate, requireAdmin, async (req, res) => {
  try {
    const row = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { attributes: true },
    });
    const meta = apiKeyMetaFromAttrs(row?.attributes);
    const apiKey = revealApiKeyFromAttrs(row?.attributes);
    return res.json({ ...meta, apiKey: apiKey || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load API key status" });
  }
});

router.post("/api-key", authenticate, requireAdmin, async (req, res) => {
  try {
    const { raw, prefix, hash } = generateApiKey();
    const encrypted = encryptApiKey(raw);
    await saveApiKeyOnUser(req.user.id, { hash, prefix, encrypted });
    writeAudit({
      actorUserId: req.user.id,
      action: "generate_api_key",
      entityType: "user",
      entityId: req.user.id,
      details: { prefix },
    });
    return res.status(201).json({
      apiKey: raw,
      prefix,
      message:
        "API key ready. You can copy or show it anytime from this page.",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to generate API key" });
  }
});

router.delete("/api-key", authenticate, requireAdmin, async (req, res) => {
  try {
    await clearApiKeyOnUser(req.user.id);
    writeAudit({
      actorUserId: req.user.id,
      action: "revoke_api_key",
      entityType: "user",
      entityId: req.user.id,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to revoke API key" });
  }
});

/** Persistent bearer token stored outside the database so reseeding won't invalidate it. */
router.get("/bearer-token", authenticate, requireAdmin, async (req, res) => {
  try {
    const token = await readBearerToken();
    return res.json({
      configured: Boolean(token),
      token,
      prefix: token ? token.slice(0, 16) : null,
    });
  } catch (err) {
    console.error("load bearer token error", err);
    return res.status(500).json({ error: "Failed to load bearer token" });
  }
});

router.post("/bearer-token", authenticate, requireAdmin, async (req, res) => {
  try {
    const token = await generateBearerToken();
    writeAudit({
      actorUserId: req.user.id,
      action: "generate_bearer_token",
      entityType: "user",
      entityId: req.user.id,
    });
    return res.status(201).json({
      configured: true,
      token,
      prefix: token.slice(0, 16),
    });
  } catch (err) {
    console.error("generate bearer token error", err);
    return res.status(500).json({ error: "Failed to generate bearer token" });
  }
});

module.exports = router;
