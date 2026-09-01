import { prisma } from "../client";
import type { JobStatus, JobType, Prisma } from "@prisma/client";

export const tenantRepository = {
  findByShopDomain(shopDomain: string) {
    return prisma.tenant.findUnique({
      where: { shopDomain },
      include: { plan: true },
    });
  },

  findById(id: string) {
    return prisma.tenant.findUnique({
      where: { id },
      include: { plan: true },
    });
  },

  upsertByShopDomain(
    shopDomain: string,
    data: { shopName?: string; planId?: string },
  ) {
    return prisma.tenant.upsert({
      where: { shopDomain },
      create: {
        shopDomain,
        shopName: data.shopName,
        planId: data.planId,
        status: "ACTIVE",
        aiCreditsResetAt: new Date(),
      },
      update: {
        shopName: data.shopName ?? undefined,
        status: "ACTIVE",
      },
    });
  },

  incrementAiCreditsUsed(id: string, credits: number) {
    return prisma.tenant.update({
      where: { id },
      data: { aiCreditsUsed: { increment: credits } },
    });
  },

  listForAdmin(limit = 50) {
    return prisma.tenant.findMany({
      take: limit,
      orderBy: { installedAt: "desc" },
      include: { plan: true },
    });
  },

  update(id: string, data: Prisma.TenantUncheckedUpdateInput) {
    return prisma.tenant.update({
      where: { id },
      data,
      include: { plan: true },
    });
  },

  grantExtraCredits(id: string, credits: number) {
    return prisma.tenant.update({
      where: { id },
      data: { extraAiCredits: { increment: credits } },
      include: { plan: true },
    });
  },
};

export const jobRepository = {
  findForTenant(tenantId: string, jobId: string) {
    return prisma.job.findFirst({
      where: { id: jobId, tenantId },
      include: { lineItems: { orderBy: { rowIndex: "asc" }, take: 500 } },
    });
  },

  listForTenant(tenantId: string, limit = 20) {
    return prisma.job.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { lineItems: { take: 0 } },
    });
  },

  create(data: Prisma.JobCreateInput) {
    return prisma.job.create({ data });
  },

  update(jobId: string, data: Prisma.JobUpdateInput) {
    return prisma.job.update({
      where: { id: jobId },
      data,
      include: { lineItems: { take: 0 } },
    });
  },

  listForAdmin(limit = 100, status?: JobStatus) {
    return prisma.job.findMany({
      where: status ? { status } : undefined,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { lineItems: { take: 0 }, tenant: { select: { shopDomain: true } } },
    });
  },

  countByStatus() {
    return Promise.all([
      prisma.job.count(),
      prisma.job.count({ where: { status: "RUNNING" } }),
      prisma.job.count({ where: { status: "FAILED" } }),
      prisma.job.count({ where: { status: "COMPLETED" } }),
    ]);
  },
};

export const sessionRepository = {
  findOfflineForShop(shop: string) {
    return prisma.session.findFirst({
      where: { shop, isOnline: false },
      orderBy: { expires: "desc" },
    });
  },
};

export const auditRepository = {
  listForTenant(tenantId: string, limit = 50) {
    return prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  async listForTenantPaged(tenantId: string, limit = 20, offset = 0) {
    const pageSize = Math.min(Math.max(limit, 1), 100);
    const skip = Math.max(offset, 0);
    const [items, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: pageSize,
        skip,
      }),
      prisma.auditLog.count({ where: { tenantId } }),
    ]);
    const page = Math.floor(skip / pageSize) + 1;
    return {
      items,
      totalCount,
      page,
      pageSize,
      hasMore: skip + items.length < totalCount,
    };
  },

  listForAdmin(limit = 100) {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { tenant: { select: { shopDomain: true } } },
    });
  },
};

export const scheduledJobRepository = {
  listForTenant(tenantId: string) {
    return prisma.scheduledJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
  },

  listEnabled() {
    return prisma.scheduledJob.findMany({
      where: { enabled: true },
      include: { tenant: true },
    });
  },
};

export const featureFlagRepository = {
  listAll() {
    return prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
  },

  async isEnabled(key: string, tenantId?: string) {
    if (tenantId) {
      const tenantFlag = await prisma.featureFlag.findFirst({
        where: { key, tenantId },
      });
      if (tenantFlag) return tenantFlag.enabled;
    }
    const global = await prisma.featureFlag.findFirst({
      where: { key, tenantId: null },
    });
    return global?.enabled ?? false;
  },
};

export const apiKeyRepository = {
  findByPrefix(prefix: string) {
    return prisma.apiKey.findFirst({
      where: { keyPrefix: prefix, revokedAt: null },
      include: { tenant: true },
    });
  },

  listForTenant(tenantId: string) {
    return prisma.apiKey.findMany({
      where: { tenantId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  listForAdmin(tenantId?: string) {
    return prisma.apiKey.findMany({
      where: tenantId ? { tenantId, revokedAt: null } : { revokedAt: null },
      orderBy: { createdAt: "desc" },
      include: { tenant: { select: { shopDomain: true } } },
      take: 200,
    });
  },

  async create(tenantId: string, name: string, scopes: string[]) {
    const crypto = await import("node:crypto");
    const rawKey = `tidysync_${crypto.randomBytes(24).toString("hex")}`;
    const prefix = rawKey.slice(0, 16);
    const pepper = process.env.API_KEY_PEPPER ?? "";
    const hash = crypto.createHash("sha256").update(rawKey + pepper).digest("hex");
    const record = await prisma.apiKey.create({
      data: {
        tenantId,
        name,
        keyPrefix: prefix,
        keyHash: hash,
        scopes,
      },
    });
    return { record, rawKey };
  },

  revoke(id: string) {
    return prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  },
};
