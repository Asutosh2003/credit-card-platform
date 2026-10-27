const crypto = require("crypto");

/**
 * HRMS-compatible IdentitySphere auth: one static bearer from API_BEARER_TOKEN
 * in backend/.env. No regenerate/revoke cycle, no DB-stored secrets, no JWT.
 */
function getEnvBearerToken() {
  return String(process.env.API_BEARER_TOKEN || "").trim() || null;
}

function isEnvBearerConfigured() {
  return Boolean(getEnvBearerToken());
}

async function readBearerToken() {
  return getEnvBearerToken();
}

function isBearerTokenToken(token) {
  if (typeof token !== "string" || !token) return false;
  const env = getEnvBearerToken();
  return Boolean(env) && token === env;
}

async function matchesBearerToken(token) {
  const stored = getEnvBearerToken();
  if (!stored || typeof token !== "string" || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** @deprecated File-backed regenerate removed — configure API_BEARER_TOKEN instead. */
async function generateBearerToken() {
  throw new Error(
    "Static bearer only: set API_BEARER_TOKEN in backend/.env (same pattern as Wisbility HRMS) and restart. Do not generate or regenerate connector tokens."
  );
}

module.exports = {
  getEnvBearerToken,
  isEnvBearerConfigured,
  readBearerToken,
  generateBearerToken,
  isBearerTokenToken,
  matchesBearerToken,
};
