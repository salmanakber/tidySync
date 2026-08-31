import type { DiffRow, MutationPlan, MutationPlanStep } from "./index";

export interface ProductForMutation {
  id: string;
  title: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  tags: string[];
  status?: string;
  variants: Array<{
    id: string;
    sku?: string;
    price?: string | number;
    compareAtPrice?: string | number | null;
    inventoryQuantity?: number;
    weight?: number;
    barcode?: string;
  }>;
}

export interface ExtendedDiffRow extends DiffRow {
  productId?: string;
}

function coerceNumber(value: unknown): number {
  if (typeof value === "number") return value;
  return parseFloat(String(value ?? 0)) || 0;
}

export function productMatchesFilter(
  product: ProductForMutation,
  filter?: Record<string, unknown>,
): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;

  const tag = filter.tag as string | undefined;
  if (tag) {
    const tagLower = tag.toLowerCase();
    const tags = product.tags ?? [];
    if (!tags.some((t) => t.toLowerCase().includes(tagLower))) return false;
  }

  const collection = filter.collection as string | undefined;
  if (collection) {
    const needle = collection.toLowerCase();
    const inTitle = product.title.toLowerCase().includes(needle);
    const inTags = (product.tags ?? []).some((t) => t.toLowerCase().includes(needle));
    if (!inTitle && !inTags) return false;
  }

  const titleContains = filter.titleContains as string | undefined;
  if (titleContains && !product.title.toLowerCase().includes(titleContains.toLowerCase())) {
    return false;
  }

  const skuContains = filter.skuContains as string | undefined;
  if (skuContains) {
    const needle = skuContains.toLowerCase();
    const hasSku = product.variants.some((v) => (v.sku ?? "").toLowerCase().includes(needle));
    if (!hasSku) return false;
  }

  return true;
}

export function computeAfterValue(
  before: string | number | null | undefined,
  step: MutationPlanStep,
  context?: { variantPrice?: string | number },
): string | number | null {
  const field = step.field;
  let after: string | number | null = before ?? null;

  if (step.action === "multiply") {
    const num = coerceNumber(before);
    const multiplier = coerceNumber(step.value);
    if (field.includes("price")) {
      after = (num * multiplier).toFixed(2);
    } else if (field.includes("inventory") || field.includes("weight")) {
      after = Math.round(num * multiplier);
    } else {
      after = num * multiplier;
    }
  } else if (step.action === "add") {
    const num = coerceNumber(before);
    after = num + coerceNumber(step.value);
  } else if (step.action === "set") {
    after = step.value as string | number;
  } else if (step.action === "custom") {
    if (field === "variants.compareAtPrice" && context?.variantPrice != null) {
      const price = coerceNumber(context.variantPrice);
      if (step.description?.toLowerCase().includes("%")) {
        const pctMatch = step.description.match(/(\d+(?:\.\d+)?)\s*%/);
        const pct = pctMatch ? parseFloat(pctMatch[1]) : 20;
        after = (price * (1 + pct / 100)).toFixed(2);
      } else {
        after = (price * 1.2).toFixed(2);
      }
    }
  }

  return after;
}

function productFieldValue(product: ProductForMutation, field: string): string | number | null {
  if (field === "tags") return (product.tags ?? []).join(", ");
  const value = product[field as keyof ProductForMutation];
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
}

export function buildDiffFromProducts(
  products: ProductForMutation[],
  plan: MutationPlan,
): { rows: ExtendedDiffRow[]; totalChanges: number } {
  const rows: ExtendedDiffRow[] = [];

  for (const product of products) {
    for (const step of plan.steps) {
      if (!productMatchesFilter(product, step.filter)) continue;

      if (step.action === "ai_improve_seo") {
        rows.push({
          resourceType: "product",
          resourceId: product.id,
          productId: product.id,
          resourceTitle: product.title,
          field: "seo",
          before: (product.descriptionHtml ?? "").slice(0, 120) || "—",
          after: "AI: optimized SEO title, meta description, and product description",
        });
        continue;
      }

      if (step.action === "ai_rewrite_description") {
        rows.push({
          resourceType: "product",
          resourceId: product.id,
          productId: product.id,
          resourceTitle: product.title,
          field: "descriptionHtml",
          before: (product.descriptionHtml ?? "").slice(0, 120) || "—",
          after: "AI: rewritten product description",
        });
        continue;
      }

      if (step.field.startsWith("variants.")) {
        const variantField = step.field.replace("variants.", "");
        for (const variant of product.variants) {
          const before = variant[variantField as keyof typeof variant] as
            | string
            | number
            | null
            | undefined;
          const after = computeAfterValue(before, step, { variantPrice: variant.price });
          if (String(before ?? "") === String(after ?? "")) continue;

          rows.push({
            resourceType: "variant",
            resourceId: variant.id,
            productId: product.id,
            resourceTitle: product.title,
            field: step.field,
            before: before ?? null,
            after,
          });
        }
      } else {
        const before = productFieldValue(product, step.field);
        let after = computeAfterValue(before, step);

        if (step.field === "tags") {
          const existing = product.tags ?? [];
          if (step.action === "add" || step.description?.toLowerCase().includes("add tag")) {
            const tagValue = String(step.value ?? step.filter?.tag ?? "").trim();
            if (tagValue && !existing.some((t) => t.toLowerCase() === tagValue.toLowerCase())) {
              after = [...existing, tagValue].join(", ");
            } else {
              after = existing.join(", ");
            }
          } else if (step.action === "set") {
            after = String(step.value ?? "");
          }
        }

        if (String(before ?? "") === String(after ?? "")) continue;

        rows.push({
          resourceType: "product",
          resourceId: product.id,
          productId: product.id,
          resourceTitle: product.title,
          field: step.field,
          before,
          after,
        });
      }
    }
  }

  return { rows, totalChanges: rows.length };
}
