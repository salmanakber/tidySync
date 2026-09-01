export type ImportConditionOperator = "eq" | "contains" | "gt" | "lt" | "gte" | "lte";

export type ImportConditionAction =
  | "multiply_price"
  | "add_price"
  | "set_price"
  | "set_compare_at_percent"
  | "set_field"
  | "add_tag"
  | "skip_row";

export interface ImportCondition {
  id: string;
  /** Mapped field or source column to evaluate */
  field: string;
  operator: ImportConditionOperator;
  value: string;
  action: ImportConditionAction;
  /** For set_field: target field; for price actions optional override */
  actionField?: string;
  actionValue?: string | number;
  label?: string;
}

function coerceNum(v: unknown): number {
  if (typeof v === "number") return v;
  return parseFloat(String(v ?? 0)) || 0;
}

function readFieldValue(mapped: Record<string, unknown>, field: string): string {
  if (field.startsWith("variants.")) {
    const key = field.replace("variants.", "");
    const variants = mapped.variants as Record<string, unknown> | undefined;
    return String(variants?.[key] ?? "");
  }
  return String(mapped[field] ?? "");
}

function matchesCondition(mapped: Record<string, unknown>, cond: ImportCondition): boolean {
  const actual = readFieldValue(mapped, cond.field);
  const expected = cond.value;
  const actualLower = actual.toLowerCase();
  const expectedLower = expected.toLowerCase();

  switch (cond.operator) {
    case "eq":
      return actualLower === expectedLower;
    case "contains":
      return actualLower.includes(expectedLower);
    case "gt":
      return coerceNum(actual) > coerceNum(expected);
    case "lt":
      return coerceNum(actual) < coerceNum(expected);
    case "gte":
      return coerceNum(actual) >= coerceNum(expected);
    case "lte":
      return coerceNum(actual) <= coerceNum(expected);
    default:
      return false;
  }
}

