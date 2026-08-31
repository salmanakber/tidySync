import { prisma, auditRepository, scheduledJobRepository, featureFlagRepository, jobRepository, type JobType } from "@tidysync/database";
import { getShopifyFieldsForResource, parseNlBulkEdit, type ResourceType } from "@tidysync/shared";
import { inferColumnMappingsWithAi, parseNlBulkEditWithAi, generateImpactSummary, generateProductSeoInsight, generateProductSeoImprovements, rewriteProductContent } from "@tidysync/ai";
import { consumeAiCredit } from "../services/tenant";
import { catalogScanQueue, exportQueue, bulkEditQueue, agentQueue } from "../queues";
import { checkBackupAllowed, consumeAgentRun, computeAgentRunsRemaining } from "../services/tenant-limits";
import { scanStoreHealth } from "../services/store-scan";
import { parseAgentIntent, buildSeoImprovementPlan } from "@tidysync/ai";
import { type GraphQLContext, requireMerchant, requireActiveMerchant, requireAdmin } from "../context";
import { planLimitError } from "./app-error";
import { parseFileHeaders } from "../services/file-parser";
import { parseFilePreview } from "../services/file-parser";
import { merchantGraphqlRequest } from "../shopify/client";
import {
  analyzeProductSeoMetrics,
  applyProductSeoToShopify,
  fetchProductSeoSource,
  productSeoMetricsInput,
} from "../services/product-seo";

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

  type CatalogProduct {
    id: ID!
    title: String!
    handle: String
    status: String
    featuredImageUrl: String
  }

  type ProductSeoCheck {
    id: String!
    label: String!
    status: String!
    detail: String!
    score: Int!
  }

  type ProductSeoMetrics {
    overallScore: Int!
    titleScore: Int!
    descriptionScore: Int!
    metaScore: Int!
    mediaScore: Int!
    readabilityScore: Int!
    titleLength: Int!
    metaDescriptionLength: Int!
    descriptionWordCount: Int!
    imageCount: Int!
    imagesWithAlt: Int!
    hasCustomSeoTitle: Boolean!
    hasCustomSeoDescription: Boolean!
    checks: [ProductSeoCheck!]!
  }

  type ProductSeoInsight {
    productId: ID!
    title: String!
    handle: String
    featuredImageUrl: String
    metrics: ProductSeoMetrics!
    aiExplanation: String!
    creditsUsed: Int!
  }

  type ProductSeoApplyResult {
    productId: ID!
    title: String!
    handle: String
    featuredImageUrl: String
    metrics: ProductSeoMetrics!
    aiExplanation: String!
    applied: JSON!
    creditsUsed: Int!
  }

  type ImportPolishRow {
    rowIndex: Int!
    field: String!
    before: String!
    after: String!
  }

  type ImportPolishSample {
    rows: [ImportPolishRow!]!
    creditsUsed: Int!
  }

  type StoreBackup {
    id: ID!
    label: String!
    productCount: Int!
    sizeBytes: Int!
    status: String!
    expiresAt: DateTime
    createdAt: DateTime!
  }

  type StoreScanIssue {
    id: String!
    severity: String!
    category: String!
    title: String!
    detail: String!
    productId: String
    productTitle: String
    score: Int
  }

  type StoreScanResult {
    productCount: Int!
    overallHealthScore: Int!
    seoScore: Int!
    catalogScore: Int!
    issues: [StoreScanIssue!]!
    summary: String!
  }

  type AgentStatus {
    enabled: Boolean!
    runsUsed: Int!
    runsLimit: Int!
    runsRemaining: Int!
  }

  type AgentRunResult {
    intent: String!
    message: String!
    scan: StoreScanResult
    previewJob: Job
    agentRunsUsed: Int!
    suggestedActions: [String!]!
    agentJobId: ID
  }

  input RestoreFiltersInput {
    vendor: String
    titleContains: String
    tags: [String!]
    productIds: [ID!]
  }

  input RestoreOptionsInput {
    filters: RestoreFiltersInput
    fields: [String!]
  }

  extend type Query {
    auditLogs(limit: Int = 50): [AuditLog!]!
    scheduledJobs: [ScheduledJob!]!
    notificationSettings: NotificationSettings
    catalogProducts(first: Int = 24, query: String): [CatalogProduct!]!
    storeBackups: [StoreBackup!]!
    agentStatus: AgentStatus!
    adminAuditLogs(limit: Int = 100): [AuditLog!]!
    adminFeatureFlags: [FeatureFlag!]!
  }

  extend type Mutation {
    runCatalogHealthScan: Job!
    runContentRewrite(brandVoice: String!): Job!
    polishImportSample(jobId: ID!, brandVoice: String): ImportPolishSample!
    analyzeProductSeo(productId: ID!): ProductSeoInsight!
    applyProductSeo(productId: ID!): ProductSeoApplyResult!
    createStoreBackup(label: String): Job!
    deleteStoreBackup(id: ID!): Boolean!
    scanStore: StoreScanResult!
    runAgent(prompt: String!): AgentRunResult!
    restoreStoreBackup(id: ID!, options: RestoreOptionsInput): Job!
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
    catalogProducts: async (
      _: unknown,
      args: { first?: number; query?: string },
      ctx: GraphQLContext,
    ) => {
      const { shop } = requireActiveMerchant(ctx);
      const first = Math.min(args.first ?? 24, 50);
      const response = (await merchantGraphqlRequest(
        shop,
        ctx.sessionToken,
        `#graphql
          query CatalogProducts($first: Int!, $query: String) {
            products(first: $first, query: $query) {
              edges {
                node {
                  id
                  title
                  handle
                  status
                  featuredImage { url }
                }
              }
            }
          }`,
        { first, query: args.query ?? null },
      )) as {
        data?: {
          products?: {
            edges: Array<{
              node: {
                id: string;
                title: string;
                handle?: string;
                status?: string;
                featuredImage?: { url?: string } | null;
              };
            }>;
          };
        };
      };

      const edges = response.data?.products?.edges ?? [];
      return edges.map(({ node }) => ({
        id: node.id,
        title: node.title,
        handle: node.handle ?? null,
        status: node.status ?? "ACTIVE",
        featuredImageUrl: node.featuredImage?.url ?? null,
      }));
    },
    storeBackups: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const { tenantId } = requireActiveMerchant(ctx);
      return prisma.storeBackup.findMany({
        where: { tenantId, status: { not: "DELETED" } },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    },
    agentStatus: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const { tenantId } = requireActiveMerchant(ctx);
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { plan: true },
      });
      const runsLimit = tenant?.plan?.agentRunsPerMonth ?? 0;
      const runsRemaining = computeAgentRunsRemaining({
        agentRunsUsed: tenant?.agentRunsUsed ?? 0,
        plan: tenant?.plan,
      }) ?? 0;
      return {
        enabled: Boolean(tenant?.plan?.agentEnabled),
        runsUsed: tenant?.agentRunsUsed ?? 0,
        runsLimit,
        runsRemaining,
      };
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
    polishImportSample: async (
      _: unknown,
      args: { jobId: string; brandVoice?: string },
      ctx: GraphQLContext,
    ) => {
      const { tenantId } = requireActiveMerchant(ctx);
      await consumeAiCredit(tenantId, 1);

      const job = await prisma.job.findFirst({ where: { id: args.jobId, tenantId } });
      if (!job?.filePath) throw new Error("Import job not found");

      const previewRows = await parseFilePreview(job.filePath, 5);
      const plan = job.mutationPlan as { mappings?: Array<{ sourceColumn: string; targetField: string }> } | null;
      const mappings = plan?.mappings ?? [];
      const descMapping = mappings.find((m) => m.targetField === "descriptionHtml");
      const titleMapping = mappings.find((m) => m.targetField === "title");
      const voice = args.brandVoice ?? "professional, helpful, SEO-optimized";

      const samples: Array<{ rowIndex: number; field: string; before: string; after: string }> = [];

      for (let i = 0; i < previewRows.length; i++) {
        const row = previewRows[i];
        const title = titleMapping ? String(row[titleMapping.sourceColumn] ?? "") : "";
        const description = descMapping ? String(row[descMapping.sourceColumn] ?? "") : "";
        if (!description.trim()) continue;

        const polished = await rewriteProductContent(
          [{ title: title || `Product ${i + 1}`, description }],
          voice,
        );
        samples.push({
          rowIndex: i,
          field: "descriptionHtml",
          before: description.slice(0, 500),
          after: (polished[0]?.description ?? description).slice(0, 500),
        });
      }

      if (samples.length === 0) {
        throw new Error("Map a description column first, then preview AI polish.");
      }

      await prisma.aiOperation.create({
        data: {
          tenantId,
          jobId: job.id,
          operationType: "CONTENT_REWRITE",
          prompt: "import-polish-sample",
          generatedPlan: { samples } as object,
          creditsConsumed: 1,
          modelUsed: "import-polish",
        },
      });

      return { rows: samples, creditsUsed: 1 };
    },
    analyzeProductSeo: async (_: unknown, args: { productId: string }, ctx: GraphQLContext) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      await consumeAiCredit(tenantId, 1);

      const response = (await merchantGraphqlRequest(
        shop,
        ctx.sessionToken,
        `#graphql
          query ProductSeoDetail($id: ID!) {
            product(id: $id) {
              id
              title
              handle
              descriptionHtml
              status
              seo { title description }
              featuredImage { url altText }
              images(first: 20) {
                edges { node { url altText } }
              }
            }
          }`,
        { id: args.productId },
      )) as {
        data?: {
          product?: {
            id: string;
            title: string;
            handle?: string;
            descriptionHtml?: string | null;
            seo?: { title?: string | null; description?: string | null } | null;
            featuredImage?: { url?: string | null; altText?: string | null } | null;
            images?: { edges: Array<{ node: { url?: string | null; altText?: string | null } }> };
          } | null;
        };
      };

      const product = response.data?.product;
      if (!product) throw new Error("Product not found in your Shopify catalog.");

      const images =
        product.images?.edges?.map((e) => ({
          url: e.node.url,
          altText: e.node.altText,
        })) ?? [];

      const metrics = analyzeProductSeoMetrics({
        title: product.title,
        descriptionHtml: product.descriptionHtml,
        seo: product.seo,
        featuredImage: product.featuredImage,
        images,
      });

      const aiExplanation = await generateProductSeoInsight(
        {
          title: product.title,
          handle: product.handle,
          seo: product.seo,
          descriptionWordCount: metrics.descriptionWordCount,
        },
        metrics as unknown as Record<string, unknown>,
      );

      await prisma.aiOperation.create({
        data: {
          tenantId,
          operationType: "PRODUCT_SEO_INSIGHT",
          prompt: product.id,
          generatedPlan: metrics as object,
          creditsConsumed: 1,
          modelUsed: "seo-insight",
        },
      });

      return {
        productId: product.id,
        title: product.title,
        handle: product.handle ?? null,
        featuredImageUrl: product.featuredImage?.url ?? null,
        metrics,
        aiExplanation,
        creditsUsed: 1,
      };
    },
    applyProductSeo: async (_: unknown, args: { productId: string }, ctx: GraphQLContext) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      await consumeAiCredit(tenantId, 1);

      const source = await fetchProductSeoSource(shop, ctx.sessionToken, args.productId);
      const beforeMetrics = analyzeProductSeoMetrics(productSeoMetricsInput(source));

      const improvements = await generateProductSeoImprovements(
        {
          title: source.title,
          handle: source.handle,
          descriptionHtml: source.descriptionHtml,
          seo: source.seo,
        },
        beforeMetrics as unknown as Record<string, unknown>,
      );

      await applyProductSeoToShopify(shop, ctx.sessionToken, args.productId, improvements);

      const updated = await fetchProductSeoSource(shop, ctx.sessionToken, args.productId);
      const metrics = analyzeProductSeoMetrics(productSeoMetricsInput(updated));

      const aiExplanation = await generateProductSeoInsight(
        {
          title: updated.title,
          handle: updated.handle,
          seo: updated.seo,
          descriptionWordCount: metrics.descriptionWordCount,
        },
        metrics as unknown as Record<string, unknown>,
      );

      await prisma.aiOperation.create({
        data: {
          tenantId,
          operationType: "PRODUCT_SEO_INSIGHT",
          prompt: `apply:${updated.id}`,
          generatedPlan: {
            applied: improvements,
            metrics,
          } as object,
          creditsConsumed: 1,
          modelUsed: improvements.modelUsed ?? "seo-apply",
        },
      });

      return {
        productId: updated.id,
        title: updated.title,
        handle: updated.handle,
        featuredImageUrl: updated.featuredImageUrl,
        metrics,
        aiExplanation,
        applied: {
          seoTitle: improvements.seoTitle,
          seoDescription: improvements.seoDescription,
          descriptionPreview: improvements.descriptionHtml.slice(0, 400),
        },
        creditsUsed: 1,
      };
    },
    createStoreBackup: async (_: unknown, args: { label?: string }, ctx: GraphQLContext) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      await checkBackupAllowed(tenantId);

      const label = args.label?.trim() || `Backup ${new Date().toLocaleDateString()}`;
      const job = await prisma.job.create({
        data: {
          tenantId,
          type: "BACKUP",
          status: "QUEUED",
          mutationPlan: { label } as object,
        },
      });

      await exportQueue.add("backup", { jobId: job.id, tenantId, shop });

      await prisma.aiOperation.create({
        data: {
          tenantId,
          jobId: job.id,
          operationType: "STORE_BACKUP",
          prompt: label,
          creditsConsumed: 0,
          modelUsed: "backup",
        },
      });

      return job;
    },
    deleteStoreBackup: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const { tenantId } = requireActiveMerchant(ctx);
      await prisma.storeBackup.updateMany({
        where: { id: args.id, tenantId },
        data: { status: "DELETED" },
      });
      return true;
    },
    scanStore: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      await consumeAiCredit(tenantId, 1);
      const scan = await scanStoreHealth(shop, ctx.sessionToken, 100);
      await prisma.aiOperation.create({
        data: {
          tenantId,
          operationType: "CATALOG_HEALTH_SCAN",
          prompt: "store_scan",
          generatedPlan: { productCount: scan.productCount } as object,
          creditsConsumed: 1,
          modelUsed: "store-scan",
        },
      });
      return scan;
    },
    runAgent: async (_: unknown, args: { prompt: string }, ctx: GraphQLContext) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      await consumeAgentRun(tenantId, 1);

      const intentResult = await parseAgentIntent(args.prompt);
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

      const agentJob = await prisma.job.create({
        data: {
          tenantId,
          type: "AGENT_RUN",
          status: "QUEUED",
          nlPrompt: args.prompt,
          isAiGenerated: true,
          mutationPlan: {
            phase: "queued",
            steps: [
              { id: "understand", label: "Understanding your mission", status: "pending" },
              { id: "plan", label: "Building execution plan", status: "pending" },
              { id: "execute", label: "Running catalog operations", status: "pending" },
              { id: "finalize", label: "Preparing results for review", status: "pending" },
            ],
            intent: intentResult.intent,
            suggestedActions: intentResult.suggestedActions,
          } as object,
        },
      });

      await agentQueue.add("agent-run", { jobId: agentJob.id, tenantId, shop });

      return {
        intent: intentResult.intent,
        message:
          "Agent mission started — watch the thinking steps below. Long tasks run in the background via Redis.",
        scan: null,
        previewJob: agentJob,
        agentJobId: agentJob.id,
        agentRunsUsed: tenant?.agentRunsUsed ?? 0,
        suggestedActions: intentResult.suggestedActions,
      };
    },
    restoreStoreBackup: async (
      _: unknown,
      args: {
        id: string;
        options?: {
          filters?: {
            vendor?: string;
            titleContains?: string;
            tags?: string[];
            productIds?: string[];
          };
          fields?: string[];
        };
      },
      ctx: GraphQLContext,
    ) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      const backup = await prisma.storeBackup.findFirst({
        where: { id: args.id, tenantId, status: "COMPLETED" },
      });
      if (!backup) throw new Error("Backup not found or not ready");

      const job = await prisma.job.create({
        data: {
          tenantId,
          type: "BULK_EDIT",
          status: "QUEUED",
          mutationPlan: {
            action: "restore_backup",
            backupId: backup.id,
            filters: args.options?.filters ?? {},
            fields: args.options?.fields ?? ["title", "descriptionHtml", "vendor", "tags"],
            label: `Restore: ${backup.label}`,
          } as object,
          impactSummary: `Restoring from backup "${backup.label}"`,
        },
      });

      await bulkEditQueue.add("restore-backup", { jobId: job.id, tenantId, shop });

      return job;
    },
    createScheduledJob: async (
      _: unknown,
      args: { name: string; jobType: string; schedule: string; config?: unknown },
      ctx: GraphQLContext,
    ) => {
      const { tenantId } = requireActiveMerchant(ctx);
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
      if (!tenant?.plan?.scheduledJobs) {
        throw planLimitError("Scheduled jobs are not available on your plan. Upgrade to unlock automation.");
      }
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
  useAi = false,
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

  if (useAi && unrecognized.length > 0) {
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
  sessionToken?: string,
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
    diff = await buildDiffFromMutationPlan(shop, plan, sessionToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorSummary: msg.includes("Shopify") || msg.includes("connection")
          ? msg
          : err instanceof Error
            ? err.message
            : "Could not load products for preview",
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
