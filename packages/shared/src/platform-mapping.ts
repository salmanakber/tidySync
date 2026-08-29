import type { FieldMapping, MutationPlan, PlatformKey } from "./index";
import { normalizeHeader } from "./index";

type MappingRecord = Record<string, string>;

export function detectPlatformFromHeaders(headers: string[]): PlatformKey | null {
  const normalized = headers.map(normalizeHeader);

  const wooSignals = ["regular price", "stock", "short description"];
  const bcSignals = ["product name", "current stock", "sale price"];

  const wooScore = wooSignals.filter((s) => normalized.includes(s)).length;
  const bcScore = bcSignals.filter((s) => normalized.includes(s)).length;

  if (wooScore >= 2) return "woocommerce";
  if (bcScore >= 2) return "bigcommerce";
  return null;
}

export function buildFieldMappings(
  headers: string[],
  profileMappings: MappingRecord,
): FieldMapping[] {
  const result: FieldMapping[] = [];
  const profileByNormalized = new Map<string, string>();

  for (const [source, target] of Object.entries(profileMappings)) {
    profileByNormalized.set(normalizeHeader(source), target);
  }

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const target = profileByNormalized.get(normalized);
    if (target) {
      result.push({ sourceColumn: header, targetField: target });
    } else {
      result.push({ sourceColumn: header, targetField: "" });
    }
  }

  return result;
}

export function applyMappingsToRow(
  row: Record<string, string>,
  mappings: FieldMapping[],
): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const mapping of mappings) {
    if (!mapping.targetField) continue;
    const value = row[mapping.sourceColumn];
    if (value === undefined || value === "") continue;

    if (mapping.targetField === "tags") {
      output.tags = value.split(",").map((t) => t.trim()).filter(Boolean);
    } else if (mapping.targetField === "images") {
      output.images = value.split(",").map((u) => u.trim()).filter(Boolean);
    } else if (mapping.targetField.startsWith("variants.")) {
      const variantField = mapping.targetField.replace("variants.", "");
      if (!output.variants) output.variants = {};
      const variants = output.variants as Record<string, unknown>;
      if (variantField === "price" || variantField === "compareAtPrice") {
        variants[variantField] = parseFloat(value) || 0;
      } else if (variantField === "inventoryQuantity" || variantField === "weight") {
        variants[variantField] = parseFloat(value) || 0;
      } else {
        variants[variantField] = value;
      }
    } else {
      output[mapping.targetField] = value;
    }
  }

  return output;
}

export function parseNlBulkEdit(prompt: string): MutationPlan {
  const lower = prompt.toLowerCase();
  const steps: MutationPlan["steps"] = [];

  const percentMatch = lower.match(/(?:by|increase|decrease)\s+(\d+(?:\.\d+)?)\s*%/);
  const percent = percentMatch ? parseFloat(percentMatch[1]) : null;
  const isIncrease = lower.includes("increase") || lower.includes("raise");
  const isDecrease = lower.includes("decrease") || lower.includes("reduce") || lower.includes("lower");

  let field = "variants.price";
  if (lower.includes("inventory") || lower.includes("stock")) {
    field = "variants.inventoryQuantity";
  }

  const collectionMatch = prompt.match(/(?:collection|tag)\s+["']?([^"']+)["']?/i);
  const filter: Record<string, unknown> = {};
  if (collectionMatch) {
    if (lower.includes("collection")) {
      filter.collection = collectionMatch[1].trim();
    } else {
      filter.tag = collectionMatch[1].trim();
    }
  }

  if (percent !== null && (isIncrease || isDecrease)) {
    const multiplier = isIncrease ? 1 + percent / 100 : 1 - percent / 100;
    steps.push({
      action: "multiply",
      field,
      value: multiplier,
      filter,
      description: `${isIncrease ? "Increase" : "Decrease"} ${field} by ${percent}%`,
    });
  } else if (lower.includes("set") || lower.includes("update")) {
    const valueMatch = prompt.match(/to\s+["']?([^"']+)["']?/i);
    steps.push({
      action: "set",
      field,
      value: valueMatch?.[1]?.trim() ?? "",
      filter,
      description: `Set ${field} based on: "${prompt}"`,
    });
  } else {
    steps.push({
      action: "custom",
      field,
      filter,
      description: `Apply bulk change: "${prompt}"`,
    });
  }

  return { steps, estimatedAffectedCount: undefined };
}

export function detectAnomalies(
  rows: Array<{ field: string; before: unknown; after: unknown }>,
): Array<{ severity: "low" | "medium" | "high"; message: string; affectedCount: number }> {
  const anomalies: Array<{ severity: "low" | "medium" | "high"; message: string; affectedCount: number }> = [];
  let largePriceChanges = 0;

  for (const row of rows) {
    if (row.field.includes("price") && typeof row.before === "number" && typeof row.after === "number") {
      if (row.before > 0) {
        const pctChange = Math.abs((row.after - row.before) / row.before) * 100;
        if (pctChange >= 50) largePriceChanges++;
      }
    }
  }

  if (largePriceChanges > 0) {
    anomalies.push({
      severity: largePriceChanges > 10 ? "high" : "medium",
      message: `${largePriceChanges} price change(s) are 50% or more`,
      affectedCount: largePriceChanges,
    });
  }

  return anomalies;
}

export function buildImpactSummary(
  totalChanges: number,
  rows: Array<{ field: string; before: unknown; after: unknown; resourceType: string }>,
): string {
  const productCount = new Set(rows.map((r) => r.resourceType + ":" + (rows.find((x) => x === r) ? "" : ""))).size;
  const uniqueResources = new Set(rows.map((r) => `${r.resourceType}`)).size;
  const priceRows = rows.filter((r) => r.field.includes("price") && typeof r.before === "number" && typeof r.after === "number");

  let priceSummary = "";
  if (priceRows.length > 0) {
    const avgBefore = priceRows.reduce((s, r) => s + (r.before as number), 0) / priceRows.length;
    const avgAfter = priceRows.reduce((s, r) => s + (r.after as number), 0) / priceRows.length;
    const pct = avgBefore > 0 ? ((avgAfter - avgBefore) / avgBefore) * 100 : 0;
    priceSummary = `, average price change of ${pct.toFixed(1)}%`;
  }

  return `This will update ${totalChanges} field change(s) across products${priceSummary}.`;
}
