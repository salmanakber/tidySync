import { prisma, auditRepository, scheduledJobRepository, featureFlagRepository, jobRepository, type JobType } from "@tidysync/database";
import { getShopifyFieldsForResource, parseNlBulkEdit, type ResourceType } from "@tidysync/shared";
import { inferColumnMappingsWithAi, parseNlBulkEditWithAi, generateImpactSummary } from "@tidysync/ai";
import { consumeAiCredit } from "../services/tenant";
import { catalogScanQueue, bulkEditQueue } from "../queues";
import { type GraphQLContext, requireMerchant, requireActiveMerchant, requireAdmin } from "../context";
import { parseFileHeaders } from "../services/file-parser";

export const extensionTypeDefs = `#graphql
  type AuditLog {
    id: ID!
    action: String!
    resourceType: String
    resourceId: String
    metadata: JSON
    createdAt: DateTime!
    tenant: AuditLogTenant
  }

  type AuditLogTenant {
    shopDomain: String!
  }

  type ScheduledJob {
    id: ID!
    name: String!
    jobType: JobType!
    schedule: String!
    config: JSON!
    enabled: Boolean!
    lastRunAt: DateTime
    nextRunAt: DateTime
    createdAt: DateTime!
  }

  type NotificationSettings {
    email: String
    emailOnComplete: Boolean!
    emailOnFailure: Boolean!
    slackWebhook: String
  }

  type FeatureFlag {
    id: ID!
    key: String!
    tenantId: ID
    enabled: Boolean!
    description: String
  }

  extend type Query {
    auditLogs(limit: Int = 50): [AuditLog!]!
    scheduledJobs: [ScheduledJob!]!
    notificationSettings: NotificationSettings
    adminAuditLogs(limit: Int = 100): [AuditLog!]!
    adminFeatureFlags: [FeatureFlag!]!
  }

  extend type Mutation {
    runCatalogHealthScan: Job!
    runContentRewrite(brandVoice: String!): Job!
    createScheduledJob(name: String!, jobType: JobType!, schedule: String!, config: JSON): ScheduledJob!
    deleteScheduledJob(id: ID!): Boolean!
    updateNotificationSettings(
      email: String
      emailOnComplete: Boolean
      emailOnFailure: Boolean
      slackWebhook: String
    ): NotificationSettings!
    pauseJob(jobId: ID!): Job!
    adminUpdateFeatureFlag(key: String!, enabled: Boolean!, tenantId: ID): FeatureFlag!
    adminRetryJob(jobId: ID!): Job!
  }
`;

