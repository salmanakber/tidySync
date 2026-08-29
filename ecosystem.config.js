/** PM2 — same as npm start. Restart: npm run pm2:restart */
module.exports = {
  apps: [
    {
      name: "tidysync",
      script: "server/start.js",
    },
  ],
};
