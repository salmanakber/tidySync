/**
 * TidySync entry point — one process, one port.
 * Usage: npm start  (set APP_URL in .env to your domain)
 */
const { spawn } = require("node:child_process");
const path = require("node:path");
const { root, port, host, appUrl } = require("./bootstrap");

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

console.log("");
console.log("TidySync is running");
console.log(`  App:      ${appUrl}`);
console.log(`  Admin:    ${appUrl}/admin`);
console.log(`  GraphQL:  ${appUrl}/graphql`);
console.log(`  Listen:   ${host}:${port}`);
console.log("");
