const express = require("express");
const { prisma } = require("../prisma");
const { authenticate, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate, requireAdmin);

function serializeSite(site, ownerLogin = null) {
  return {
    id: site.id,
    name: site.name,
    keyPrefix: site.keyPrefix,
    ownerUserId: site.ownerUserId,
    ownerUserLogin: ownerLogin,
    totalBytesSent: Number(site.totalBytesSent || 0),
    totalRequests: site.totalRequests,
    firstSeenAt: site.firstSeenAt,
    lastSeenAt: site.lastSeenAt,
    createdAt: site.createdAt,
  };
}

function serializeEvent(event) {
  return {
    id: event.id,
    siteId: event.siteId,
    siteName: event.site?.name || null,
    method: event.method,
    path: event.path,
    statusCode: event.statusCode,
    bytesOut: event.bytesOut,
    recordCount: event.recordCount,
    createdAt: event.createdAt,
  };
}

/** List connected connector sites with totals and last activity. */
router.get("/", async (req, res) => {
  try {
    const sites = await prisma.connectorSite.findMany({
      orderBy: { lastSeenAt: "desc" },
    });

    const ownerIds = [...new Set(sites.map((s) => s.ownerUserId).filter(Boolean))];
    const owners =
      ownerIds.length === 0
        ? []
        : await prisma.user.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, userId: true },
          });
    const ownerMap = Object.fromEntries(owners.map((o) => [o.id, o.userId]));

    const totalBytesSent = sites.reduce(
      (sum, s) => sum + Number(s.totalBytesSent || 0),
      0
    );
    const totalRequests = sites.reduce((sum, s) => sum + (s.totalRequests || 0), 0);
    const lastActivityAt =
      sites.length === 0
        ? null
        : sites.reduce(
            (latest, s) =>
              !latest || new Date(s.lastSeenAt) > new Date(latest)
                ? s.lastSeenAt
                : latest,
            null
          );

    return res.json({
      summary: {
        connectedSites: sites.length,
        totalBytesSent,
        totalRequests,
        lastActivityAt,
      },
      sites: sites.map((s) =>
        serializeSite(s, s.ownerUserId ? ownerMap[s.ownerUserId] || null : null)
      ),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to list connector sites" });
  }
});

/** Recent data transfers across all sites (or one site). */
router.get("/events", async (req, res) => {
  try {
    const take = Math.min(Number(req.query.limit) || 100, 500);
    const siteId = req.query.siteId || undefined;

    const events = await prisma.connectorAccessEvent.findMany({
      where: siteId ? { siteId } : undefined,
      orderBy: { createdAt: "desc" },
      take,
      include: {
        site: { select: { id: true, name: true, keyPrefix: true } },
      },
    });

    return res.json({ events: events.map(serializeEvent) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to list connector events" });
  }
});

/** Rename a connected site for clearer admin display. */
router.patch("/:id", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 120);
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }
    const site = await prisma.connectorSite.update({
      where: { id: req.params.id },
      data: { name },
    });
    return res.json({ site: serializeSite(site) });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Connector site not found" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to update connector site" });
  }
});

module.exports = router;