export function applyImportConditions(
  mapped: Record<string, unknown>,
  conditions?: ImportCondition[],
): { mapped: Record<string, unknown>; skipped: boolean; applied: string[] } {
  if (!conditions?.length) {
    return { mapped, skipped: false, applied: [] };
  }

  const out = { ...mapped };
  const variants = { ...((out.variants as Record<string, unknown>) ?? {}) };
  const applied: string[] = [];

  for (const cond of conditions) {
    if (!matchesCondition(out, cond)) continue;

    applied.push(cond.label ?? `${cond.field} ${cond.operator} ${cond.value}`);

    if (cond.action === "skip_row") {
      return { mapped: out, skipped: true, applied };
    }

    if (cond.action === "multiply_price") {
      const mult = coerceNum(cond.actionValue ?? 1);
      const price = coerceNum(variants.price);
      variants.price = (price * mult).toFixed(2);
    } else if (cond.action === "add_price") {
      const add = coerceNum(cond.actionValue ?? 0);
      variants.price = (coerceNum(variants.price) + add).toFixed(2);
    } else if (cond.action === "set_price") {
      variants.price = String(cond.actionValue ?? variants.price ?? "0");
    } else if (cond.action === "set_compare_at_percent") {
      const pct = coerceNum(cond.actionValue ?? 10);
      const price = coerceNum(variants.price);
      variants.compareAtPrice = (price * (1 + pct / 100)).toFixed(2);
    } else if (cond.action === "set_field" && cond.actionField) {
      if (cond.actionField.startsWith("variants.")) {
        const key = cond.actionField.replace("variants.", "");
        variants[key] = cond.actionValue;
      } else {
        out[cond.actionField] = cond.actionValue;
      }
    } else if (cond.action === "add_tag") {
      const tag = String(cond.actionValue ?? cond.value).trim();
      const existing = String(out.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (tag && !existing.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        out.tags = [...existing, tag].join(", ");
      }
    }
  }

  if (Object.keys(variants).length > 0) {
    out.variants = variants;
  }

  return { mapped: out, skipped: false, applied };
}

export const IMPORT_CONDITION_OPERATORS: Array<{
  label: string;
  value: ImportConditionOperator;
  numeric?: boolean;
}> = [
  { label: "equals", value: "eq" },
  { label: "contains", value: "contains" },
  { label: "is greater than", value: "gt", numeric: true },
  { label: "is less than", value: "lt", numeric: true },
  { label: "is at least", value: "gte", numeric: true },
  { label: "is at most", value: "lte", numeric: true },
];

export const IMPORT_CONDITION_ACTIONS: Array<{
  label: string;
  value: ImportConditionAction;
  needsValue?: boolean;
  valueLabel?: string;
  valuePlaceholder?: string;
  needsField?: boolean;
}> = [
  {
    label: "Multiply price by",
    value: "multiply_price",
    needsValue: true,
    valueLabel: "Multiplier",
    valuePlaceholder: "0.9 for 10% off, 1.1 for 10% increase",
  },
  {
    label: "Add to price",
    value: "add_price",
    needsValue: true,
    valueLabel: "Amount",
    valuePlaceholder: "e.g. 5 or -2",
  },
  {
    label: "Set price to",
    value: "set_price",
    needsValue: true,
    valueLabel: "Price",
    valuePlaceholder: "e.g. 29.99",
  },
  {
    label: "Set compare-at price (% above price)",
    value: "set_compare_at_percent",
    needsValue: true,
    valueLabel: "Percent",
    valuePlaceholder: "e.g. 15",
  },
  {
    label: "Set field value",
    value: "set_field",
    needsValue: true,
    needsField: true,
    valueLabel: "New value",
    valuePlaceholder: "Value to apply",
  },
  {
    label: "Add tag",
    value: "add_tag",
    needsValue: true,
    valueLabel: "Tag",
    valuePlaceholder: "e.g. promo, clearance",
  },
  { label: "Skip row (do not import)", value: "skip_row" },
];

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  descriptionHtml: "Description",
  vendor: "Vendor / brand",
  productType: "Product type",
  tags: "Tags",
  status: "Status",
  "variants.sku": "SKU",
  "variants.price": "Price",
  "variants.compareAtPrice": "Compare-at price",
  "variants.inventoryQuantity": "Inventory",
  "variants.barcode": "Barcode",
  images: "Images",
};

export function describeImportCondition(cond: ImportCondition): string {
  const fieldLabel = FIELD_LABELS[cond.field] ?? cond.field;
  const op =
    IMPORT_CONDITION_OPERATORS.find((o) => o.value === cond.operator)?.label ?? cond.operator;
  const act = IMPORT_CONDITION_ACTIONS.find((a) => a.value === cond.action);
  let actionPart = act?.label ?? cond.action;
  if (cond.action !== "skip_row" && cond.actionValue != null && cond.actionValue !== "") {
    actionPart += ` ${cond.actionValue}`;
  }
  if (cond.action === "set_field" && cond.actionField) {
    const af = FIELD_LABELS[cond.actionField] ?? cond.actionField;
    actionPart += ` on ${af}`;
  }
  return `If ${fieldLabel} ${op} “${cond.value}” → ${actionPart}`;
}

export const IMPORT_CONDITION_PRESETS: Array<{
  label: string;
  condition: Omit<ImportCondition, "id">;
}> = [
  {
    label: "Example: vendor Nike → 10% off price",
    condition: {
      field: "vendor",
      operator: "eq",
      value: "Nike",
      action: "multiply_price",
      actionValue: 0.9,
      label: "Nike 10% discount",
    },
  },
  {
    label: "Example: tags contain Sale → add tag",
    condition: {
      field: "tags",
      operator: "contains",
      value: "sale",
      action: "add_tag",
      actionValue: "promo",
      label: "Tag promo on sale items",
    },
  },
  {
    label: "Example: price over $100 → +15% compare-at",
    condition: {
      field: "variants.price",
      operator: "gt",
      value: "100",
      action: "set_compare_at_percent",
      actionValue: 15,
      label: "Premium compare-at markup",
    },
  },
];
