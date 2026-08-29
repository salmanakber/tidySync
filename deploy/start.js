const { spawn } = require("node:child_process");
const path = require("node:path");

const procs = [
  { name: "api", cmd: "node", args: [path.join("apps/api/dist/index.js")] },
  { name: "worker", cmd: "node", args: [path.join("apps/worker/dist/index.js")] },
  {
    name: "embedded",
    cmd: "node",
    args: [path.join("apps/embedded/node_modules/next/dist/bin/next"), "start", "-p", "3000"],
  },
  {
    name: "admin",
    cmd: "node",
    args: [path.join("apps/admin/node_modules/next/dist/bin/next"), "start", "-p", "3001"],
  },
];

for (const p of procs) {
  const child = spawn(p.cmd, p.args, { stdio: "inherit", env: process.env });
  child.on("exit", (code) => {
    console.error(`${p.name} exited with code ${code}`);
    process.exit(code ?? 1);
  });
}

console.log("TidySync all services started");
