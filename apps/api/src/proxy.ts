import type { Express } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

/** Proxy embedded (3000) and admin (3001) through the API port (4000). */
export function registerUiProxies(app: Express) {
  const embedded =
    process.env.EMBEDDED_INTERNAL_URL ?? "http://127.0.0.1:3000";
  const admin = process.env.ADMIN_INTERNAL_URL ?? "http://127.0.0.1:3001";

  app.use(
    "/admin",
    createProxyMiddleware({
      target: admin,
      changeOrigin: true,
      ws: true,
    }),
  );

  app.use(
    createProxyMiddleware({
      target: embedded,
      changeOrigin: true,
      ws: true,
    }),
  );
}
