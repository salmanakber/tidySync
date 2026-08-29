const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const nextBin = path.join(root, "node_modules/next/dist/bin/next");

const procs = [
  {
    name: "embedded",
    cmd: "node",
    args: [nextBin, "start", "apps/embedded", "-p", "3000"],
    cwd: root,
  },
  {
    name: "admin",
    cmd: "node",
    args: [nextBin, "start", "apps/admin", "-p", "3001"],
    cwd: root,
  },
  {
    name: "api",
    cmd: "node",
    args: [path.join(root, "apps/api/dist/index.js")],
    cwd: root,
    env: {
      ...process.env,
      EMBEDDED_INTERNAL_URL: "http://127.0.0.1:3000",
      ADMIN_INTERNAL_URL: "http://127.0.0.1:3001",
    },
  },
  {
    name: "worker",
    cmd: "node",
    args: [path.join(root, "apps/worker/dist/index.js")],
    cwd: root,
  },
];

for (const p of procs) {
  const child = spawn(p.cmd, p.args, {
    stdio: "inherit",
    env: p.env ?? process.env,
    cwd: p.cwd ?? root,
  });
  child.on("exit", (code) => {
    console.error(`${p.name} exited with code ${code}`);
    process.exit(code ?? 1);
  });
}

console.log("TidySync started — public entry http://localhost:4000");
