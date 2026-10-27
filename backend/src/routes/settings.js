const express = require("express");
const { prisma } = require("../prisma");
const { getEnvBearerToken, isEnvBearerConfigured } = require("../services/bearerToken");

const router = express.Router();

function getBaseUrl() {
  return (
    process.env.API_BASE_URL ||
    process.env.PUBLIC_API_URL ||
    `http://localhost:${process.env.PORT || 4000}`
  ).replace(/\/$/, "");
}

function buildConnectorConfig() {
  return {
    applicationName: "Wisibility Loan Hub",
    baseUrl: getBaseUrl(),
    usersPath: "/api/users",
    usersJsonPath: "users",
    entitlementsPath: "/api/entitlements",
    entitlementsJsonPath: "entitlements",
    userIdField: "id",
    userNameField: "email",
    entitlementIdField: "id",
    entitlementNameField: "name",
    authentication: "Bearer Token",
    bearerTokenConfigured: isEnvBearerConfigured(),
    pagination: "Page + limit",
    pageParameter: "page",
    pageSizeParameter: "limit",
    pageSize: 100,
  };
}

router.get("/", async (req, res) => {
  let databaseConnected = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseConnected = true;
  } catch {
    databaseConnected = false;
  }

  res.json({
    success: true,
    message: "Settings fetched successfully",
    data: {
      application: {
        name: "Wisibility Loan Hub",
        environment: process.env.NODE_ENV === "production" ? "Production" : "Development",
      },
      database: {
        connected: databaseConnected,
        name: "postgres",
      },
      restApi: {
        baseUrl: getBaseUrl(),
        usersEndpoint: "/api/users",
        entitlementsEndpoint: "/api/entitlements",
        authentication: "Bearer Token",
        pagination: "Page + limit",
      },
      connector: buildConnectorConfig(),
    },
  });
});

router.get("/rest-connector", (req, res) => {
  res.json(buildConnectorConfig());
});

/** Local/dev only — same pattern as Wisbility HRMS Settings. */
router.get("/rest-connector/token", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ success: false, message: "Not available in production" });
  }
  const token = getEnvBearerToken();
  if (!token) {
    return res.status(404).json({
      success: false,
      message:
        "API_BEARER_TOKEN is not configured. Add it to backend/.env and restart the server.",
    });
  }
  return res.json({ token });
});

module.exports = router;
