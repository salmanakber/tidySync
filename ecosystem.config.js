/** PM2 — API only on port 4000. Restart with: pm2 restart tidysync-api */
module.exports = {
  apps: [
    {
      name: "tidysync-api",
      cwd: "./apps/api",
      script: "dist/index.js",
      env: { NODE_ENV: "production", API_PORT: 4000 },
    },
  ],
};
