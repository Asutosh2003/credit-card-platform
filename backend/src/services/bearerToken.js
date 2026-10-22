const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const BEARER_TOKEN_PREFIX = "wlh_bearer_";
const TOKEN_FILE =
  process.env.API_BEARER_TOKEN_FILE ||
  path.join(__dirname, "..", "..", ".secrets", "api-bearer-token");

async function readBearerToken() {
  try {
    const token = (await fs.readFile(TOKEN_FILE, "utf8")).trim();
    return token || null;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function generateBearerToken() {
  const token = `${BEARER_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  const directory = path.dirname(TOKEN_FILE);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryFile = `${TOKEN_FILE}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporaryFile, `${token}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fs.rename(temporaryFile, TOKEN_FILE);
  } catch (err) {
    try {
      await fs.unlink(temporaryFile);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") {
        console.error("Failed to remove temporary bearer token file:", cleanupError);
      }
    }
    throw err;
  }
  return token;
}

function isBearerTokenToken(token) {
  return typeof token === "string" && token.startsWith(BEARER_TOKEN_PREFIX);
}

async function matchesBearerToken(token) {
  const storedToken = await readBearerToken();
  if (!storedToken || !isBearerTokenToken(token)) return false;
  const suppliedHash = crypto.createHash("sha256").update(token).digest();
  const storedHash = crypto.createHash("sha256").update(storedToken).digest();
  return crypto.timingSafeEqual(suppliedHash, storedHash);
}

module.exports = {
  readBearerToken,
  generateBearerToken,
  isBearerTokenToken,
  matchesBearerToken,
};
