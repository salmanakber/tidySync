import next from "next";
import path from "node:path";
import { parse as parseUrl } from "node:url";
import express, { type Express, type Request, type Response } from "express";

/** Serve embedded + admin inside the same HTTP server (no extra ports). */
export async function attachUiApps(app: Express) {
  const root = process.env.TIDYSYNC_ROOT ?? process.cwd();
  const embeddedDir = path.join(root, "apps/embedded");
  const adminDir = path.join(root, "apps/admin");

  const isDev = process.env.NODE_ENV !== "production";

  const embedded = next({ dev: isDev, dir: embeddedDir });
  const admin = next({ dev: isDev, dir: adminDir });

  await embedded.prepare();
  await admin.prepare();

  const embeddedHandler = embedded.getRequestHandler();
  const adminHandler = admin.getRequestHandler();

  const serveAdmin = (req: Request, res: Response) => {
    adminHandler(req, res, parseUrl(req.url ?? "", true));
  };

  const serveEmbedded = (req: Request, res: Response) => {
    embeddedHandler(req, res, parseUrl(req.url ?? "", true));
  };

  // Admin routes first — must not fall through to embedded (shows merchant UI)
  app.all(/^\/admin(?:\/.*)?$/, serveAdmin);

  // Brand assets from repo /public (logo, etc.)
  app.use("/images", express.static(path.join(root, "public/images")));

  // Everything else → Shopify embedded app (+ marketing pages)
  app.use((req: Request, res: Response) => {
    serveEmbedded(req, res);
  });
}
