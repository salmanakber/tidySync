import next from "next";
import path from "node:path";
import type { Express, Request, Response } from "express";

/** Serve embedded + admin Next apps on the same Express server (one port). */
export async function attachUiApps(app: Express) {
  const embeddedDir = path.join(__dirname, "../../embedded");
  const adminDir = path.join(__dirname, "../../admin");

  const embedded = next({ dev: false, dir: embeddedDir });
  const admin = next({ dev: false, dir: adminDir });

  await embedded.prepare();
  await admin.prepare();

  const embeddedHandler = embedded.getRequestHandler();
  const adminHandler = admin.getRequestHandler();

  const serveAdmin = (req: Request, res: Response) => adminHandler(req, res);
  const serveEmbedded = (req: Request, res: Response) => embeddedHandler(req, res);

  app.all("/admin", serveAdmin);
  app.all("/admin/*", serveAdmin);
  app.all("*", serveEmbedded);
}
