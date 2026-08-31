import { prisma, tenantRepository, jobRepository, type Job, type JobStatus } from "@tidysync/database";
import {
  detectAnomalies,
  buildImpactSummary,
  detectPlatformFromHeaders,
  detectPlatformWithConfidence,
  validateImportMappings,
  resolveRedisUrl,
  type ImportMutationPlan,
} from "@tidysync/shared";
import { consumeAiCredit } from "../services/tenant";
import {
  createPlanSubscription,
  createCreditTopUpPurchase,
  listAvailablePlans,
  computeAiCreditsRemaining,
} from "../services/billing";
import { computeAgentRunsRemaining } from "../services/tenant-limits";
import {
  importQueue,
  exportQueue,
  bulkEditQueue,
  undoQueue,
} from "../queues";
import { getShopGraphqlClient, refreshOfflineTokenFromSession } from "../shopify/client";
import { parseFileHeaders, parseFilePreview } from "../services/file-parser";
import { fetchProductsForExport, buildDiffFromMutationPlan } from "../services/shopify-products";
import type { GoogleSheetsConfig } from "../services/google-sheets";
import {
  type GraphQLContext,
  requireMerchant,
  requireActiveMerchant,
  requireAdmin,
} from "../context";

export const typeDefs = `#graphql
  scalar JSON
  scalar DateTime

  enum JobStatus {
    PENDING
    MAPPING
    PREVIEW
    APPROVED
    QUEUED
    RUNNING
    PAUSED
    COMPLETED
    FAILED
    CANCELLED
  }

  enum JobType {
    IMPORT
    EXPORT
    BULK_EDIT
    UNDO
    CATALOG_HEALTH_SCAN
    CONTENT_REWRITE
    BACKUP
    AGENT_RUN
    SUPPLIER_FEED_SYNC
  }

  type Plan {
    id: ID!
    name: String!
    slug: String!
    maxProducts: Int!
    aiCreditsPerMonth: Int!
    aiCreditsRemaining: Int
    maxBackups: Int!
    backupRetentionDays: Int!
    maxBackupProducts: Int!
    agentEnabled: Boolean!
    agentRunsPerMonth: Int!
    scheduledJobs: Boolean!
    crossPlatform: Boolean!
    multiStore: Boolean!
    priceMonthlyCents: Int!
    isFree: Boolean!
    shopifyPlanName: String
  }

  type Tenant {
    id: ID!
    shopDomain: String!
    shopName: String
    status: String!
    billingStatus: String!
    billingBypass: Boolean!
    installApproved: Boolean!
    adminNotes: String
    installedAt: DateTime!
    productCount: Int!
    skuCount: Int!
    aiCreditsUsed: Int!
    extraAiCredits: Int!
    agentRunsUsed: Int!
    agentRunsRemaining: Int
    plan: Plan
  }

  type TenantJobStats {
    total: Int!
    running: Int!
    failed: Int!
    completed: Int!
  }

  type BillingChargeSummary {
    id: ID!
    type: String!
    status: String!
    amountCents: Int!
    createdAt: DateTime!
    plan: Plan
  }

  type TenantDetail {
    tenant: Tenant!
    jobStats: TenantJobStats!
    recentJobs: [Job!]!
    billingCharges: [BillingChargeSummary!]!
    aiOperationsCount: Int!
    auditLogCount: Int!
  }

  type BillingConfirmation {
    confirmationUrl: String!
    chargeId: String!
  }

  type ApiKey {
    id: ID!
    name: String!
    keyPrefix: String!
    scopes: [String!]!
    lastUsedAt: DateTime
    createdAt: DateTime!
    tenant: ApiKeyTenant
  }

  type ApiKeyTenant {
    shopDomain: String!
  }

  type ApiKeyCreated {
    id: ID!
    name: String!
    keyPrefix: String!
    rawKey: String!
    scopes: [String!]!
  }

  type JobLineItem {
    id: ID!
    rowIndex: Int!
    resourceType: String
    resourceId: String
    status: String!
    beforeValue: JSON
    afterValue: JSON
    errorMessage: String
    autoFixSuggestion: String
  }

  type Job {
    id: ID!
    type: JobType!
    status: JobStatus!
    resourceType: String!
    sourcePlatform: String
    targetPlatform: String
    fileName: String
    rowCount: Int!
    processedCount: Int!
    successCount: Int!
    failedCount: Int!
    skippedCount: Int!
    mutationPlan: JSON
    diffPreview: JSON
    impactSummary: String
    errorSummary: String
    nlPrompt: String
    isAiGenerated: Boolean!
    approvedAt: DateTime
    startedAt: DateTime
    finishedAt: DateTime
    createdAt: DateTime!
    lineItems: [JobLineItem!]!
  }

  type FieldMappingSuggestion {
    sourceColumn: String!
    targetField: String!
    suggested: Boolean!
    confidence: Float
    matchReason: String
  }

  type PlatformProfile {
    id: ID!
    platformKey: String!
    version: String!
    name: String!
    mappings: JSON!
  }

  type MappingTemplate {
    id: ID!
    name: String!
    platformKey: String!
    mappings: JSON!
  }

  type AdminUser {
    id: ID!
    email: String!
    name: String
    role: String!
  }

  input PlanUpdateInput {
    maxProducts: Int
    aiCreditsPerMonth: Int
    maxBackups: Int
    backupRetentionDays: Int
    maxBackupProducts: Int
    agentEnabled: Boolean
    agentRunsPerMonth: Int
    scheduledJobs: Boolean
    crossPlatform: Boolean
    multiStore: Boolean
    priceMonthlyCents: Int
    isFree: Boolean
    shopifyPlanName: String
  }

  type AuthPayload {
    token: String!
    user: AdminUser!
  }

  type Query {
    health: String!
    meTenant(refreshCatalog: Boolean): Tenant
    availablePlans: [Plan!]!
    jobs(limit: Int = 8): [Job!]!
    job(id: ID!): Job
    platformProfiles: [PlatformProfile!]!
    mappingTemplates: [MappingTemplate!]!
    adminTenants(limit: Int = 50): [Tenant!]!
    adminJobs(limit: Int = 100, status: JobStatus): [Job!]!
    adminJobStats: JSON!
    adminPlans: [Plan!]!
    adminSystemHealth: JSON!
    adminApiKeys(tenantId: ID): [ApiKey!]!
    adminTenantDetail(tenantId: ID!): TenantDetail!
  }

  type Mutation {
    adminLogin(email: String!, password: String!): AuthPayload!
    createExportJob(format: String, platformKey: String, resourceType: String): Job!
    uploadImportFile(filePath: String!, fileName: String!, resourceType: String): Job!
    suggestFieldMappings(jobId: ID!, platformKey: String!, useAi: Boolean): [FieldMappingSuggestion!]!
    updateJobMappings(jobId: ID!, mappings: JSON!): Job!
    generateNlBulkEdit(prompt: String!): Job!
    approveJob(jobId: ID!): Job!
    undoJob(jobId: ID!): Job!
    saveMappingTemplate(name: String!, platformKey: String!, mappings: JSON!): MappingTemplate!
    cancelJob(jobId: ID!): Job!
    createPlanSubscription(planSlug: String!): BillingConfirmation!
    purchaseCreditTopUp(credits: Int!): BillingConfirmation!
    adminUpdateTenantPlan(tenantId: ID!, planSlug: String!): Tenant!
    adminUpdateTenantStatus(tenantId: ID!, status: String!): Tenant!
    adminGrantCredits(tenantId: ID!, credits: Int!): Tenant!
    adminUpdateTenantBillingBypass(tenantId: ID!, billingBypass: Boolean!): Tenant!
    adminUpdateTenantInstallApproved(tenantId: ID!, installApproved: Boolean!): Tenant!
    adminUpdateTenantNotes(tenantId: ID!, notes: String): Tenant!
    adminUpdatePlan(planId: ID!, input: PlanUpdateInput!): Plan!
    adminGrantPaidAccess(tenantId: ID, shopDomain: String, planSlug: String!): Tenant!
    adminCreateApiKey(tenantId: ID!, name: String!, scopes: [String!]): ApiKeyCreated!
    adminRevokeApiKey(id: ID!): Boolean!
  }
`;

