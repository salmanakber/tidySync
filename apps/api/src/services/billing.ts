import { prisma, tenantRepository } from "@tidysync/database";
import { CREDIT_TOP_UP_PRICE_CENTS } from "@tidysync/shared";
import { getShopGraphqlClient } from "../shopify/client";

const APP_SUBSCRIPTION_CREATE = `#graphql
  mutation appSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $test: Boolean
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, lineItems: $lineItems) {
      appSubscription { id status }
      confirmationUrl
      userErrors { field message }
    }
  }
`;

const APP_PURCHASE_ONE_TIME_CREATE = `#graphql
  mutation appPurchaseOneTimeCreate(
    $name: String!
    $returnUrl: URL!
    $test: Boolean
    $price: MoneyInput!
  ) {
    appPurchaseOneTimeCreate(name: $name, returnUrl: $returnUrl, test: $test, price: $price) {
      appPurchaseOneTime { id status }
      confirmationUrl
      userErrors { field message }
    }
  }
`;

const APP_SUBSCRIPTION_QUERY = `#graphql
  query appSubscription($id: ID!) {
    node(id: $id) {
      ... on AppSubscription {
        id
        status
        name
      }
    }
  }
`;

const APP_PURCHASE_ONE_TIME_QUERY = `#graphql
  query appPurchaseOneTime($id: ID!) {
    node(id: $id) {
      ... on AppPurchaseOneTime {
        id
        status
        name
      }
    }
  }
`;

function billingTestMode() {
  return process.env.SHOPIFY_BILLING_TEST === "true" || process.env.NODE_ENV !== "production";
}

function returnUrl(shop: string, type: "subscription" | "onetime", chargeId: string) {
  const base = process.env.APP_URL ?? "http://localhost:4000";
  return `${base}/billing/confirm?shop=${encodeURIComponent(shop)}&type=${type}&charge_id=${encodeURIComponent(chargeId)}`;
}

export async function createPlanSubscription(shop: string, tenantId: string, planSlug: string) {
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!plan || plan.isFree) throw new Error("Invalid plan for subscription");

  const client = await getShopGraphqlClient(shop);
  const name = plan.shopifyPlanName ?? `TidySync ${plan.name}`;

  const response = await client.request(APP_SUBSCRIPTION_CREATE, {
    variables: {
      name,
      returnUrl: `${process.env.APP_URL ?? "http://localhost:4000"}/billing/confirm?shop=${encodeURIComponent(shop)}&type=subscription&plan=${planSlug}`,
      test: billingTestMode(),
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: plan.priceMonthlyCents / 100, currencyCode: "USD" },
              interval: "EVERY_30_DAYS",
            },
          },
        },
      ],
    },
  });

  const data = response.data as {
    appSubscriptionCreate: {
      appSubscription: { id: string; status: string } | null;
      confirmationUrl: string | null;
      userErrors: Array<{ message: string }>;
    };
  };

  if (data.appSubscriptionCreate.userErrors?.length) {
    throw new Error(data.appSubscriptionCreate.userErrors.map((e) => e.message).join(", "));
  }

  const subscription = data.appSubscriptionCreate.appSubscription;
  if (!subscription?.id || !data.appSubscriptionCreate.confirmationUrl) {
    throw new Error("Failed to create subscription");
  }

  await prisma.billingCharge.create({
    data: {
      tenantId,
      type: "RECURRING",
      shopifyChargeId: subscription.id,
      status: "PENDING",
      amountCents: plan.priceMonthlyCents,
      planId: plan.id,
    },
  });

  await tenantRepository.update(tenantId, {
    billingStatus: "PENDING_APPROVAL",
    shopifySubscriptionId: subscription.id,
  });

  return {
    confirmationUrl: data.appSubscriptionCreate.confirmationUrl,
    chargeId: subscription.id,
  };
}

