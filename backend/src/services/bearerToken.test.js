const assert = require("assert");

async function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete require.cache[require.resolve("./bearerToken")];
  try {
    await fn(require("./bearerToken"));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[require.resolve("./bearerToken")];
  }
}

async function run() {
  await withEnv({ API_BEARER_TOKEN: "dev-local-bearer-token" }, async (mod) => {
    assert.strictEqual(mod.getEnvBearerToken(), "dev-local-bearer-token");
    assert.strictEqual(mod.isEnvBearerConfigured(), true);
    assert.strictEqual(await mod.readBearerToken(), "dev-local-bearer-token");
    assert.strictEqual(mod.isBearerTokenToken("dev-local-bearer-token"), true);
    assert.strictEqual(mod.isBearerTokenToken("wrong"), false);
    assert.strictEqual(await mod.matchesBearerToken("dev-local-bearer-token"), true);
    assert.strictEqual(await mod.matchesBearerToken("wrong"), false);
    await assert.rejects(() => mod.generateBearerToken(), /API_BEARER_TOKEN/);
  });

  await withEnv({ API_BEARER_TOKEN: undefined }, async (mod) => {
    assert.strictEqual(mod.isEnvBearerConfigured(), false);
    assert.strictEqual(await mod.readBearerToken(), null);
    assert.strictEqual(await mod.matchesBearerToken("anything"), false);
  });

  console.log("bearerToken.test.js OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
