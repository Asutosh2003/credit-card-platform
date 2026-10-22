const express = require("express");
const { prisma } = require("../prisma");
const { authenticate, requireAdmin } = require("../middleware/auth");
const {
  serializeProvisionRequest,
  findUserForProvisionRequest,
} = require("../services/joinerCreate");

const router = express.Router();

router.use(authenticate);

/**
 * Connector provision history (IdentitySphere / API key joiners only).
 * View-only — connector creates are auto-accepted.
 */
router.get("/requests", requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || "all").trim();
    const where = {
      source: "identitysphere",
      ...(status === "all" || !status ? {} : { status }),
    };

    const rows = await prisma.provisionRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(req.query.limit) || 100, 500),
    });

    const requests = rows.map((row) => serializeProvisionRequest(row));
    const total = await prisma.provisionRequest.count({
      where: { source: "identitysphere" },
    });

    return res.json({ requests, total });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to list provision history" });
  }
});

/** Poll provision status (admin UI or IdentitySphere API key). */
router.get("/requests/:id", async (req, res) => {
  try {
    const row = await prisma.provisionRequest.findUnique({
      where: { id: req.params.id },
    });
    if (!row) {
      return res.status(404).json({ error: "Provision request not found" });
    }

    if (!req.user.isSystemAdmin && req.auth?.via !== "api_key") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const user = await findUserForProvisionRequest(row);
    return res.json({ request: serializeProvisionRequest(row, user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load provision request" });
  }
});

module.exports = router;
