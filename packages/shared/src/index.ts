export const TIDYSYNC_APP_NAME = "TidySync";

export const QUEUE_NAMES = {
  IMPORT: "tidysync-import",
  EXPORT: "tidysync-export",
  BULK_EDIT: "tidysync-bulk-edit",
  UNDO: "tidysync-undo",
  CATALOG_SCAN: "tidysync-catalog-scan",
} as const;

export {
  PLATFORM_CATALOG,
  SUPPORTED_PLATFORMS,
  getPlatform,
  platformsForImport,
  platformsForExport,
  type PlatformDefinition,
  type PlatformKey,
} from "./platforms";

export interface FieldMapping {
  sourceColumn: string;
  targetField: string;
  transform?: string;
}

export interface MutationPlanStep {
  action: string;
  field: string;
  value?: string | number | boolean;
  filter?: Record<string, unknown>;
  description: string;
}

export interface MutationPlan {
  steps: MutationPlanStep[];
  estimatedAffectedCount?: number;
}

export interface DiffRow {
  resourceType: string;
  resourceId: string;
  resourceTitle?: string;
  field: string;
  before: string | number | null;
  after: string | number | null;
}

export interface DiffPreview {
  rows: DiffRow[];
  totalChanges: number;
  anomalies?: AnomalyWarning[];
}

export interface AnomalyWarning {
  severity: "low" | "medium" | "high";
  message: string;
  affectedCount: number;
}

export interface JobProgress {
  jobId: string;
  status: string;
  processedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  rowCount: number;
}

export const SHOPIFY_PRODUCT_FIELDS = [
  "title",
  "descriptionHtml",
  "vendor",
  "productType",
  "tags",
  "status",
  "variants.sku",
  "variants.price",
  "variants.compareAtPrice",
  "variants.inventoryQuantity",
  "variants.weight",
  "variants.barcode",
  "images",
] as const;

export const SHOPIFY_COLLECTION_FIELDS = [
  "title",
  "handle",
  "descriptionHtml",
  "sortOrder",
  "ruleSet",
] as const;

export const SHOPIFY_CUSTOMER_FIELDS = [
  "email",
  "firstName",
  "lastName",
  "phone",
  "tags",
  "note",
  "acceptsMarketing",
  "address1",
  "city",
  "province",
  "country",
  "zip",
] as const;

export const SHOPIFY_METAFIELD_FIELDS = [
  "namespace",
  "key",
  "value",
  "type",
  "ownerType",
  "ownerId",
  "description",
] as const;

export const SHOPIFY_DISCOUNT_FIELDS = [
  "title",
  "code",
  "valueType",
  "value",
  "startsAt",
  "endsAt",
  "usageLimit",
  "appliesOncePerCustomer",
  "minimumRequirement",
] as const;

export type ResourceType =
  | "products"
  | "collections"
  | "customers"
  | "metafields"
  | "discounts";

export const RESOURCE_TYPES: ResourceType[] = [
  "products",
  "collections",
  "customers",
  "metafields",
  "discounts",
];

export const CREDIT_TOP_UP_PRICE_CENTS = 100;

export function getShopifyFieldsForResource(resourceType: ResourceType): readonly string[] {
  switch (resourceType) {
    case "collections":
      return SHOPIFY_COLLECTION_FIELDS;
    case "customers":
      return SHOPIFY_CUSTOMER_FIELDS;
    case "metafields":
      return SHOPIFY_METAFIELD_FIELDS;
    case "discounts":
      return SHOPIFY_DISCOUNT_FIELDS;
    default:
      return SHOPIFY_PRODUCT_FIELDS;
  }
}

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

export * from "./platform-mapping";
