/** Single PM2 app — everything on API_PORT (default 4000). Restart: npm run pm2:restart */
module.exports = {
  apps: [
    {
      name: "tidysync",
      script: "deploy/start.js",
      env: {
        NODE_ENV: "production",
        API_PORT: 4000,
        API_HOST: "0.0.0.0",
      },
    },
  ],
};