function mapTenant(tenant: NonNullable<Awaited<ReturnType<typeof tenantRepository.findById>>>) {
  return {
    ...tenant,
    agentRunsRemaining: computeAgentRunsRemaining({
      agentRunsUsed: tenant.agentRunsUsed,
      plan: tenant.plan,
    }),
    plan: tenant.plan
      ? {
          ...tenant.plan,
          aiCreditsRemaining: computeAiCreditsRemaining(tenant),
        }
      : null,
  };
}

export const resolvers = {
  JSON: {
    serialize: (v: unknown) => v,
    parseValue: (v: unknown) => v,
    parseLiteral: (ast: { value: unknown }) => ast.value,
  },
  DateTime: {
    serialize: (v: Date) => v.toISOString(),
    parseValue: (v: string) => new Date(v),
  },
  Query: {
    health: () => "ok",
    availablePlans: async () => listAvailablePlans(),
    meTenant: async (
      _: unknown,
      args: { refreshCatalog?: boolean },
      ctx: GraphQLContext,
    ) => {
      const { tenantId, shop } = requireMerchant(ctx);
      let tenant = await tenantRepository.findById(tenantId);
      if (!tenant) return null;
      if (shop) {
        const forceRefresh = args.refreshCatalog ?? tenant.productCount === 0;
        tenant =
          (await import("../services/tenant").then((m) =>
            m.refreshTenantCatalogCounts(tenantId, shop, ctx.sessionToken, forceRefresh),
          )) ?? tenant;
      }
      return mapTenant(tenant);
    },
    jobs: async (_: unknown, args: { limit?: number }, ctx: GraphQLContext) => {
      const { tenantId } = requireMerchant(ctx);
      const { reconcileStaleJobsForTenant } = await import("../services/stale-jobs");
      await reconcileStaleJobsForTenant(tenantId);
      const jobs = await jobRepository.listForTenant(tenantId, args.limit ?? 8);
      return jobs.map(mapJob);
    },
    job: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const { tenantId } = requireMerchant(ctx);
      const job = await jobRepository.findForTenant(tenantId, args.id);
      return job ? mapJob(job) : null;
    },
    platformProfiles: async () => {
      return prisma.platformFieldMap.findMany({
        where: { isGlobal: true },
      });
    },
    mappingTemplates: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const { tenantId } = requireMerchant(ctx);
      return prisma.mappingTemplate.findMany({ where: { tenantId } });
    },
    adminTenants: async (_: unknown, args: { limit?: number }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      return tenantRepository.listForAdmin(args.limit ?? 50);
    },
    adminJobs: async (
      _: unknown,
      args: { limit?: number; status?: string },
      ctx: GraphQLContext,
    ) => {
      requireAdmin(ctx);
      return jobRepository.listForAdmin(args.limit ?? 100, args.status as JobStatus | undefined);
    },
    adminJobStats: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      const [total, running, failed, completed] = await jobRepository.countByStatus();
      return { total, running, failed, completed };
    },
    adminPlans: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      return listAvailablePlans();
    },
    adminSystemHealth: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      const { getRedisConnection } = await import("../queues");
      const redis = getRedisConnection();
      let redisOk = false;
      try {
        const pong = await redis.ping();
        redisOk = pong === "PONG";
      } catch {
        redisOk = false;
      }
      const [tenantCount, jobCounts] = await Promise.all([
        prisma.tenant.count({ where: { status: "ACTIVE" } }),
        jobRepository.countByStatus(),
      ]);
      const { applyAiSettingsToRuntime } = await import("../services/ai-settings");
      await applyAiSettingsToRuntime();
      const { getAiProviderStatus } = await import("@tidysync/ai");
      const aiStatus = getAiProviderStatus();
      return {
        redis: redisOk ? "ok" : "error",
        activeTenants: tenantCount,
        aiProviders: aiStatus.configuredProviders,
        aiProviderMode: aiStatus.providerMode,
        aiFallbackOrder: aiStatus.fallbackOrder,
        aiRuntimeSource: aiStatus.runtimeSource,
        jobs: {
          total: jobCounts[0],
          running: jobCounts[1],
          failed: jobCounts[2],
          completed: jobCounts[3],
        },
        stuckJobs: await prisma.job.count({
          where: {
            status: "RUNNING",
            startedAt: { lt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
          },
        }),
        shopifyBillingTest:
          process.env.SHOPIFY_BILLING_TEST === "true" || process.env.NODE_ENV !== "production",
        appUrl: process.env.APP_URL ?? null,
      };
    },
    adminApiKeys: async (_: unknown, args: { tenantId?: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      const { apiKeyRepository } = await import("@tidysync/database");
      return apiKeyRepository.listForAdmin(args.tenantId);
    },
    adminTenantDetail: async (_: unknown, args: { tenantId: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      const tenant = await tenantRepository.findById(args.tenantId);
      if (!tenant) throw new Error("Tenant not found");

      const [total, running, failed, completed] = await Promise.all([
        prisma.job.count({ where: { tenantId: tenant.id } }),
        prisma.job.count({ where: { tenantId: tenant.id, status: "RUNNING" } }),
        prisma.job.count({ where: { tenantId: tenant.id, status: "FAILED" } }),
        prisma.job.count({ where: { tenantId: tenant.id, status: "COMPLETED" } }),
      ]);

      const recentJobs = await prisma.job.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { lineItems: { take: 0 } },
      });

      const billingCharges = await prisma.billingCharge.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { plan: true },
      });

      const [aiOperationsCount, auditLogCount] = await Promise.all([
        prisma.aiOperation.count({ where: { tenantId: tenant.id } }),
        prisma.auditLog.count({ where: { tenantId: tenant.id } }),
      ]);

      return {
        tenant: mapTenant(tenant),
        jobStats: { total, running, failed, completed },
        recentJobs: recentJobs.map(mapJob),
        billingCharges: billingCharges.map((c) => ({
          id: c.id,
          type: c.type,
          status: c.status,
          amountCents: c.amountCents,
          createdAt: c.createdAt,
          plan: c.plan,
        })),
        aiOperationsCount,
        auditLogCount,
      };
    },
  },
  Mutation: {
    adminLogin: async (_: unknown, args: { email: string; password: string }) => {
      const bcrypt = await import("bcryptjs");
      const jwt = await import("jsonwebtoken");
      const user = await prisma.user.findUnique({ where: { email: args.email } });
      if (!user || !(await bcrypt.compare(args.password, user.passwordHash))) {
        throw new Error("Invalid credentials");
      }
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.ADMIN_JWT_SECRET ?? "dev-secret",
        { expiresIn: "12h" },
      );
      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    },
    createExportJob: async (
      _: unknown,
      args: { format?: string; platformKey?: string; resourceType?: string },
      ctx: GraphQLContext,
    ) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      const resourceType = args.resourceType ?? "products";

      const job = await prisma.job.create({
        data: {
          tenantId,
          type: "EXPORT",
          status: "QUEUED",
          targetPlatform: args.platformKey ?? "shopify",
          resourceType,
        },
      });

      await exportQueue.add("export", {
        jobId: job.id,
        tenantId,
        shop,
        platformKey: args.platformKey,
        resourceType,
      });
      return mapJob({ ...job, lineItems: [] });
    },
    uploadImportFile: async (
      _: unknown,
      args: { filePath: string; fileName: string; resourceType?: string },
      ctx: GraphQLContext,
    ) => {
      const { tenantId } = requireActiveMerchant(ctx);
      const resourceType = args.resourceType ?? "products";

      // Fast sync path: headers + platform detect + small preview (streaming — avoids 504 / worker hangs)
      const headers = await parseFileHeaders(args.filePath);
      const detection = detectPlatformWithConfidence(headers);
      const detected = detection.platformKey ?? detectPlatformFromHeaders(headers);

      const job = await prisma.job.create({
        data: {
          tenantId,
          type: "IMPORT",
          status: "MAPPING",
          fileName: args.fileName,
          filePath: args.filePath,
          sourcePlatform: detected ?? "csv",
          resourceType,
          rowCount: 0,
          diffPreview: {
            headers,
            previewRows: [],
            detection: {
              platformKey: detected,
              confidence: detection.confidence,
              scores: detection.scores,
            },
          },
        },
      });

      // Full row count in background — UI does not wait on this
      await importQueue.add("analyze", { jobId: job.id, tenantId }).catch(() => undefined);

      await prisma.auditLog.create({
        data: {
          tenantId,
          action: "import.uploaded",
          resourceType: "job",
          resourceId: job.id,
          metadata: {
            fileName: args.fileName,
            detectedPlatform: detected,
            detectionConfidence: detection.confidence,
          },
        },
      });

      return {
        ...mapJob({ ...job, lineItems: [] }),
        sourcePlatform: detected ?? "csv",
      };
    },
    suggestFieldMappings: async (
      _: unknown,
      args: { jobId: string; platformKey: string; useAi?: boolean },
      ctx: GraphQLContext,
    ) => {
      const { tenantId } = requireActiveMerchant(ctx);
      const { suggestMappingsWithAi } = await import("./extensions");
      return suggestMappingsWithAi(tenantId, args.jobId, args.platformKey, args.useAi ?? false);
    },
    updateJobMappings: async (
      _: unknown,
      args: { jobId: string; mappings: unknown },
      ctx: GraphQLContext,
    ) => {
      const { tenantId } = requireActiveMerchant(ctx);

      const job = await prisma.job.findFirst({ where: { id: args.jobId, tenantId } });
      if (!job?.filePath) throw new Error("Job not found");

      const raw = args.mappings as
        | Array<{ sourceColumn: string; targetField: string }>
        | ImportMutationPlan;
      const mappings = Array.isArray(raw) ? raw : raw.mappings ?? [];
      const defaults = Array.isArray(raw) ? undefined : raw.defaults;
      const aiPolish = Array.isArray(raw) ? undefined : raw.aiPolish;
      const conditions = Array.isArray(raw) ? undefined : raw.conditions;

      if (aiPolish?.descriptions || aiPolish?.titles) {
        await consumeAiCredit(tenantId, 1);
      }

      const previewRows = await parseFilePreview(job.filePath, 100);
      const mappedCount = mappings.filter((m) => m.targetField).length;
      if (mappedCount === 0) {
        throw new Error("Map at least one column to a Shopify field before previewing.");
      }
      const totalRows = job.rowCount > 0 ? job.rowCount : previewRows.length;
      const resType = job.resourceType ?? "products";
      const validation = validateImportMappings(resType, mappings, defaults);
      if (!validation.ok) {
        throw new Error(
          `Required fields missing: ${validation.missing.map((m) => m.label).join(", ")}. Map a column or set a default value.`,
        );
      }

      const diffRows: Array<{
        resourceType: string;
        resourceId: string;
        resourceTitle?: string;
        field: string;
        before: string | number | null;
        after: string | number | null;
      }> = [];

      for (let i = 0; i < previewRows.length; i++) {
        const row = previewRows[i];
        for (const mapping of mappings) {
          if (!mapping.targetField) continue;
          const after = row[mapping.sourceColumn] ?? null;
          diffRows.push({
            resourceType: resType,
            resourceId: `preview-${i}`,
            resourceTitle:
              row[mappings.find((m) => m.targetField === "title" || m.targetField === "email")?.sourceColumn ?? ""] ??
              `Row ${i + 1}`,
            field: mapping.targetField,
            before: null,
            after: after as string | number | null,
          });
        }
      }

      const anomalies = detectAnomalies(
        diffRows.map((r) => ({ field: r.field, before: r.before, after: r.after })),
      );
      const impactSummary = buildImpactSummary(diffRows.length, diffRows);

      const existingPlan = (job.mutationPlan as Record<string, unknown> | null) ?? {};

      const updated = await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "PREVIEW",
          mutationPlan: {
            ...existingPlan,
            mappings,
            defaults: defaults ?? null,
            aiPolish: aiPolish ?? null,
            conditions: conditions ?? null,
          } as object,
          diffPreview: { rows: diffRows, totalChanges: diffRows.length, anomalies },
          impactSummary,
          rowCount: totalRows,
        },
        include: { lineItems: { take: 0 } },
      });

      const integrationId =
        typeof existingPlan.integrationId === "string" ? existingPlan.integrationId : null;
      if (integrationId && (existingPlan.source === "google_sheets" || mappings.length > 0)) {
        const integration = await prisma.tenantIntegration.findFirst({
          where: { id: integrationId, tenantId, type: "GOOGLE_SHEETS" },
        });
        if (integration) {
          const cfg = integration.config as unknown as GoogleSheetsConfig;
          await prisma.tenantIntegration.update({
            where: { id: integration.id },
            data: {
              config: {
                ...cfg,
                savedMappings: mappings,
                savedDefaults: defaults ?? cfg.savedDefaults,
              } as object,
            },
          });
        }
      }

      return mapJob(updated);
    },
    generateNlBulkEdit: async (
      _: unknown,
      args: { prompt: string },
      ctx: GraphQLContext,
    ) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      const { generateNlBulkEditWithAi } = await import("./extensions");
      return generateNlBulkEditWithAi(tenantId, shop, args.prompt, ctx.sessionToken);
    },
    approveJob: async (_: unknown, args: { jobId: string }, ctx: GraphQLContext) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);

      const job = await prisma.job.findFirst({ where: { id: args.jobId, tenantId } });
      if (!job) throw new Error("Job not found");
      if (job.status !== "PREVIEW") throw new Error("Job must be in PREVIEW status to approve");

      if (ctx.sessionToken) {
        try {
          await refreshOfflineTokenFromSession(shop, ctx.sessionToken);
        } catch {
          /* enqueue may still work if a stored offline token is valid */
        }
      }

      const updated = await prisma.job.update({
        where: { id: job.id },
        data: { status: "QUEUED", approvedAt: new Date() },
        include: { lineItems: { take: 0 } },
      });

      const queuePayload = { jobId: job.id, tenantId, shop };

      const enqueue = async () => {
        if (job.type === "IMPORT") {
          await importQueue.add("import", queuePayload);
        } else if (job.type === "EXPORT" || job.type === "BACKUP") {
          await exportQueue.add(job.type === "BACKUP" ? "backup" : "export", queuePayload);
        } else if (job.type === "BULK_EDIT") {
          await bulkEditQueue.add("bulk-edit", queuePayload);
        } else if (job.type === "SUPPLIER_FEED_SYNC") {
          await bulkEditQueue.add("supplier-feed", queuePayload);
        }
      };

      try {
        await enqueue();
      } catch (err) {
        const base = err instanceof Error ? err.message : "Failed to queue job for processing";
        const redisUnreachable =
          base.includes("redis") ||
          base.includes("EAI_AGAIN") ||
          base.includes("ECONNREFUSED");
        const hint = redisUnreachable
          ? ` Redis is not reachable at ${resolveRedisUrl()}. On VPS with PM2, set REDIS_URL=redis://127.0.0.1:6379 in .env and expose Redis port 6379 from Docker (or install Redis on the host).`
          : "";
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            errorSummary: `Could not queue job.${hint}`,
          },
        });
        throw new Error(`${base}${hint}`);
      }

      await prisma.auditLog.create({
        data: {
          tenantId,
          action: "job.approved",
          resourceType: "job",
          resourceId: job.id,
        },
      });

      return mapJob(updated);
    },
    undoJob: async (_: unknown, args: { jobId: string }, ctx: GraphQLContext) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);

      const originalJob = await prisma.job.findFirst({
        where: { id: args.jobId, tenantId, status: "COMPLETED" },
      });
      if (!originalJob) throw new Error("Completed job not found for undo");

      const undoJob = await prisma.job.create({
        data: {
          tenantId,
          type: "UNDO",
          status: "QUEUED",
          mutationPlan: { undoJobId: originalJob.id },
        },
      });

      await undoQueue.add("undo", {
        jobId: undoJob.id,
        tenantId,
        shop,
        undoJobId: originalJob.id,
      });

      return mapJob({ ...undoJob, lineItems: [] });
    },
    saveMappingTemplate: async (
      _: unknown,
      args: { name: string; platformKey: string; mappings: unknown },
      ctx: GraphQLContext,
    ) => {
      const { tenantId } = requireActiveMerchant(ctx);

      return prisma.mappingTemplate.create({
        data: {
          tenantId,
          name: args.name,
          platformKey: args.platformKey,
          mappings: args.mappings as object,
        },
      });
    },
    cancelJob: async (_: unknown, args: { jobId: string }, ctx: GraphQLContext) => {
      const { tenantId } = requireActiveMerchant(ctx);

      const job = await prisma.job.findFirst({ where: { id: args.jobId, tenantId } });
      if (!job) throw new Error("Job not found");

      const updated = await prisma.job.update({
        where: { id: job.id },
        data: { status: "CANCELLED" },
        include: { lineItems: { take: 0 } },
      });

      return mapJob(updated);
    },
    createPlanSubscription: async (
      _: unknown,
      args: { planSlug: string },
      ctx: GraphQLContext,
    ) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      return createPlanSubscription(shop, tenantId, args.planSlug);
    },
    purchaseCreditTopUp: async (
      _: unknown,
      args: { credits: number },
      ctx: GraphQLContext,
    ) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      return createCreditTopUpPurchase(shop, tenantId, args.credits);
    },
    adminUpdateTenantPlan: async (
      _: unknown,
      args: { tenantId: string; planSlug: string },
      ctx: GraphQLContext,
    ) => {
      requireAdmin(ctx);
      const plan = await prisma.plan.findUnique({ where: { slug: args.planSlug } });
      if (!plan) throw new Error("Plan not found");
      const tenant = await tenantRepository.update(args.tenantId, {
        planId: plan.id,
        billingStatus: "ACTIVE",
      });
      await prisma.auditLog.create({
        data: {
          action: "admin.tenant_plan_updated",
          metadata: { tenantId: args.tenantId, planSlug: args.planSlug },
        },
      });
      return mapTenant(tenant);
    },
    adminUpdateTenantStatus: async (
      _: unknown,
      args: { tenantId: string; status: string },
      ctx: GraphQLContext,
    ) => {
      requireAdmin(ctx);
      const tenant = await tenantRepository.update(args.tenantId, {
        status: args.status as "ACTIVE" | "SUSPENDED" | "UNINSTALLED",
      });
      await prisma.auditLog.create({
        data: {
          action: "admin.tenant_status_updated",
          metadata: { tenantId: args.tenantId, status: args.status },
        },
      });
      return mapTenant(tenant);
    },
    adminGrantCredits: async (
      _: unknown,
      args: { tenantId: string; credits: number },
      ctx: GraphQLContext,
    ) => {
      requireAdmin(ctx);
      const tenant = await tenantRepository.grantExtraCredits(args.tenantId, args.credits);
      await prisma.auditLog.create({
        data: {
          action: "admin.credits_granted",
          metadata: { tenantId: args.tenantId, credits: args.credits },
        },
      });
      return mapTenant(tenant);
    },
    adminUpdateTenantBillingBypass: async (
      _: unknown,
      args: { tenantId: string; billingBypass: boolean },
      ctx: GraphQLContext,
    ) => {
      requireAdmin(ctx);
      const tenant = await tenantRepository.update(args.tenantId, {
        billingBypass: args.billingBypass,
        billingStatus: args.billingBypass ? "ACTIVE" : undefined,
      });
      await prisma.auditLog.create({
        data: {
          action: "admin.billing_bypass_updated",
          tenantId: args.tenantId,
          metadata: { billingBypass: args.billingBypass },
        },
      });
      return mapTenant(tenant);
    },
    adminUpdateTenantInstallApproved: async (
      _: unknown,
      args: { tenantId: string; installApproved: boolean },
      ctx: GraphQLContext,
    ) => {
      requireAdmin(ctx);
      const tenant = await tenantRepository.update(args.tenantId, {
        installApproved: args.installApproved,
      });
      await prisma.auditLog.create({
        data: {
          action: "admin.install_approval_updated",
          tenantId: args.tenantId,
          metadata: { installApproved: args.installApproved },
        },
      });
      return mapTenant(tenant);
    },
    adminUpdatePlan: async (
      _: unknown,
      args: {
        planId: string;
        input: {
          maxProducts?: number;
          aiCreditsPerMonth?: number;
          maxBackups?: number;
          backupRetentionDays?: number;
          maxBackupProducts?: number;
          agentEnabled?: boolean;
          agentRunsPerMonth?: number;
          scheduledJobs?: boolean;
          crossPlatform?: boolean;
          multiStore?: boolean;
          priceMonthlyCents?: number;
          isFree?: boolean;
          shopifyPlanName?: string | null;
        };
      },
      ctx: GraphQLContext,
    ) => {
      requireAdmin(ctx);
      const existing = await prisma.plan.findUnique({ where: { id: args.planId } });
      if (!existing) throw new Error("Plan not found");

      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args.input)) {
        if (value !== undefined) {
          data[key] = value;
        }
      }
      if (Object.keys(data).length === 0) throw new Error("No plan fields to update");

      const plan = await prisma.plan.update({
        where: { id: args.planId },
        data,
      });

      await prisma.auditLog.create({
        data: {
          action: "admin.plan_updated",
          metadata: { planId: args.planId, slug: plan.slug, changes: data as object },
        },
      });

      return {
        ...plan,
        aiCreditsRemaining: null,
      };
    },
    adminGrantPaidAccess: async (
      _: unknown,
      args: { tenantId?: string; shopDomain?: string; planSlug: string },
      ctx: GraphQLContext,
    ) => {
      requireAdmin(ctx);
      if (!args.tenantId && !args.shopDomain) {
        throw new Error("Provide tenantId or shopDomain");
      }

      const plan = await prisma.plan.findUnique({ where: { slug: args.planSlug } });
      if (!plan) throw new Error("Plan not found");
      if (plan.isFree) throw new Error("Choose a paid plan slug to grant paid access");

      let tenant = args.tenantId
        ? await tenantRepository.findById(args.tenantId)
        : await tenantRepository.findByShopDomain(args.shopDomain!.replace(/^https?:\/\//, "").replace(/\/$/, ""));

      if (!tenant) throw new Error("Tenant not found");

      tenant = await tenantRepository.update(tenant.id, {
        planId: plan.id,
        billingStatus: "ACTIVE",
        billingBypass: false,
      });

      await prisma.billingCharge.create({
        data: {
          tenantId: tenant.id,
          type: "RECURRING",
          shopifyChargeId: `admin-grant-${tenant.id}-${Date.now()}`,
          status: "ACTIVE",
          amountCents: plan.priceMonthlyCents,
          planId: plan.id,
          activatedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          action: "admin.paid_access_granted",
          tenantId: tenant.id,
          metadata: {
            planSlug: args.planSlug,
            shopDomain: tenant.shopDomain,
          },
        },
      });

      return mapTenant(tenant);
    },
    adminUpdateTenantNotes: async (
      _: unknown,
      args: { tenantId: string; notes?: string },
      ctx: GraphQLContext,
    ) => {
      requireAdmin(ctx);
      const tenant = await tenantRepository.update(args.tenantId, {
        adminNotes: args.notes ?? null,
      });
      return mapTenant(tenant);
    },
    adminCreateApiKey: async (
      _: unknown,
      args: { tenantId: string; name: string; scopes: string[] },
      ctx: GraphQLContext,
    ) => {
      requireAdmin(ctx);
      const { apiKeyRepository } = await import("@tidysync/database");
      const { record, rawKey } = await apiKeyRepository.create(
        args.tenantId,
        args.name,
        args.scopes,
      );
      return {
        id: record.id,
        name: record.name,
        keyPrefix: record.keyPrefix,
        rawKey,
        scopes: record.scopes,
      };
    },
    adminRevokeApiKey: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      const { apiKeyRepository } = await import("@tidysync/database");
      await apiKeyRepository.revoke(args.id);
      return true;
    },
  },
};

function mapJob(job: Job & { lineItems?: unknown[] }) {
  return {
    ...job,
    lineItems: job.lineItems ?? [],
  };
}
