import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { createYoga } from "graphql-yoga";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { mergeResolvers } from "@graphql-tools/merge";
import { typeDefs, resolvers } from "./graphql/schema";
import { extensionTypeDefs, extensionResolvers } from "./graphql/extensions";
import { buildContext } from "./context";
import { shopify, sessionStorage } from "./shopify/client";
import { ensureTenant } from "./services/tenant";
import { apiKeyAuth } from "./middleware/api-key";
import { prisma, sessionRepository } from "@tidysync/database";
import { attachUiApps } from "./ui";

const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
const API_HOST = process.env.HOST ?? process.env.API_HOST ?? "0.0.0.0";
const publicAppUrl = (process.env.APP_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const embeddedAppUrl = process.env.EMBEDDED_APP_URL ?? publicAppUrl;
const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const app = express();
app.use(cors({ origin: true, credentials: true }));

// Shopify webhooks need raw body for HMAC — register before json parser on webhook route only
app.post(
  "/webhooks/shopify",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const topic = (req.headers["x-shopify-topic"] as string) ?? "";
    const shop = (req.headers["x-shopify-shop-domain"] as string) ?? "";

    try {
      const rawBody = (req.body as Buffer).toString("utf8");
      const valid = await shopify.webhooks.validate({
        rawBody,
        rawRequest: req,
      });
      if (!valid) {
        res.status(401).send("Invalid webhook signature");
        return;
      }

      const payload = JSON.parse(rawBody) as Record<string, unknown>;
      if (
        topic === "APP_SUBSCRIPTIONS_UPDATE" ||
        topic === "APP_PURCHASES_ONE_TIME_UPDATE"
      ) {
        const { handleShopifyBillingWebhook } = await import("./services/billing");
        await handleShopifyBillingWebhook(topic, shop, payload);
      }

      res.status(200).send("ok");
    } catch (err) {
      console.error("Webhook error:", err);
      res.status(500).send("error");
    }
  },
);

app.use(express.json());

const upload = multer({ dest: uploadDir });

const schema = makeExecutableSchema({
  typeDefs: [typeDefs, extensionTypeDefs],
  resolvers: mergeResolvers([resolvers, extensionResolvers]),
});

const yoga = createYoga({
  schema,
  context: buildContext,
  graphqlEndpoint: "/graphql",
});

app.get("/health", async (_req, res) => {
  const { listConfiguredAiProviders } = await import("@tidysync/ai");
  res.json({
    status: "ok",
    app: "TidySync",
    version: "0.2.0",
    ai: {
      provider: process.env.AI_PROVIDER ?? "auto",
      fallbackOrder: process.env.AI_FALLBACK_ORDER ?? "groq,gemini,openai",
      configured: listConfiguredAiProviders(),
    },
  });
});

const beginAuth = async (
  req: express.Request,
  res: express.Response,
) => {
  const shop = req.query.shop as string;
  if (!shop) {
    res.status(400).send("Missing shop parameter");
    return;
  }

  await shopify.auth.begin({
    shop: shopify.utils.sanitizeShop(shop, true)!,
    callbackPath: "/auth/callback",
    isOnline: false,
    rawRequest: req,
    rawResponse: res,
  });
};

app.get("/auth", beginAuth);
app.get("/api/auth", beginAuth);

app.get("/auth/callback", async (req, res) => {
  const callback = await shopify.auth.callback({
    rawRequest: req,
    rawResponse: res,
  });

  const { session } = callback;
  await sessionStorage.storeSession(session);
  await ensureTenant(session.shop);

  // Return into Shopify Admin so App Bridge gets host + can mint idToken
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const host = typeof req.query.host === "string" ? req.query.host : "";
  if (host) {
    const params = new URLSearchParams({
      shop: session.shop,
      host,
      embedded: "1",
    });
    res.redirect(`${embeddedAppUrl}/?${params.toString()}`);
    return;
  }

  if (apiKey) {
    const storeHandle = session.shop.replace(/\.myshopify\.com$/i, "");
    res.redirect(`https://admin.shopify.com/store/${storeHandle}/apps/${apiKey}`);
    return;
  }

  res.redirect(`${embeddedAppUrl}/?shop=${encodeURIComponent(session.shop)}&embedded=1`);
});

app.get("/auth/session", async (req, res) => {
  const shopParam = (req.query.shop as string) ?? "";
  const shop = shopParam ? shopify.utils.sanitizeShop(shopParam, true) : null;
  if (!shop) {
    res.status(400).json({ ok: false, error: "Missing shop" });
    return;
  }
  const offline = await sessionRepository.findOfflineForShop(shop);
  const tenant = await prisma.tenant.findUnique({ where: { shopDomain: shop } });
  res.json({
    ok: Boolean(offline?.accessToken && tenant),
    shop,
    hasOfflineSession: Boolean(offline?.accessToken),
    hasTenant: Boolean(tenant),
  });
});

app.get("/billing/confirm", async (req, res) => {
  const shop = req.query.shop as string;
  const type = req.query.type as "subscription" | "onetime";
  const planSlug = req.query.plan as string | undefined;
  const credits = req.query.credits ? Number(req.query.credits) : undefined;

  if (!shop || !type) {
    res.status(400).send("Missing billing parameters");
    return;
  }

  try {
    const { confirmBillingCharge } = await import("./services/billing");
    let chargeId =
      (req.query.charge_id as string) ??
      (req.query.chargeId as string) ??
      (req.query.id as string);

    if (!chargeId) {
      const tenant = await prisma.tenant.findUnique({ where: { shopDomain: shop } });
      if (tenant) {
        const pending = await prisma.billingCharge.findFirst({
          where: { tenantId: tenant.id, status: "PENDING" },
          orderBy: { createdAt: "desc" },
        });
        chargeId = pending?.shopifyChargeId ?? "";
      }
    }

    const result = await confirmBillingCharge(shop, chargeId, type, planSlug, credits);
    const status = result.ok ? "success" : "declined";
    res.redirect(`${embeddedAppUrl}?shop=${encodeURIComponent(shop)}&billing=${status}&tab=settings`);
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : "Billing confirmation failed");
  }
});

