import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { prisma } from "./client";

/** Official Shopify session storage backed by Prisma / PostgreSQL */
export const shopifySessionStorage = new PrismaSessionStorage(prisma, {
  tableName: "Session",
});
