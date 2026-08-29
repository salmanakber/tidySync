import { prisma } from "../src/index";
import bcrypt from "bcryptjs";

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

const WOOCOMMERCE_MAPPINGS = {
  "Name": "title",
  "SKU": "variants.sku",
  "Regular price": "variants.price",
  "Sale price": "variants.compareAtPrice",
  "Stock": "variants.inventoryQuantity",
  "Description": "descriptionHtml",
  "Short description": "descriptionHtml",
  "Categories": "productType",
  "Tags": "tags",
  "Images": "images",
  "Weight": "variants.weight",
};

const BIGCOMMERCE_MAPPINGS = {
  "Product Name": "title",
  "SKU": "variants.sku",
  "Price": "variants.price",
  "Sale Price": "variants.compareAtPrice",
  "Current Stock": "variants.inventoryQuantity",
  "Description": "descriptionHtml",
  "Category": "productType",
  "Product Image URL": "images",
  "Weight": "variants.weight",
};

async function main() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      create: plan,
      update: plan,
    });
  }

  const globalMaps = [
    {
      platformKey: "woocommerce",
      version: "v8",
      name: "WooCommerce v8",
      mappings: WOOCOMMERCE_MAPPINGS,
      transforms: {
        variantModel: "woocommerce_attributes",
        imageField: "comma_separated_urls",
      },
    },
    {
      platformKey: "bigcommerce",
      version: "v3",
      name: "BigCommerce v3",
      mappings: BIGCOMMERCE_MAPPINGS,
      transforms: {
        variantModel: "bigcommerce_variants",
        imageField: "single_url",
      },
    },
    {
      platformKey: "magento",
      version: "v2",
      name: "Magento / Adobe Commerce",
      mappings: { sku: "variants.sku", name: "title", price: "variants.price", qty: "variants.inventoryQuantity" },
      transforms: { variantModel: "magento_configurable" },
    },
    {
      platformKey: "squarespace",
      version: "v1",
      name: "Squarespace",
      mappings: { Title: "title", Description: "descriptionHtml", SKU: "variants.sku", Price: "variants.price" },
      transforms: {},
    },
    {
      platformKey: "etsy",
      version: "v1",
      name: "Etsy",
      mappings: { TITLE: "title", DESCRIPTION: "descriptionHtml", SKU: "variants.sku", PRICE: "variants.price" },
      transforms: {},
    },
    {
      platformKey: "wix",
      version: "v1",
      name: "Wix",
      mappings: { productName: "title", description: "descriptionHtml", sku: "variants.sku", price: "variants.price" },
      transforms: {},
    },
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
        data: { mappings: map.mappings, transforms: map.transforms },
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
