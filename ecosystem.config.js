/**
 * PM2 — all UIs and API on public port 4000 (embedded/admin run internally on 3000/3001).
 * Restart: npm run pm2:restart
 */
module.exports = {
  apps: [
    {
      name: "tidysync-embedded",
      cwd: ".",
      script: "node_modules/next/dist/bin/next",
      args: "start apps/embedded -p 3000",
      env: { NODE_ENV: "production" },
    },
    {
      name: "tidysync-admin",
      cwd: ".",
      script: "node_modules/next/dist/bin/next",
      args: "start apps/admin -p 3001",
      env: { NODE_ENV: "production" },
    },
    {
      name: "tidysync-api",
      cwd: "./apps/api",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
        API_PORT: 4000,
        EMBEDDED_INTERNAL_URL: "http://127.0.0.1:3000",
        ADMIN_INTERNAL_URL: "http://127.0.0.1:3001",
      },
    },
    {
      name: "tidysync-worker",
      cwd: "./apps/worker",
      script: "dist/index.js",
      env: { NODE_ENV: "production" },
    },
  ],
};