export const extensionResolvers = {
  Query: {
    auditLogs: async (_: unknown, args: { limit?: number }, ctx: GraphQLContext) => {
      const { tenantId } = requireMerchant(ctx);
      return auditRepository.listForTenant(tenantId, args.limit ?? 50);
    },
    scheduledJobs: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const { tenantId } = requireMerchant(ctx);
      return scheduledJobRepository.listForTenant(tenantId);
    },
    notificationSettings: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const { tenantId } = requireMerchant(ctx);
      return prisma.notificationSetting.findUnique({ where: { tenantId } });
    },
    adminAuditLogs: async (_: unknown, args: { limit?: number }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      return auditRepository.listForAdmin(args.limit ?? 100);
    },
    adminFeatureFlags: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      return featureFlagRepository.listAll();
    },
  },
  Mutation: {
    runCatalogHealthScan: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      await consumeAiCredit(tenantId, 1);
      const job = await prisma.job.create({
        data: { tenantId, type: "CATALOG_HEALTH_SCAN", status: "QUEUED" },
      });
      await catalogScanQueue.add("catalog-scan", { jobId: job.id, tenantId, shop });
      return { ...job, lineItems: [] };
    },
    runContentRewrite: async (_: unknown, args: { brandVoice: string }, ctx: GraphQLContext) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      await consumeAiCredit(tenantId, 1);
      const job = await prisma.job.create({
        data: {
          tenantId,
          type: "CONTENT_REWRITE",
          status: "QUEUED",
          mutationPlan: { brandVoice: args.brandVoice },
        },
      });
      await bulkEditQueue.add("content-rewrite", { jobId: job.id, tenantId, shop });
      return { ...job, lineItems: [] };
    },
    createScheduledJob: async (
      _: unknown,
      args: { name: string; jobType: string; schedule: string; config?: unknown },
      ctx: GraphQLContext,
    ) => {
      const { tenantId } = requireActiveMerchant(ctx);
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
      if (!tenant?.plan?.scheduledJobs) throw new Error("Scheduled jobs not available on your plan");
      return prisma.scheduledJob.create({
        data: {
          tenantId,
          name: args.name,
          jobType: args.jobType as JobType,
          schedule: args.schedule,
          config: (args.config as object) ?? {},
        },
      });
    },
    deleteScheduledJob: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const { tenantId } = requireActiveMerchant(ctx);
      await prisma.scheduledJob.deleteMany({ where: { id: args.id, tenantId } });
      return true;
    },
    updateNotificationSettings: async (
      _: unknown,
      args: {
        email?: string;
        emailOnComplete?: boolean;
        emailOnFailure?: boolean;
        slackWebhook?: string;
      },
      ctx: GraphQLContext,
    ) => {
      const { tenantId } = requireActiveMerchant(ctx);
      return prisma.notificationSetting.upsert({
        where: { tenantId },
        create: {
          tenantId,
          email: args.email,
          emailOnComplete: args.emailOnComplete ?? true,
          emailOnFailure: args.emailOnFailure ?? true,
          slackWebhook: args.slackWebhook,
        },
        update: {
          email: args.email,
          emailOnComplete: args.emailOnComplete,
          emailOnFailure: args.emailOnFailure,
          slackWebhook: args.slackWebhook,
        },
      });
    },
    pauseJob: async (_: unknown, args: { jobId: string }, ctx: GraphQLContext) => {
      const { tenantId } = requireActiveMerchant(ctx);
      const job = await prisma.job.findFirst({ where: { id: args.jobId, tenantId, status: "RUNNING" } });
      if (!job) throw new Error("Running job not found");
      const updated = await jobRepository.update(job.id, { status: "PAUSED" });
      return { ...updated, lineItems: [] };
    },
    adminUpdateFeatureFlag: async (
      _: unknown,
      args: { key: string; enabled: boolean; tenantId?: string },
      ctx: GraphQLContext,
    ) => {
      requireAdmin(ctx);
      const existing = await prisma.featureFlag.findFirst({
        where: { key: args.key, tenantId: args.tenantId ?? null },
      });
      if (existing) {
        return prisma.featureFlag.update({
          where: { id: existing.id },
          data: { enabled: args.enabled },
        });
      }
      return prisma.featureFlag.create({
        data: {
          key: args.key,
          tenantId: args.tenantId,
          enabled: args.enabled,
        },
      });
    },
    adminRetryJob: async (_: unknown, args: { jobId: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      const job = await prisma.job.findUnique({ where: { id: args.jobId } });
      if (!job) throw new Error("Job not found");
      const tenant = await prisma.tenant.findUnique({ where: { id: job.tenantId } });
      if (!tenant) throw new Error("Tenant not found");
      const updated = await jobRepository.update(job.id, { status: "QUEUED", errorSummary: null });
      const { importQueue, exportQueue, bulkEditQueue } = await import("../queues");
      const payload = { jobId: job.id, tenantId: job.tenantId, shop: tenant.shopDomain };
      if (job.type === "IMPORT") await importQueue.add("import", payload);
      else if (job.type === "EXPORT") await exportQueue.add("export", payload);
      else if (job.type === "BULK_EDIT") await bulkEditQueue.add("bulk-edit", payload);
      return { ...updated, lineItems: [] };
    },
  },
};

