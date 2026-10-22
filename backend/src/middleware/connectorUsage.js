const { prisma } = require("../prisma");

const ATTR_PREFIX = "api_key_prefix";

function resolveSiteName(req) {
  const header =
    req.headers["x-connector-site"] ||
    req.headers["x-client-name"] ||
    req.headers["x-connector-name"];
  if (header && String(header).trim()) {
    return String(header).trim().slice(0, 120);
  }
  const ua = req.headers["user-agent"];
  if (ua && /identitysphere/i.test(String(ua))) {
    return "IdentitySphere Connector";
  }
  return "IdentitySphere Connector";
}

function estimateBytes(body) {
  if (body == null) return 0;
  if (Buffer.isBuffer(body)) return body.length;
  if (typeof body === "string") return Buffer.byteLength(body, "utf8");
  try {
    return Buffer.byteLength(JSON.stringify(body), "utf8");
  } catch {
    return 0;
  }
}

function inferRecordCount(body) {
  if (!body || typeof body !== "object") return null;
  if (Array.isArray(body)) return body.length;
  if (Array.isArray(body.users)) return body.users.length;
  if (Array.isArray(body.roles)) return body.roles.length;
  if (Array.isArray(body.entitlements)) return body.entitlements.length;
  if (Array.isArray(body.items)) return body.items.length;
  if (typeof body.total === "number") return body.total;
  return null;
}

/**
 * After auth, record outbound data for IdentitySphere / REST connector API-key traffic.
 * Safe to mount globally — only logs when req.auth.via === "api_key".
 */
function connectorUsage(req, res, next) {
  let capturedBody = null;
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function jsonInterceptor(body) {
    capturedBody = body;
    return originalJson(body);
  };

  res.send = function sendInterceptor(body) {
    if (capturedBody == null) capturedBody = body;
    return originalSend(body);
  };

  res.on("finish", () => {
    if (req.auth?.via !== "api_key" || !req.user) return;

    const attrs = req.user.attributes || {};
    const keyPrefix = attrs[ATTR_PREFIX] || "unknown";
    const siteName = resolveSiteName(req);
    const bytesFromHeader = Number(res.getHeader("content-length")) || 0;
    const bytesOut = bytesFromHeader || estimateBytes(capturedBody);
    const recordCount = inferRecordCount(capturedBody);
    const path = (req.originalUrl || req.url || "").split("?")[0].slice(0, 255);
    const method = req.method || "GET";
    const statusCode = res.statusCode || 0;

    // Fire-and-forget — never block the response path
    recordUsage({
      keyPrefix,
      siteName,
      ownerUserId: req.user.id,
      method,
      path,
      statusCode,
      bytesOut,
      recordCount,
    }).catch((err) => {
      console.warn("[connector-usage]", err.message || err);
    });
  });

  next();
}

async function recordUsage({
  keyPrefix,
  siteName,
  ownerUserId,
  method,
  path,
  statusCode,
  bytesOut,
  recordCount,
}) {
  const now = new Date();
  const site = await prisma.connectorSite.upsert({
    where: { keyPrefix },
    create: {
      name: siteName,
      keyPrefix,
      ownerUserId,
      totalBytesSent: BigInt(bytesOut),
      totalRequests: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      ownerUserId,
      totalBytesSent: { increment: BigInt(bytesOut) },
      totalRequests: { increment: 1 },
      lastSeenAt: now,
    },
  });

  await prisma.connectorAccessEvent.create({
    data: {
      siteId: site.id,
      method,
      path,
      statusCode,
      bytesOut,
      recordCount: recordCount == null ? null : Number(recordCount),
    },
  });
}

module.exports = { connectorUsage, resolveSiteName, estimateBytes };
