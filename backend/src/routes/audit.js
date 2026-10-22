const express = require("express");
const { prisma } = require("../prisma");
const { authenticate, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get("/", async (req, res) => {
  try {
    const events = await prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        actor: { select: { id: true, userId: true } },
      },
    });
    return res.json({
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        details: e.details,
        createdAt: e.createdAt,
        actorUserId: e.actorUserId,
        actorUserLogin: e.actor?.userId || null,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to list audit events" });
  }
});

module.exports = router;
