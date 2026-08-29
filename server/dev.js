/**
 * Dev mode — same as production: one port (APP_URL / PORT from .env).
 * Usage: npm run dev
 */
const { spawn } = require("node:child_process");
const path = require("node:path");

process.env.NODE_ENV = "development";

const { root, port, host, appUrl } = require("./bootstrap");

function tsxCli() {
  return path.join(root, "node_modules/tsx/dist/cli.mjs");
}

function spawnWatch(name, entry) {
  const child = spawn(process.execPath, [tsxCli(), "watch", entry], {
    stdio: "inherit",
    cwd: root,
    env: process.env,
  });
  child.on("exit", (code) => {
    console.error(`${name} exited with code ${code}`);
    process.exit(code ?? 1);
  });
  return child;
}

const worker = spawnWatch("worker", path.join(root, "apps/worker/src/index.ts"));
const api = spawnWatch("api", path.join(root, "apps/api/src/index.ts"));

const shutdown = () => {
  worker.kill("SIGTERM");
  api.kill("SIGTERM");
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("");
console.log("TidySync dev");
console.log(`  App:      ${appUrl}`);
console.log(`  Admin:    ${appUrl}/admin`);
console.log(`  GraphQL:  ${appUrl}/graphql`);
console.log(`  Listen:   ${host}:${port}`);
console.log("");