const handleUpload = (req: express.Request, res: express.Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  res.json({
    filePath: req.file.path,
    fileName: req.file.originalname,
  });
};

app.post("/upload", upload.single("file"), handleUpload);
app.post("/api/upload", upload.single("file"), handleUpload);

app.get("/audit/export/all", async (req, res) => {
  const shop = req.headers["x-tidysync-shop"] as string | undefined;
  if (!shop) {
    res.status(401).send("Unauthorized");
    return;
  }
  const tenant = await prisma.tenant.findUnique({ where: { shopDomain: shop } });
  if (!tenant) {
    res.status(404).send("Tenant not found");
    return;
  }
  const logs = await prisma.auditLog.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const header = "time,action,resource_type,resource_id,metadata\n";
  const rows = logs.map((log) => {
    const meta = JSON.stringify(log.metadata ?? {});
    return `${log.createdAt.toISOString()},${log.action},${log.resourceType ?? ""},${log.resourceId ?? ""},${meta.replace(/"/g, "'")}`;
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="tidysync-audit-${tenant.shopDomain}.csv"`);
  res.send(header + rows.join("\n"));
});

app.get("/download/:jobId", async (req, res) => {
  const shop = req.headers["x-tidysync-shop"] as string | undefined;
  if (!shop) {
    res.status(401).send("Unauthorized");
    return;
  }
  const tenant = await prisma.tenant.findUnique({ where: { shopDomain: shop } });
  if (!tenant) {
    res.status(404).send("Tenant not found");
    return;
  }
  const job = await prisma.job.findFirst({
    where: { id: req.params.jobId, tenantId: tenant.id, type: "EXPORT", status: "COMPLETED" },
  });
  if (!job?.filePath || !fs.existsSync(job.filePath)) {
    res.status(404).send("Export file not found");
    return;
  }
  res.download(job.filePath, job.fileName ?? "export.csv");
});

app.get("/jobs/:jobId/events", async (req, res) => {
  const shop = req.headers["x-tidysync-shop"] as string | undefined;
  if (!shop) {
    res.status(401).end();
    return;
  }
  const tenant = await prisma.tenant.findUnique({ where: { shopDomain: shop } });
  if (!tenant) {
    res.status(404).end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();

  const send = async () => {
    const job = await prisma.job.findFirst({
      where: { id: req.params.jobId, tenantId: tenant.id },
    });
    if (!job) return;
    res.write(
      `data: ${JSON.stringify({
        jobId: job.id,
        status: job.status,
        processedCount: job.processedCount,
        successCount: job.successCount,
        failedCount: job.failedCount,
        rowCount: job.rowCount,
      })}\n\n`,
    );
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
      clearInterval(interval);
      res.end();
    }
  };

  const interval = setInterval(send, 1500);
  send();
});

// Public REST API (API key auth)
app.get("/v1/jobs", apiKeyAuth, async (req, res) => {
  const tenantId = (req as express.Request & { tidysyncTenantId?: string }).tidysyncTenantId!;
  const jobs = await prisma.job.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ jobs });
});

app.post("/v1/export", apiKeyAuth, async (req, res) => {
  const tenantId = (req as express.Request & { tidysyncTenantId?: string }).tidysyncTenantId!;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const { exportQueue } = await import("./queues");
  const job = await prisma.job.create({
    data: { tenantId, type: "EXPORT", status: "QUEUED" },
  });
  await exportQueue.add("export", { jobId: job.id, tenantId, shop: tenant.shopDomain });
  res.json({ jobId: job.id });
});

// MCP-style tool manifest for AI agents
app.get("/mcp/tools", (_req, res) => {
  res.json({
    name: "TidySync",
    tools: [
      {
        name: "export_products",
        description: "Export Shopify products to CSV",
        endpoint: "/v1/export",
        method: "POST",
      },
      {
        name: "list_jobs",
        description: "List recent TidySync jobs",
        endpoint: "/v1/jobs",
        method: "GET",
      },
    ],
  });
});

app.post("/internal/notify", async (req, res) => {
  if (req.headers["x-tidysync-internal"] !== (process.env.INTERNAL_SECRET ?? "dev")) {
    res.status(403).end();
    return;
  }
  const { tenantId, jobId, status } = req.body as { tenantId: string; jobId: string; status: string };
  const { notifyJobComplete } = await import("./services/notifications");
  await notifyJobComplete(tenantId, jobId, status);
  res.json({ ok: true });
});

const graphqlHandler = (req: express.Request, res: express.Response) => {
  yoga(req, res);
};

app.all("/graphql", graphqlHandler);
app.all("/api/graphql", graphqlHandler);
app.all("/admin/api/graphql", graphqlHandler);

async function main() {
  await attachUiApps(app);

  app.listen(PORT, API_HOST, () => {
    console.log(`TidySync listening on http://${API_HOST}:${PORT}`);
    console.log(`  Embedded:  ${embeddedAppUrl}`);
    console.log(`  Admin:     ${process.env.ADMIN_APP_URL ?? `${publicAppUrl}/admin`}`);
    console.log(`  GraphQL:   ${publicAppUrl}/graphql`);
  });
}

main().catch((err) => {
  console.error("Failed to start TidySync:", err);
  process.exit(1);
});
