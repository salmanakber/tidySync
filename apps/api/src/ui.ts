import next from "next";
import path from "node:path";
import type { Express, Request, Response } from "express";

/** Serve embedded + admin inside the same HTTP server (no extra ports). */
export async function attachUiApps(app: Express) {
  const root = process.env.TIDYSYNC_ROOT ?? process.cwd();
  const embeddedDir = path.join(root, "apps/embedded");
  const adminDir = path.join(root, "apps/admin");

  const embedded = next({ dev: false, dir: embeddedDir });
  const admin = next({ dev: false, dir: adminDir });

  await embedded.prepare();
  await admin.prepare();

  const embeddedHandler = embedded.getRequestHandler();
  const adminHandler = admin.getRequestHandler();

  app.use((req: Request, res: Response) => {
    const p = req.path;
    if (p === "/admin" || p.startsWith("/admin/")) {
      adminHandler(req, res);
      return;
    }
    embeddedHandler(req, res);
  });
}
