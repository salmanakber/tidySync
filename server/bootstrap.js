/**
 * Load .env and derive all public URLs from APP_URL + PORT.
 * Set APP_URL to your domain (e.g. https://sync.tidyflowapp.com) — that's it.
 */
const path = require("node:path");
const fs = require("node:fs");

const root = path.join(__dirname, "..");
process.env.TIDYSYNC_ROOT = root;

const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
}

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
const host = process.env.HOST ?? process.env.API_HOST ?? "0.0.0.0";

let appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
if (!appUrl) {
  appUrl = `http://localhost:${port}`;
}

process.env.PORT = String(port);
process.env.API_PORT = String(port);
process.env.HOST = host;
process.env.API_HOST = host;
process.env.APP_URL = appUrl;
process.env.API_URL = appUrl;
process.env.EMBEDDED_APP_URL = appUrl;
process.env.ADMIN_APP_URL = `${appUrl}/admin`;

module.exports = { root, port, host, appUrl };
