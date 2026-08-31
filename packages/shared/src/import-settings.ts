export interface ImportFieldRequirement {
  field: string;
  label: string;
  hint?: string;
  allowDefault?: boolean;
}

export interface ImportDefaults {
  title?: string;
  price?: string;
  vendor?: string;
  status?: string;
  skuPrefix?: string;
}

export interface ImportAiPolish {
  descriptions?: boolean;
  titles?: boolean;
  brandVoice?: string;
}

export interface ImportMutationPlan {
  mappings: Array<{ sourceColumn: string; targetField: string }>;
  defaults?: ImportDefaults;
  aiPolish?: ImportAiPolish | null;
  conditions?: import("./import-conditions").ImportCondition[];
}

export {
  applyImportConditions,
  IMPORT_CONDITION_PRESETS,
  type ImportCondition,
  type ImportConditionAction,
  type ImportConditionOperator,
} from "./import-conditions";

export const IMPORT_REQUIRED_BY_RESOURCE: Record<string, ImportFieldRequirement[]> = {
  products: [
    { field: "title", label: "Product title", hint: "Map a column or set a default pattern" },
    {
      field: "variants.price",
      label: "Price",
      hint: "Required for sellable products",
      allowDefault: true,
    },
  ],
  collections: [{ field: "title", label: "Collection title" }],
  customers: [{ field: "email", label: "Customer email" }],
  metafields: [
    { field: "ownerId", label: "Owner ID" },
    { field: "namespace", label: "Namespace" },
    { field: "key", label: "Key" },
    { field: "value", label: "Value" },
  ],
  discounts: [
    { field: "title", label: "Discount title" },
    { field: "code", label: "Discount code" },
  ],
};

export function isFieldMapped(
  mappings: Array<{ targetField: string }>,
  field: string,
): boolean {
  return mappings.some((m) => m.targetField === field);
}

export function validateImportMappings(
  resourceType: string,
  mappings: Array<{ sourceColumn: string; targetField: string }>,
  defaults?: ImportDefaults,
): { ok: boolean; missing: ImportFieldRequirement[] } {
  const required = IMPORT_REQUIRED_BY_RESOURCE[resourceType] ?? IMPORT_REQUIRED_BY_RESOURCE.products;
  const missing: ImportFieldRequirement[] = [];

  for (const req of required) {
    if (isFieldMapped(mappings, req.field)) continue;
    if (req.allowDefault && req.field === "variants.price" && defaults?.price?.trim()) continue;
    if (req.field === "title" && defaults?.title?.trim()) continue;
    missing.push(req);
  }

  return { ok: missing.length === 0, missing };
}

export function applyImportDefaults(
  mapped: Record<string, unknown>,
  defaults?: ImportDefaults,
  rowIndex?: number,
): Record<string, unknown> {
  const out = { ...mapped };

  if (!out.title && defaults?.title) {
    out.title = defaults.title.replace("{n}", String((rowIndex ?? 0) + 1));
  }

  const variants = (out.variants as Record<string, unknown> | undefined) ?? {};
  if (!variants.price && defaults?.price) {
    variants.price = parseFloat(defaults.price) || 0;
  }
  if (!variants.sku && defaults?.skuPrefix) {
    variants.sku = `${defaults.skuPrefix}-${(rowIndex ?? 0) + 1}`;
  }
  if (Object.keys(variants).length > 0) {
    out.variants = variants;
  }

  if (!out.vendor && defaults?.vendor) out.vendor = defaults.vendor;
  if (!out.status && defaults?.status) out.status = defaults.status;

  return out;
}
