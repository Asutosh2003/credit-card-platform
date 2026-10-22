/**
 * Nodemon-safe boot: free PORT before listen so Windows restarts
 * do not crash with EADDRINUSE while the previous process is still releasing the port.
 */
const { execSync } = require("child_process");
const path = require("path");

function ensurePrismaClient() {
  try {
    execSync("npx prisma generate", {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
    });
  } catch (err) {
    console.warn("prisma generate warning:", err.message || err);
  }
}

ensurePrismaClient();
require("./stop-port");
require("../src/index.js");
