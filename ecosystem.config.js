/** PM2 — one app on PORT (default 4000). Reset: ./scripts/pm2-reset.sh */
module.exports = {
  apps: [
    {
      name: "tidysync",
      script: "server/start.js",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
        HOST: "0.0.0.0",
      },
    },
  ],
};
