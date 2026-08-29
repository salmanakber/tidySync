/**
 * One PM2 process: worker (background) + unified HTTP server on API_PORT (default 4000).
 * Embedded, admin, and API share a single port — no 3000/3001 servers.
 */
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const port = process.env.API_PORT ?? "4000";

const worker = spawn("node", [path.join(root, "apps/worker/dist/index.js")], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});

worker.on("exit", (code) => {
  console.error(`worker exited with code ${code}`);
  process.exit(code ?? 1);
});

require(path.join(root, "apps/api/dist/index.js"));

console.log(`TidySync starting on port ${port} (embedded + admin + API)`);
