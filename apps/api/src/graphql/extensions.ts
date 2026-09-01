import { prisma, auditRepository, scheduledJobRepository, featureFlagRepository, jobRepository, type JobType } from "@tidysync/database";
import { getShopifyFieldsForResource, parseNlBulkEdit, type ResourceType } from "@tidysync/shared";
import { inferColumnMappingsWithAi, parseNlBulkEditWithAi, generateImpactSummary, generateProductSeoInsight, generateProductSeoImprovements, rewriteProductContent, buildSeoImprovementPlanForProductIds, buildDescriptionRewritePlanForProductIds } from "@tidysync/ai";
import { consumeAiCredit } from "../services/tenant";
import { catalogScanQueue, exportQueue, bulkEditQueue, agentQueue, importQueue } from "../queues";
import { checkBackupAllowed, consumeAgentRun, computeAgentRunsRemaining } from "../services/tenant-limits";
import { scanStoreHealth } from "../services/store-scan";
import { findDuplicateProducts } from "../services/duplicate-products";
import { downloadGoogleSheetCsv, parseSpreadsheetUrl, type GoogleSheetsConfig } from "../services/google-sheets";
import { enqueueSupplierFeedSync, normalizeFeedSyncMode } from "../services/supplier-feed";
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
  seoApplyCreditCost,
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

  type DuplicateProductEntry {
    id: ID!
    title: String!
    handle: String
    vendor: String
    imageUrl: String
    variantCount: Int!
  }

  type DuplicateProductGroup {
    id: String!
    reason: String!
    matchKey: String!
    products: [DuplicateProductEntry!]!
  }

  type TenantIntegration {
    id: ID!
    type: String!
    enabled: Boolean!
    config: JSON!
    createdAt: DateTime!
    updatedAt: DateTime!
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

  input ProductMergePairInput {
    primaryProductId: ID!
    duplicateProductIds: [ID!]!
  }

  type AiEnvFallback {
    groq: Boolean!
    gemini: Boolean!
    openai: Boolean!
  }

  type AdminAiSettings {
    provider: String!
    fallbackOrder: String!
    groqApiKeySet: Boolean!
    groqApiKeyHint: String
    groqModel: String!
    geminiApiKeySet: Boolean!
    geminiApiKeyHint: String
    geminiModel: String!
    openaiApiKeySet: Boolean!
    openaiApiKeyHint: String
    openaiModel: String!
    envFallback: AiEnvFallback!
    source: String!
  }

  type AdminAiTestResult {
    ok: Boolean!
    provider: String!
    modelUsed: String!
    reply: String!
    configuredProviders: [String!]!
    providerMode: String!
    error: String
  }

  input AdminAiSettingsInput {
    provider: String
    fallbackOrder: String
    groqApiKey: String
    groqModel: String
    geminiApiKey: String
    geminiModel: String
    openaiApiKey: String
    openaiModel: String
    clearGroqApiKey: Boolean
    clearGeminiApiKey: Boolean
    clearOpenaiApiKey: Boolean
  }

  extend type Query {
    auditLogs(limit: Int = 50): [AuditLog!]!
    scheduledJobs: [ScheduledJob!]!
    notificationSettings: NotificationSettings
    catalogProducts(first: Int = 24, query: String): [CatalogProduct!]!
    storeBackups: [StoreBackup!]!
    agentStatus: AgentStatus!
    findDuplicateProducts(limit: Int = 250): [DuplicateProductGroup!]!
    tenantIntegrations: [TenantIntegration!]!
    adminAuditLogs(limit: Int = 100): [AuditLog!]!
    adminFeatureFlags: [FeatureFlag!]!
    adminAiSettings: AdminAiSettings!
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
    fixScanIssues(category: String!, productIds: [ID!]!): Job!
    previewMergeProducts(primaryProductId: ID!, duplicateProductIds: [ID!]!): Job!
    previewBulkMergeProducts(merges: [ProductMergePairInput!]!): Job!
    connectGoogleSheet(spreadsheetUrl: String!, sheetName: String): TenantIntegration!
    syncGoogleSheet(integrationId: ID!): Job!
    updateGoogleSheetFeed(
      integrationId: ID!
      syncMode: String
      matchField: String
      schedule: String
      autoSyncEnabled: Boolean
      autoApprove: Boolean
    ): TenantIntegration!
    disconnectGoogleSheet(id: ID!): Boolean!
    createScheduledJob(name: String!, jobType: JobType!, schedule: String!, config: JSON): ScheduledJob!
    deleteScheduledJob(id: ID!): Boolean!
    updateScheduledJob(id: ID!, enabled: Boolean): ScheduledJob!
    updateNotificationSettings(
      email: String
      emailOnComplete: Boolean
      emailOnFailure: Boolean
      slackWebhook: String
    ): NotificationSettings!
    pauseJob(jobId: ID!): Job!
    adminUpdateFeatureFlag(key: String!, enabled: Boolean!, tenantId: ID): FeatureFlag!
    adminUpdateAiSettings(input: AdminAiSettingsInput!): AdminAiSettings!
    adminTestAi(prompt: String): AdminAiTestResult!
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
    findDuplicateProducts: async (
      _: unknown,
      args: { limit?: number },
      ctx: GraphQLContext,
    ) => {
      const { shop } = requireActiveMerchant(ctx);
      return findDuplicateProducts(shop, ctx.sessionToken, args.limit ?? 250);
    },
    tenantIntegrations: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const { tenantId } = requireActiveMerchant(ctx);
      return prisma.tenantIntegration.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      });
    },
    adminAuditLogs: async (_: unknown, args: { limit?: number }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      return auditRepository.listForAdmin(args.limit ?? 100);
    },
    adminFeatureFlags: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      return featureFlagRepository.listAll();
    },
    adminAiSettings: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      const { getPublicAiSettings, applyAiSettingsToRuntime } = await import("../services/ai-settings");
      await applyAiSettingsToRuntime();
      return getPublicAiSettings();
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

      const source = await fetchProductSeoSource(shop, ctx.sessionToken, args.productId);
      const beforeMetrics = analyzeProductSeoMetrics(productSeoMetricsInput(source));
      const creditsUsed = seoApplyCreditCost(beforeMetrics);
      await consumeAiCredit(tenantId, creditsUsed);

      const improvements = await generateProductSeoImprovements(
        {
          title: source.title,
          handle: source.handle,
          descriptionHtml: source.descriptionHtml,
          seo: source.seo,
        },
        beforeMetrics as unknown as Record<string, unknown>,
      );

      // Guarantee SEO title/description even if the model omitted them
      if (!improvements.seoTitle?.trim()) {
        improvements.seoTitle = source.title.slice(0, 60);
      }
      if (!improvements.seoDescription?.trim()) {
        const plain = String(source.descriptionHtml ?? "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        improvements.seoDescription =
          plain.slice(0, 155) || `Shop ${source.title} — quality products with fast shipping.`;
      }

      const appliedSeo = await applyProductSeoToShopify(
        shop,
        ctx.sessionToken,
        args.productId,
        improvements,
      );

      // Brief pause so Shopify Admin API reflects the write
      await new Promise((r) => setTimeout(r, 400));

      let updated = await fetchProductSeoSource(shop, ctx.sessionToken, args.productId);
      // If SEO title still missing after apply, force a second write with known good values
      if (!updated.seo.title?.trim() && improvements.seoTitle) {
        await applyProductSeoToShopify(shop, ctx.sessionToken, args.productId, {
          seoTitle: improvements.seoTitle,
          seoDescription: improvements.seoDescription,
        });
        await new Promise((r) => setTimeout(r, 400));
        updated = await fetchProductSeoSource(shop, ctx.sessionToken, args.productId);
      }

      // Prefer mutation response SEO if re-fetch lags
      if (!updated.seo.title?.trim() && appliedSeo.seoTitle) {
        updated = {
          ...updated,
          seo: {
            title: appliedSeo.seoTitle,
            description: appliedSeo.seoDescription ?? updated.seo.description,
          },
        };
      }

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
            creditsUsed,
            beforeScore: beforeMetrics.overallScore,
            afterScore: metrics.overallScore,
          } as object,
          creditsConsumed: creditsUsed,
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
        creditsUsed,
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
      const intentResult = await parseAgentIntent(args.prompt);
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

      if (intentResult.intent === "CREATE_BACKUP") {
        return {
          intent: intentResult.intent,
          message:
            "Good instinct — but catalog snapshots don't need an agent run. Open Backups from the sidebar anytime to save your catalog. I didn't charge a run for this.",
          scan: null,
          previewJob: null,
          agentJobId: null,
          agentRunsUsed: tenant?.agentRunsUsed ?? 0,
          suggestedActions: intentResult.suggestedActions,
        };
      }

      await consumeAgentRun(tenantId, 1);

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
          "On it — I'm reading your request and will share a clear summary here in a moment. Long steps run in the background.",
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
    fixScanIssues: async (
      _: unknown,
      args: { category: string; productIds: string[] },
      ctx: GraphQLContext,
    ) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      if (!args.productIds.length) throw new Error("No products selected to fix");

      await consumeAiCredit(tenantId, 1);

      const category = args.category.toLowerCase();
      let plan;
      if (category === "seo") {
        plan = buildSeoImprovementPlanForProductIds(args.productIds);
      } else if (category === "catalog" || category === "descriptions") {
        plan = buildDescriptionRewritePlanForProductIds(args.productIds);
      } else {
        throw new Error("Unsupported fix category. Use SEO or Catalog.");
      }

      return createBulkEditPreviewJob(
        tenantId,
        shop,
        `Fix ${args.category} for ${args.productIds.length} products`,
        plan,
        ctx.sessionToken,
      );
    },
    previewMergeProducts: async (
      _: unknown,
      args: { primaryProductId: string; duplicateProductIds: string[] },
      ctx: GraphQLContext,
    ) => {
      const { tenantId } = requireActiveMerchant(ctx);
      const duplicateIds = args.duplicateProductIds.filter((id) => id !== args.primaryProductId);
      if (!duplicateIds.length) throw new Error("Select at least one duplicate product to merge");

      const rows = duplicateIds.map((id, i) => ({
        resourceType: "product",
        resourceId: id,
        productId: id,
        resourceTitle: `Duplicate product ${i + 1}`,
        field: "merge",
        before: id,
        after: `Merge into primary product`,
      }));

      const job = await prisma.job.create({
        data: {
          tenantId,
          type: "BULK_EDIT",
          status: "PREVIEW",
          nlPrompt: `Merge ${duplicateIds.length} duplicate(s) into primary`,
          mutationPlan: {
            action: "merge_products",
            primaryProductId: args.primaryProductId,
            duplicateProductIds: duplicateIds,
          } as object,
          diffPreview: { rows, totalChanges: duplicateIds.length } as object,
          impactSummary: `Merge ${duplicateIds.length} duplicate listing(s) into your primary product. Variants combine; duplicates are removed.`,
          rowCount: duplicateIds.length,
        },
        include: { lineItems: { take: 0 } },
      });

      return { ...job, lineItems: [] };
    },
    previewBulkMergeProducts: async (
      _: unknown,
      args: { merges: Array<{ primaryProductId: string; duplicateProductIds: string[] }> },
      ctx: GraphQLContext,
    ) => {
      const { tenantId } = requireActiveMerchant(ctx);
      const merges = args.merges
        .map((m) => ({
          primaryProductId: m.primaryProductId,
          duplicateProductIds: m.duplicateProductIds.filter((id) => id !== m.primaryProductId),
        }))
        .filter((m) => m.duplicateProductIds.length > 0);

      if (!merges.length) throw new Error("Select at least one duplicate group to merge");

      const totalDuplicates = merges.reduce((sum, m) => sum + m.duplicateProductIds.length, 0);
      const rows = merges.flatMap((m, gi) =>
        m.duplicateProductIds.map((id, i) => ({
          resourceType: "product",
          resourceId: id,
          productId: id,
          resourceTitle: `Group ${gi + 1} duplicate ${i + 1}`,
          field: "merge",
          before: id,
          after: `Merge into primary`,
        })),
      );

      const job = await prisma.job.create({
        data: {
          tenantId,
          type: "BULK_EDIT",
          status: "PREVIEW",
          nlPrompt: `Bulk merge ${totalDuplicates} duplicate(s) across ${merges.length} group(s)`,
          mutationPlan: {
            action: "bulk_merge_products",
            merges,
          } as object,
          diffPreview: { rows, totalChanges: totalDuplicates } as object,
          impactSummary: `Merge ${totalDuplicates} duplicate listing(s) across ${merges.length} group(s). Variants combine on each primary; duplicates are removed after approval.`,
          rowCount: totalDuplicates,
        },
        include: { lineItems: { take: 0 } },
      });

      return { ...job, lineItems: [] };
    },
    connectGoogleSheet: async (
      _: unknown,
      args: { spreadsheetUrl: string; sheetName?: string },
      ctx: GraphQLContext,
    ) => {
      const { tenantId } = requireActiveMerchant(ctx);
      const parsed = parseSpreadsheetUrl(args.spreadsheetUrl);
      if (!parsed) throw new Error("Invalid Google Sheets URL or spreadsheet ID");

      const existing = await prisma.tenantIntegration.findUnique({
        where: { tenantId_type: { tenantId, type: "GOOGLE_SHEETS" } },
      });
      const prev = existing?.config as GoogleSheetsConfig | undefined;

      const config: GoogleSheetsConfig = {
        ...(prev ?? {}),
        spreadsheetId: parsed.spreadsheetId,
        sheetGid: parsed.gid,
        sheetName: args.sheetName ?? prev?.sheetName ?? "Sheet1",
        direction: "import",
      };

      return prisma.tenantIntegration.upsert({
        where: { tenantId_type: { tenantId, type: "GOOGLE_SHEETS" } },
        create: {
          tenantId,
          type: "GOOGLE_SHEETS",
          config: config as object,
          enabled: true,
        },
        update: {
          config: config as object,
          enabled: true,
        },
      });
    },
    syncGoogleSheet: async (_: unknown, args: { integrationId: string }, ctx: GraphQLContext) => {
      const { tenantId, shop } = requireActiveMerchant(ctx);
      const integration = await prisma.tenantIntegration.findFirst({
        where: { id: args.integrationId, tenantId, type: "GOOGLE_SHEETS" },
      });
      if (!integration) throw new Error("Google Sheets connection not found");

      const config = integration.config as unknown as GoogleSheetsConfig;
      const syncMode = config.syncMode ?? "create";
      const canLiveFeed =
        config.savedMappings?.length &&
        syncMode !== "create" &&
        (syncMode === "update_by_sku" ||
          syncMode === "update_by_barcode" ||
          syncMode === "upsert");

      if (canLiveFeed) {
        const { jobId } = await enqueueSupplierFeedSync(tenantId, shop, integration.id);
        const feedJob = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
        return feedJob;
      }

      const downloaded = await downloadGoogleSheetCsv(config.spreadsheetId, config.sheetGid);

      const syncJob = await prisma.job.create({
        data: {
          tenantId,
          type: "IMPORT",
          status: "MAPPING",
          filePath: downloaded.filePath,
          fileName: downloaded.fileName,
          resourceType: "products",
          rowCount: Math.max(0, downloaded.rowEstimate - 1),
          mutationPlan: {
            source: "google_sheets",
            spreadsheetId: config.spreadsheetId,
            integrationId: integration.id,
          } as object,
          impactSummary: `Google Sheet synced — ${Math.max(0, downloaded.rowEstimate - 1)} rows ready to map`,
        },
      });

      await importQueue.add("analyze", { jobId: syncJob.id, tenantId, shop });

      await prisma.tenantIntegration.update({
        where: { id: integration.id },
        data: {
          config: { ...config, lastSyncAt: new Date().toISOString() } as object,
        },
      });

      return syncJob;
    },
    updateGoogleSheetFeed: async (
      _: unknown,
      args: {
        integrationId: string;
        syncMode?: string;
        matchField?: string;
        schedule?: string;
        autoSyncEnabled?: boolean;
        autoApprove?: boolean;
      },
      ctx: GraphQLContext,
    ) => {
      const { tenantId } = requireActiveMerchant(ctx);
      const integration = await prisma.tenantIntegration.findFirst({
        where: { id: args.integrationId, tenantId, type: "GOOGLE_SHEETS" },
      });
      if (!integration) throw new Error("Google Sheets connection not found");

      const prev = integration.config as unknown as GoogleSheetsConfig;
      const syncMode = args.syncMode ? normalizeFeedSyncMode(args.syncMode) : prev.syncMode ?? "create";
      const matchField =
        args.matchField === "variants.barcode" || args.matchField === "variants.sku"
          ? args.matchField
          : syncMode === "update_by_barcode"
            ? "variants.barcode"
            : prev.matchField ?? "variants.sku";

      const updatedConfig: GoogleSheetsConfig = {
        ...prev,
        syncMode,
        matchField,
        schedule: args.schedule ?? prev.schedule ?? "daily",
        autoSyncEnabled: args.autoSyncEnabled ?? prev.autoSyncEnabled ?? false,
        autoApprove: args.autoApprove ?? prev.autoApprove ?? false,
      };

      return prisma.tenantIntegration.update({
        where: { id: integration.id },
        data: { config: updatedConfig as object },
      });
    },
    disconnectGoogleSheet: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const { tenantId } = requireActiveMerchant(ctx);
      await prisma.tenantIntegration.deleteMany({
        where: { id: args.id, tenantId, type: "GOOGLE_SHEETS" },
      });
      return true;
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
    updateScheduledJob: async (
      _: unknown,
      args: { id: string; enabled: boolean },
      ctx: GraphQLContext,
    ) => {
      const { tenantId } = requireActiveMerchant(ctx);
      const existing = await prisma.scheduledJob.findFirst({
        where: { id: args.id, tenantId },
      });
      if (!existing) throw new Error("Schedule not found");

      return prisma.scheduledJob.update({
        where: { id: existing.id },
        data: { enabled: args.enabled },
      });
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
    adminUpdateAiSettings: async (
      _: unknown,
      args: {
        input: {
          provider?: string | null;
          fallbackOrder?: string | null;
          groqApiKey?: string | null;
          groqModel?: string | null;
          geminiApiKey?: string | null;
          geminiModel?: string | null;
          openaiApiKey?: string | null;
          openaiModel?: string | null;
          clearGroqApiKey?: boolean | null;
          clearGeminiApiKey?: boolean | null;
          clearOpenaiApiKey?: boolean | null;
        };
      },
      ctx: GraphQLContext,
    ) => {
      requireAdmin(ctx);
      const { updateAiSettings } = await import("../services/ai-settings");
      return updateAiSettings(args.input);
    },
    adminTestAi: async (_: unknown, args: { prompt?: string | null }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      const { applyAiSettingsToRuntime } = await import("../services/ai-settings");
      await applyAiSettingsToRuntime();
      const { testAiConnection } = await import("@tidysync/ai");
      return testAiConnection(args.prompt ?? undefined);
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

export async function createBulkEditPreviewJob(
  tenantId: string,
  shop: string,
  label: string,
  plan: object,
  sessionToken?: string,
) {
  const { buildDiffFromMutationPlan } = await import("../services/shopify-products");
  const { detectAnomalies } = await import("@tidysync/shared");

  const job = await prisma.job.create({
    data: {
      tenantId,
      type: "BULK_EDIT",
      status: "PREVIEW",
      nlPrompt: label,
      isAiGenerated: true,
      mutationPlan: plan as object,
    },
  });

  let diff: { rows: unknown[]; totalChanges: number };
  try {
    diff = await buildDiffFromMutationPlan(shop, plan as import("@tidysync/shared").MutationPlan, sessionToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "FAILED", errorSummary: msg },
    });
    throw err;
  }

  const anomalies = detectAnomalies(
    diff.rows.map((r) => ({
      field: (r as { field: string }).field,
      before: (r as { before: unknown }).before,
      after: (r as { after: unknown }).after,
    })),
  );

  const updated = await prisma.job.update({
    where: { id: job.id },
    data: {
      diffPreview: diff as object,
      impactSummary:
        diff.totalChanges > 0
          ? `${label} — ${diff.totalChanges} change(s) ready for review`
          : "No matching products found for this fix.",
      rowCount: diff.totalChanges,
    },
    include: { lineItems: { take: 0 } },
  });

  return { ...updated, lineItems: [], anomalies };
}

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
