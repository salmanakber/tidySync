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

export const IMPORT_CONDITION_PRESETS: Array<{
  label: string;
  condition: Omit<ImportCondition, "id">;
}> = [
  {
    label: "Brand Nike → 10% off price",
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
    label: "Brand contains Sale → add tag",
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
    label: "Price over $100 → +15% compare-at",
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
