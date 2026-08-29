module.exports = {
  apps: [
    {
      name: "tidysync-api",
      cwd: "./apps/api",
      script: "dist/index.js",
      env: { NODE_ENV: "production", API_PORT: 4000 },
    },
    {
      name: "tidysync-worker",
      cwd: "./apps/worker",
      script: "dist/index.js",
      env: { NODE_ENV: "production" },
    },
    {
      name: "tidysync-embedded",
      cwd: "./apps/embedded",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: { NODE_ENV: "production" },
    },
    {
      name: "tidysync-admin",
      cwd: "./apps/admin",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      env: { NODE_ENV: "production" },
    },
  ],
};