export async function createCreditTopUpPurchase(shop: string, tenantId: string, credits: number) {
  if (credits < 1 || credits > 500) throw new Error("Credits must be between 1 and 500");

  const tenant = await tenantRepository.findById(tenantId);
  if (tenant?.plan?.isFree) throw new Error("Credit top-ups require a paid plan");

  const amountCents = credits * CREDIT_TOP_UP_PRICE_CENTS;
  const client = await getShopGraphqlClient(shop);

  const response = await client.request(APP_PURCHASE_ONE_TIME_CREATE, {
    variables: {
      name: `TidySync AI credits (${credits})`,
      returnUrl: `${process.env.APP_URL ?? "http://localhost:4000"}/billing/confirm?shop=${encodeURIComponent(shop)}&type=onetime&credits=${credits}`,
      test: billingTestMode(),
      price: { amount: amountCents / 100, currencyCode: "USD" },
    },
  });

  const data = response.data as {
    appPurchaseOneTimeCreate: {
      appPurchaseOneTime: { id: string; status: string } | null;
      confirmationUrl: string | null;
      userErrors: Array<{ message: string }>;
    };
  };

  if (data.appPurchaseOneTimeCreate.userErrors?.length) {
    throw new Error(data.appPurchaseOneTimeCreate.userErrors.map((e) => e.message).join(", "));
  }

  const purchase = data.appPurchaseOneTimeCreate.appPurchaseOneTime;
  if (!purchase?.id || !data.appPurchaseOneTimeCreate.confirmationUrl) {
    throw new Error("Failed to create one-time purchase");
  }

  await prisma.billingCharge.create({
    data: {
      tenantId,
      type: "ONE_TIME",
      shopifyChargeId: purchase.id,
      status: "PENDING",
      amountCents,
      creditsGranted: credits,
    },
  });

  return {
    confirmationUrl: data.appPurchaseOneTimeCreate.confirmationUrl,
    chargeId: purchase.id,
  };
}

export async function confirmBillingCharge(
  shop: string,
  chargeId: string,
  type: "subscription" | "onetime",
  planSlug?: string,
  credits?: number,
) {
  const tenant = await tenantRepository.findByShopDomain(shop);
  if (!tenant) throw new Error("Tenant not found");

  const client = await getShopGraphqlClient(shop);
  let status = "PENDING";

  if (type === "subscription") {
    const response = await client.request(APP_SUBSCRIPTION_QUERY, {
      variables: { id: chargeId },
    });
    const node = (response.data as { node: { status: string } | null }).node;
    status = node?.status ?? "PENDING";
  } else {
    const response = await client.request(APP_PURCHASE_ONE_TIME_QUERY, {
      variables: { id: chargeId },
    });
    const node = (response.data as { node: { status: string } | null }).node;
    status = node?.status ?? "PENDING";
  }

  const charge = await prisma.billingCharge.findFirst({
    where: { shopifyChargeId: chargeId, tenantId: tenant.id },
  });

  if (status === "ACTIVE") {
    if (type === "subscription" && planSlug) {
      const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
      if (plan) {
        await tenantRepository.update(tenant.id, {
          planId: plan.id,
          billingStatus: "ACTIVE",
          shopifySubscriptionId: chargeId,
        });
      }
      if (charge) {
        await prisma.billingCharge.update({
          where: { id: charge.id },
          data: { status: "ACTIVE", activatedAt: new Date() },
        });
      }
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: "billing.subscription_activated",
          metadata: { planSlug, chargeId },
        },
      });
    } else if (type === "onetime") {
      const grantCredits = credits ?? charge?.creditsGranted ?? 0;
      if (grantCredits > 0) {
        await tenantRepository.grantExtraCredits(tenant.id, grantCredits);
      }
      if (charge) {
        await prisma.billingCharge.update({
          where: { id: charge.id },
          data: { status: "ACTIVE", activatedAt: new Date() },
        });
      }
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: "billing.credits_purchased",
          metadata: { credits: grantCredits, chargeId },
        },
      });
    }
    return { ok: true, status: "ACTIVE" };
  }

  if (status === "DECLINED") {
    await tenantRepository.update(tenant.id, { billingStatus: "DECLINED" });
    if (charge) {
      await prisma.billingCharge.update({
        where: { id: charge.id },
        data: { status: "DECLINED" },
      });
    }
    return { ok: false, status: "DECLINED" };
  }

  return { ok: false, status };
}

