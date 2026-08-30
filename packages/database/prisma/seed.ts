import { prisma } from "../src/index";
import bcrypt from "bcryptjs";
import { PLATFORM_CATALOG } from "@tidysync/shared";

const PLANS = [
  {
    name: "Free",
    slug: "free",
    maxProducts: 250,
    aiCreditsPerMonth: 5,
    scheduledJobs: false,
    crossPlatform: true,
    multiStore: false,
    priceMonthlyCents: 0,
    isFree: true,
    shopifyPlanName: "TidySync Free",
  },
  {
    name: "Starter",
    slug: "starter",
    maxProducts: 2000,
    aiCreditsPerMonth: 50,
    scheduledJobs: true,
    crossPlatform: true,
    multiStore: false,
    priceMonthlyCents: 2000,
    isFree: false,
    shopifyPlanName: "TidySync Starter",
  },
  {
    name: "Growth",
    slug: "growth",
    maxProducts: 10000,
    aiCreditsPerMonth: 200,
    scheduledJobs: true,
    crossPlatform: true,
    multiStore: false,
    priceMonthlyCents: 5000,
    isFree: false,
    shopifyPlanName: "TidySync Growth",
  },
  {
    name: "Advanced",
    slug: "advanced",
    maxProducts: 999999,
    aiCreditsPerMonth: 1000,
    scheduledJobs: true,
    crossPlatform: true,
    multiStore: true,
    priceMonthlyCents: 20000,
    isFree: false,
    shopifyPlanName: "TidySync Advanced",
  },
];

async function main() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      create: plan,
      update: plan,
    });
  }

  const globalMaps = [
    ...PLATFORM_CATALOG.filter((p) => p.key !== "csv").map((p) => ({
      platformKey: p.key,
      version: p.version,
      name: p.name,
      mappings: p.productMappings,
      transforms: {} as Record<string, string>,
    })),
    {
      platformKey: "woocommerce",
      version: "customers-v1",
      name: "WooCommerce Customers",
      mappings: {
        Email: "email",
        "First name": "firstName",
        "Last name": "lastName",
        Phone: "phone",
        Tags: "tags",
        Note: "note",
      },
      transforms: {},
    },
    {
      platformKey: "shopify",
      version: "collections-v1",
      name: "Shopify Collections",
      mappings: {
        title: "title",
        handle: "handle",
        body_html: "descriptionHtml",
        sort_order: "sortOrder",
      },
      transforms: {},
    },
    {
      platformKey: "shopify",
      version: "metafields-v1",
      name: "Shopify Metafields",
      mappings: {
        owner_id: "ownerId",
        owner_type: "ownerType",
        namespace: "namespace",
        key: "key",
        value: "value",
        type: "type",
        description: "description",
      },
      transforms: {},
    },
    {
      platformKey: "shopify",
      version: "discounts-v1",
      name: "Shopify Discounts",
      mappings: {
        Title: "title",
        Code: "code",
        "Value type": "valueType",
        Value: "value",
        "Starts at": "startsAt",
        "Ends at": "endsAt",
        "Usage limit": "usageLimit",
      },
      transforms: {},
    },
  ];

  for (const map of globalMaps) {
    const existing = await prisma.platformFieldMap.findFirst({
      where: {
        platformKey: map.platformKey,
        version: map.version,
        isGlobal: true,
        tenantId: null,
      },
    });
    if (existing) {
      await prisma.platformFieldMap.update({
        where: { id: existing.id },
        data: { mappings: map.mappings, transforms: map.transforms, name: map.name },
      });
    } else {
      await prisma.platformFieldMap.create({
        data: {
          ...map,
          isGlobal: true,
          tenantId: null,
        },
      });
    }
  }

  const flags = [
    { key: "ai_nl_bulk_edit", enabled: true, description: "Natural language bulk edit" },
    { key: "catalog_health_scan", enabled: true, description: "Catalog health scan" },
    { key: "scheduled_jobs", enabled: true, description: "Scheduled jobs" },
    { key: "public_api", enabled: true, description: "Public REST API" },
    { key: "multi_store", enabled: true, description: "Agency multi-store" },
    { key: "require_install_approval", enabled: false, description: "New installs need admin approval" },
  ];

  for (const flag of flags) {
    const existing = await prisma.featureFlag.findFirst({
      where: { key: flag.key, tenantId: null },
    });
    if (existing) {
      await prisma.featureFlag.update({ where: { id: existing.id }, data: flag });
    } else {
      await prisma.featureFlag.create({ data: { ...flag, tenantId: null } });
    }
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@tidysync.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash,
      name: "TidySync Admin",
      role: "SUPER_ADMIN",
    },
    update: {},
  });

  console.log("Seed complete.");
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
