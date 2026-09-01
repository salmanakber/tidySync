import { prisma, tenantRepository } from "@tidysync/database";

type CompliancePayload = Record<string, unknown>;

function normalizeTopic(topic: string): string {
  return topic.toUpperCase().replace(/\//g, "_").replace(/-/g, "_");
}

function shopFromPayload(shop: string, payload: CompliancePayload): string {
  const domain = payload.shop_domain ?? payload.shopDomain ?? shop;
  return String(domain).replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function customerFromPayload(payload: CompliancePayload): Record<string, unknown> | null {
  const raw = payload.customer;
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

function customerIdFromPayload(payload: CompliancePayload): string | number | undefined {
  const customer = customerFromPayload(payload);
  const fromCustomer = customer?.id;
  if (fromCustomer != null && (typeof fromCustomer === "string" || typeof fromCustomer === "number")) {
    return fromCustomer;
  }
  const direct = payload.customer_id;
  if (direct != null && (typeof direct === "string" || typeof direct === "number")) {
    return direct;
  }
  return undefined;
}

/** GDPR: merchant requests customer data — we store minimal customer PII; log for support. */
export async function handleCustomersDataRequest(shop: string, payload: CompliancePayload) {
  const shopDomain = shopFromPayload(shop, payload);
  const tenant = await tenantRepository.findByShopDomain(shopDomain);
  const customerId = customerIdFromPayload(payload);
  const customer = customerFromPayload(payload);

  await prisma.auditLog.create({
    data: {
      tenantId: tenant?.id,
      action: "compliance.customers_data_request",
      resourceType: "customer",
      resourceId: customerId != null ? String(customerId) : undefined,
      metadata: {
        shopDomain,
        ordersRequested: payload.orders_requested ?? null,
        customer: customer ?? null,
      } as object,
    },
  });

  console.info(
    `[compliance] customers/data_request shop=${shopDomain} customer=${customerId ?? "n/a"}`,
  );
}

/** GDPR: delete customer-related rows we may have stored in job metadata. */
export async function handleCustomersRedact(shop: string, payload: CompliancePayload) {
  const shopDomain = shopFromPayload(shop, payload);
  const tenant = await tenantRepository.findByShopDomain(shopDomain);
  const customerId = customerIdFromPayload(payload);
  const customerIdStr = customerId != null ? String(customerId) : null;

  if (tenant && customerIdStr) {
    const jobs = await prisma.job.findMany({
      where: {
        tenantId: tenant.id,
        resourceType: "customers",
      },
      select: { id: true },
    });
    if (jobs.length > 0) {
      await prisma.jobLineItem.deleteMany({
        where: {
          tenantId: tenant.id,
          jobId: { in: jobs.map((j) => j.id) },
        },
      });
      await prisma.job.deleteMany({
        where: { id: { in: jobs.map((j) => j.id) } },
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      tenantId: tenant?.id,
      action: "compliance.customers_redact",
      resourceType: "customer",
      resourceId: customerIdStr,
      metadata: { shopDomain } as object,
    },
  });

  console.info(`[compliance] customers/redact shop=${shopDomain} customer=${customerIdStr ?? "n/a"}`);
}

/** GDPR: shop uninstall — delete all store data from TidySync (sent ~48h after uninstall). */
export async function handleShopRedact(shop: string, payload: CompliancePayload) {
  const shopDomain = shopFromPayload(shop, payload);
  const tenant = await tenantRepository.findByShopDomain(shopDomain);
  if (!tenant) {
    console.info(`[compliance] shop/redact shop=${shopDomain} — no tenant row`);
    return;
  }

  await prisma.tenant.delete({ where: { id: tenant.id } });
  await prisma.session.deleteMany({ where: { shop: shopDomain } });

  console.info(`[compliance] shop/redact completed shop=${shopDomain} tenantId=${tenant.id}`);
}

export async function handleComplianceWebhook(topic: string, shop: string, payload: CompliancePayload) {
  const normalized = normalizeTopic(topic);

  switch (normalized) {
    case "CUSTOMERS_DATA_REQUEST":
      await handleCustomersDataRequest(shop, payload);
      break;
    case "CUSTOMERS_REDACT":
      await handleCustomersRedact(shop, payload);
      break;
    case "SHOP_REDACT":
      await handleShopRedact(shop, payload);
      break;
    default:
      console.warn(`[compliance] unhandled topic=${topic} (${normalized})`);
  }
}