export async function listAvailablePlans() {
  return prisma.plan.findMany({ orderBy: { priceMonthlyCents: "asc" } });
}

export function computeAiCreditsRemaining(tenant: {
  aiCreditsUsed: number;
  extraAiCredits: number;
  plan: { aiCreditsPerMonth: number } | null;
}) {
  if (!tenant.plan) return 0;
  return tenant.plan.aiCreditsPerMonth + tenant.extraAiCredits - tenant.aiCreditsUsed;
}

const ACTIVE_SUBSCRIPTIONS = `#graphql
  query activeSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        lineItems { plan { pricingDetails { ... on AppRecurringPricing { price { amount currencyCode } interval } } } }
      }
    }
  }
`;

export async function syncActiveSubscriptionForShop(shop: string) {
  const tenant = await tenantRepository.findByShopDomain(shop);
  if (!tenant) return null;

  const client = await getShopGraphqlClient(shop);
  const response = await client.request(ACTIVE_SUBSCRIPTIONS, {});
  const subs = (response.data as {
    currentAppInstallation?: { activeSubscriptions?: Array<{ id: string; name: string; status: string }> };
  }).currentAppInstallation?.activeSubscriptions ?? [];

  const active = subs.find((s) => s.status === "ACTIVE");
  if (!active) {
    const freePlan = await prisma.plan.findFirst({ where: { isFree: true } });
    if (freePlan) {
      await tenantRepository.update(tenant.id, {
        planId: freePlan.id,
        billingStatus: "ACTIVE",
        shopifySubscriptionId: null,
      });
    }
    return { synced: true, plan: "free" };
  }

  const plan = await prisma.plan.findFirst({
    where: {
      OR: [
        { shopifyPlanName: active.name },
        { name: active.name.replace(/^TidySync\s*/i, "") },
      ],
    },
  });

  if (plan) {
    await tenantRepository.update(tenant.id, {
      planId: plan.id,
      billingStatus: "ACTIVE",
      shopifySubscriptionId: active.id,
    });
    await prisma.billingCharge.updateMany({
      where: { tenantId: tenant.id, shopifyChargeId: active.id },
      data: { status: "ACTIVE", activatedAt: new Date() },
    });
  }

  return { synced: true, subscriptionId: active.id, plan: plan?.slug };
}

export async function handleShopifyBillingWebhook(
  topic: string,
  shop: string,
  payload: Record<string, unknown>,
) {
  const tenant = await tenantRepository.findByShopDomain(shop);
  if (!tenant) return;

  if (topic === "APP_SUBSCRIPTIONS_UPDATE") {
    const status = String(payload.status ?? "");
    const chargeId = String(payload.admin_graphql_api_id ?? payload.id ?? "");
    if (status === "ACTIVE") {
      await syncActiveSubscriptionForShop(shop);
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: "billing.webhook.subscription_active",
          metadata: { chargeId, topic },
        },
      });
    } else if (status === "DECLINED" || status === "FROZEN") {
      await tenantRepository.update(tenant.id, { billingStatus: status as "DECLINED" | "FROZEN" });
    }
  }

  if (topic === "APP_PURCHASES_ONE_TIME_UPDATE") {
    const status = String(payload.status ?? "");
    const chargeId = String(payload.admin_graphql_api_id ?? payload.id ?? "");
    const charge = await prisma.billingCharge.findFirst({
      where: { shopifyChargeId: chargeId, tenantId: tenant.id },
    });
    if (status === "ACTIVE" && charge?.creditsGranted) {
      await tenantRepository.grantExtraCredits(tenant.id, charge.creditsGranted);
      await prisma.billingCharge.update({
        where: { id: charge.id },
        data: { status: "ACTIVE", activatedAt: new Date() },
      });
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: "billing.webhook.credits_active",
          metadata: { chargeId, credits: charge.creditsGranted },
        },
      });
    }
  }
}
