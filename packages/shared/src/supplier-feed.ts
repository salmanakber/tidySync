import type { ExtendedDiffRow, ProductForMutation } from "./mutation-plan-apply";

export type FeedSyncMode = "create" | "update_by_sku" | "update_by_barcode" | "upsert";
export type FeedMatchField = "variants.sku" | "variants.barcode";

export interface SupplierFeedMutationPlan {
  integrationId?: string;
  spreadsheetId?: string;
  sheetGid?: string;
  syncMode: FeedSyncMode;
  matchField: FeedMatchField;
  mappings: Array<{ sourceColumn: string; targetField: string }>;
  defaults?: {
    title?: string;
    price?: string;
    vendor?: string;
    status?: string;
    skuPrefix?: string;
  };
  autoApprove?: boolean;
  source?: string;
  /** Row indices that should create new products on apply (upsert/create) */
  pendingCreateRowIndices?: number[];
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

export function getMatchKeyFromMapped(
  mapped: Record<string, unknown>,
  matchField: FeedMatchField,
): string | null {
  const variants = mapped.variants as Record<string, unknown> | undefined;
  if (matchField === "variants.barcode") {
    const barcode = variants?.barcode ?? mapped.barcode;
    return barcode ? normalizeKey(String(barcode)) : null;
  }
  const sku = variants?.sku ?? mapped.sku;
  return sku ? normalizeKey(String(sku)) : null;
}

export function buildProductMatchIndex(
  products: ProductForMutation[],
  matchField: FeedMatchField,
): Map<string, { product: ProductForMutation; variantId: string }> {
  const index = new Map<string, { product: ProductForMutation; variantId: string }>();
  for (const product of products) {
    for (const variant of product.variants) {
      const raw =
        matchField === "variants.barcode" ? variant.barcode?.trim() : variant.sku?.trim();
      if (!raw) continue;
      index.set(normalizeKey(raw), { product, variantId: variant.id });
    }
  }
  return index;
}

function getMappedFieldValue(mapped: Record<string, unknown>, field: string): string | number | null {
  if (field.startsWith("variants.")) {
    const sub = field.replace("variants.", "");
    const variants = mapped.variants as Record<string, unknown> | undefined;
    const v = variants?.[sub];
    if (v === undefined || v === null || v === "") return null;
    return typeof v === "number" ? v : String(v);
  }
  const top = mapped[field];
  if (top === undefined || top === null || top === "") return null;
  if (field === "tags" && Array.isArray(top)) return top.join(", ");
  return typeof top === "number" ? top : String(top);
}

export function getProductFieldBefore(
  product: ProductForMutation,
  variantId: string,
  field: string,
): string | number | null {
  if (field.startsWith("variants.")) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant) return null;
    if (field === "variants.price") return variant.price ?? null;
    if (field === "variants.compareAtPrice") return variant.compareAtPrice ?? null;
    if (field === "variants.sku") return variant.sku ?? null;
    if (field === "variants.barcode") return variant.barcode ?? null;
    if (field === "variants.inventoryQuantity") return variant.inventoryQuantity ?? null;
    return null;
  }
  if (field === "title") return product.title;
  if (field === "descriptionHtml") return product.descriptionHtml ?? null;
  if (field === "vendor") return product.vendor ?? null;
  if (field === "productType") return product.productType ?? null;
  if (field === "tags") return (product.tags ?? []).join(", ");
  if (field === "status") return product.status ?? null;
  return null;
}

export function valuesEqualForFeed(
  before: string | number | null | undefined,
  after: string | number | null | undefined,
): boolean {
  if (before === after) return true;
  const bn = typeof before === "number" ? before : parseFloat(String(before ?? ""));
  const an = typeof after === "number" ? after : parseFloat(String(after ?? ""));
  if (!Number.isNaN(bn) && !Number.isNaN(an) && Math.abs(bn - an) < 0.0001) return true;
  return String(before ?? "").trim() === String(after ?? "").trim();
}

export function buildSupplierFeedDiffRows(
  mapped: Record<string, unknown>,
  product: ProductForMutation,
  variantId: string,
  mappings: Array<{ sourceColumn: string; targetField: string }>,
  rowIndex: number,
): ExtendedDiffRow[] {
  const rows: ExtendedDiffRow[] = [];
  const title = String(mapped.title ?? product.title ?? `Row ${rowIndex + 1}`);

  for (const mapping of mappings) {
    if (!mapping.targetField) continue;
    const after = getMappedFieldValue(mapped, mapping.targetField);
    if (after === null) continue;

    const field = mapping.targetField;
    const before = getProductFieldBefore(product, variantId, field);
    if (valuesEqualForFeed(before, after)) continue;

    const isVariant = field.startsWith("variants.");
    rows.push({
      resourceType: isVariant ? "variant" : "product",
      resourceId: isVariant ? variantId : product.id,
      resourceTitle: title,
      field,
      before,
      after,
      productId: product.id,
    });
  }

  return rows;
}
