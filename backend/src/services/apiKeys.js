const crypto = require("crypto");
const { prisma } = require("../prisma");

const API_KEY_PREFIX = "wlh_live_";
const ATTR_HASH = "api_key_hash";
const ATTR_PREFIX = "api_key_prefix";
const ATTR_CREATED = "api_key_created_at";
const ATTR_ENCRYPTED = "api_key_encrypted";

function getEncryptionKey() {
  const secret =
    process.env.API_KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET || "";
  if (!secret) {
    throw new Error(
      "API_KEY_ENCRYPTION_SECRET or JWT_SECRET must be configured to store or retrieve API keys"
    );
  }
  return crypto.scryptSync(secret, "credit-card-platform-api-key", 32);
}

function revealApiKeyFromAttrs(attributes) {
  const attrs = attributes && typeof attributes === "object" ? attributes : {};
  if (!attrs[ATTR_ENCRYPTED]) return null;
  return decryptApiKey(attrs[ATTR_ENCRYPTED]);
}

function hashApiKey(rawKey) {
  return crypto.createHash("sha256").update(String(rawKey)).digest("hex");
}

function generateApiKey() {
  const raw = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  const prefix = raw.slice(0, 16);
  return { raw, prefix, hash: hashApiKey(raw) };
}

function encryptApiKey(rawKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(rawKey), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  });
}

function decryptApiKey(encrypted) {
  const payload = JSON.parse(encrypted);
  if (!payload?.iv || !payload?.tag || !payload?.ciphertext) {
    throw new Error("Stored API key is not in a supported encrypted format");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(payload.iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function isApiKeyToken(token) {
  return typeof token === "string" && token.startsWith(API_KEY_PREFIX);
}

function apiKeyMetaFromAttrs(attributes) {
  const attrs = attributes && typeof attributes === "object" ? attributes : {};
  return {
    configured: Boolean(attrs[ATTR_HASH]),
    prefix: attrs[ATTR_PREFIX] || null,
    createdAt: attrs[ATTR_CREATED] || null,
  };
}

async function findUserByApiKey(rawKey, select) {
  const hash = hashApiKey(rawKey);
  const rows = await prisma.$queryRaw`
    SELECT id
    FROM users
    WHERE attributes->>'api_key_hash' = ${hash}
    LIMIT 1
  `;
  const id = rows?.[0]?.id;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id }, select });
}

async function saveApiKeyOnUser(userId, { hash, prefix, encrypted }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  const attrs = { ...(user.attributes || {}) };
  attrs[ATTR_HASH] = hash;
  attrs[ATTR_PREFIX] = prefix;
  attrs[ATTR_CREATED] = new Date().toISOString();
  attrs[ATTR_ENCRYPTED] = encrypted;
  return prisma.user.update({
    where: { id: userId },
    data: { attributes: attrs },
  });
}

async function clearApiKeyOnUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  const attrs = { ...(user.attributes || {}) };
  delete attrs[ATTR_HASH];
  delete attrs[ATTR_PREFIX];
  delete attrs[ATTR_CREATED];
  delete attrs[ATTR_ENCRYPTED];
  return prisma.user.update({
    where: { id: userId },
    data: { attributes: attrs },
  });
}

module.exports = {
  API_KEY_PREFIX,
  hashApiKey,
  generateApiKey,
  encryptApiKey,
  decryptApiKey,
  revealApiKeyFromAttrs,
  isApiKeyToken,
  apiKeyMetaFromAttrs,
  findUserByApiKey,
  saveApiKeyOnUser,
  clearApiKeyOnUser,
};
