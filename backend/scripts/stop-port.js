/** Kill anything still listening on the API port (Windows leftover node). */
const { execSync } = require("child_process");

const port = process.env.PORT || 4000;

if (process.platform === "win32") {
  try {
    const out = execSync(
      `netstat -ano | findstr :${port} | findstr LISTENING`,
      { encoding: "utf8" }
    );
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (pid > 0) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F /T`, { stdio: "ignore" });
        console.log(`Stopped process ${pid} on port ${port}`);
      } catch {
        // already gone
      }
    }
    if (pids.size === 0) console.log(`Port ${port} is free`);
  } catch {
    console.log(`Port ${port} is free`);
  }
} else {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
      shell: true,
      stdio: "ignore",
    });
    console.log(`Cleared port ${port}`);
  } catch {
    console.log(`Port ${port} is free`);
  }
}