// Patch suggestFieldMappings + generateNlBulkEdit to use AI — exported for schema merge
export async function suggestMappingsWithAi(
  tenantId: string,
  jobId: string,
  platformKey: string,
) {
  const job = await prisma.job.findFirst({ where: { id: jobId, tenantId } });
  if (!job?.filePath) throw new Error("Job or file not found");

  const diffPreview = job.diffPreview as { headers?: string[] } | null;
  const headers =
    diffPreview?.headers?.length ? diffPreview.headers : await parseFileHeaders(job.filePath);
  const resourceType = (job.resourceType ?? "products") as ResourceType;
  const targetFields = getShopifyFieldsForResource(resourceType);
  const profile = await prisma.platformFieldMap.findFirst({
    where: { platformKey, isGlobal: true },
  });
  const { defaultMappingsForPlatform, buildFieldMappingsWithConfidence } = await import(
    "@tidysync/shared"
  );
  const profileMappings =
    (profile?.mappings as Record<string, string>) ?? defaultMappingsForPlatform(platformKey);

  let suggestions = buildFieldMappingsWithConfidence(headers, profileMappings);
  const unrecognized = suggestions.filter((m) => !m.targetField);

  if (unrecognized.length > 0) {
    try {
      await consumeAiCredit(tenantId, 1);
      const ai = await inferColumnMappingsWithAi(headers, [...targetFields]);
      const bySource = new Map(ai.mappings.map((m) => [m.sourceColumn, m.targetField]));
      suggestions = suggestions.map((row) => {
        if (row.targetField) return row;
        const aiTarget = bySource.get(row.sourceColumn) ?? "";
        if (!aiTarget) return row;
        return {
          ...row,
          targetField: aiTarget,
          suggested: true,
          confidence: 0.85,
          matchReason: "ai",
        };
      });
      await prisma.aiOperation.create({
        data: {
          tenantId,
          jobId,
          operationType: "COLUMN_MAPPING",
          prompt: platformKey,
          generatedPlan: suggestions as object,
          creditsConsumed: 1,
          modelUsed: ai.modelUsed,
        },
      });
    } catch {
      // Credits / AI unavailable — keep fuzzy/profile matches so import can continue
    }
  }

  return suggestions.map((m) => ({
    sourceColumn: m.sourceColumn,
    targetField: m.targetField,
    suggested: Boolean(m.targetField),
    confidence: m.confidence ?? (m.targetField ? 0.7 : 0),
    matchReason: m.matchReason ?? null,
  }));
}

export async function generateNlBulkEditWithAi(
  tenantId: string,
  shop: string,
  prompt: string,
) {
  const { plan: initialPlan, modelUsed: initialModel } = await parseNlBulkEditWithAi(prompt);
  let plan = initialPlan;
  let modelUsed = initialModel;

  if (initialModel !== "rule-based" && !initialModel.includes("rule-based")) {
    try {
      await consumeAiCredit(tenantId, 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI credits unavailable";
      if (message.includes("credit")) {
        plan = parseNlBulkEdit(prompt);
        modelUsed = "rule-based-credits";
      } else {
        throw err;
      }
    }
  }

  const { buildDiffFromMutationPlan } = await import("../services/shopify-products");
  const { detectAnomalies, buildImpactSummary } = await import("@tidysync/shared");

  const job = await prisma.job.create({
    data: {
      tenantId,
      type: "BULK_EDIT",
      status: "PREVIEW",
      nlPrompt: prompt,
      isAiGenerated: true,
      mutationPlan: plan as object,
    },
  });

  let diff: { rows: unknown[]; totalChanges: number };
  try {
    diff = await buildDiffFromMutationPlan(shop, plan);
  } catch (err) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorSummary: err instanceof Error ? err.message : "Could not load products for preview",
      },
    });
    throw err;
  }

  if (diff.totalChanges === 0) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "PREVIEW",
        diffPreview: { rows: [], totalChanges: 0 },
        impactSummary:
          "No matching products or variants were found for this prompt. Try a broader phrase (e.g. increase all prices by 10%).",
        rowCount: 0,
      },
      include: { lineItems: { take: 0 } },
    });
    return {
      ...(await prisma.job.findUnique({ where: { id: job.id }, include: { lineItems: { take: 0 } } }))!,
      lineItems: [],
    };
  }

  const anomalies = detectAnomalies(
    diff.rows.map((r) => ({
      field: (r as { field: string }).field,
      before: (r as { before: unknown }).before,
      after: (r as { after: unknown }).after,
    })),
  );
  const fallbackSummary = buildImpactSummary(diff.totalChanges, diff.rows as import("@tidysync/shared").DiffRow[]);
  let impactSummary = fallbackSummary;
  try {
    impactSummary = await generateImpactSummary({
      totalChanges: diff.totalChanges,
      anomalies,
      fallback: fallbackSummary,
    });
  } catch {
    impactSummary = fallbackSummary;
  }

  const updated = await prisma.job.update({
    where: { id: job.id },
    data: {
      diffPreview: { ...diff, anomalies } as object,
      impactSummary,
      rowCount: diff.totalChanges,
    },
    include: { lineItems: { take: 0 } },
  });

  if (modelUsed !== "rule-based-credits") {
    await prisma.aiOperation.create({
      data: {
        tenantId,
        jobId: job.id,
        operationType: "NL_BULK_EDIT",
        prompt,
        generatedPlan: plan as object,
        creditsConsumed: modelUsed.startsWith("rule-based") ? 0 : 1,
        modelUsed,
      },
    });
  }

  return { ...updated, lineItems: [] };
}
