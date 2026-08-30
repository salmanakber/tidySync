import type { FieldMapping, MutationPlan } from "./index";
import { normalizeHeader } from "./index";
import { PLATFORM_CATALOG, getPlatform, type PlatformKey } from "./platforms";

type MappingRecord = Record<string, string>;

export interface MappingSuggestion extends FieldMapping {
  suggested: boolean;
  confidence: number;
  matchReason?: string;
}

const COMMON_ALIASES: Record<string, string> = {
  title: "title",
  name: "title",
  product: "title",
  productname: "title",
  product_name: "title",
  itemname: "title",
  item_name: "title",
  description: "descriptionHtml",
  body: "descriptionHtml",
  bodyhtml: "descriptionHtml",
  "body (html)": "descriptionHtml",
  shortdescription: "descriptionHtml",
  vendor: "vendor",
  brand: "vendor",
  type: "productType",
  producttype: "productType",
  category: "productType",
  categories: "productType",
  tags: "tags",
  sku: "variants.sku",
  "variant sku": "variants.sku",
  sellersku: "variants.sku",
  "seller-sku": "variants.sku",
  price: "variants.price",
  "regular price": "variants.price",
  "variant price": "variants.price",
  "standard-price": "variants.price",
  startprice: "variants.price",
  saleprice: "variants.compareAtPrice",
  "sale price": "variants.compareAtPrice",
  compareatprice: "variants.compareAtPrice",
  "compare at price": "variants.compareAtPrice",
  "variant compare at price": "variants.compareAtPrice",
  stock: "variants.inventoryQuantity",
  quantity: "variants.inventoryQuantity",
  qty: "variants.inventoryQuantity",
  inventory: "variants.inventoryQuantity",
  "current stock": "variants.inventoryQuantity",
  "variant inventory qty": "variants.inventoryQuantity",
  weight: "variants.weight",
  images: "images",
  image: "images",
  "image src": "images",
  "product image url": "images",
  image_link: "images",
  picurl: "images",
};

function stripNoise(s: string): string {
  return normalizeHeader(s)
    .replace(/[*#:]/g, "")
    .replace(/\bg:/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function detectPlatformFromHeaders(headers: string[]): PlatformKey | null {
  const normalized = headers.map((h) => normalizeHeader(h));
  const stripped = headers.map(stripNoise);

  let best: { key: string; score: number } | null = null;

  for (const platform of PLATFORM_CATALOG) {
    if (platform.key === "csv" || platform.detectSignals.length === 0) continue;
    let score = 0;
    for (const signal of platform.detectSignals) {
      const n = normalizeHeader(signal);
      const s = stripNoise(signal);
      if (normalized.includes(n) || stripped.includes(s)) score += 2;
      else if (normalized.some((h) => h.includes(n) || n.includes(h))) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { key: platform.key, score };
    }
  }

  // Require a minimum signal so we don't false-positive on sparse sheets
  if (best && best.score >= 2) return best.key;
  return null;
}

export function detectPlatformWithConfidence(headers: string[]): {
  platformKey: string | null;
  confidence: number;
  scores: Array<{ key: string; name: string; score: number }>;
} {
  const normalized = headers.map((h) => normalizeHeader(h));
  const stripped = headers.map(stripNoise);
  const scores: Array<{ key: string; name: string; score: number }> = [];

  for (const platform of PLATFORM_CATALOG) {
    if (platform.key === "csv" || platform.detectSignals.length === 0) continue;
    let score = 0;
    for (const signal of platform.detectSignals) {
      const n = normalizeHeader(signal);
      const s = stripNoise(signal);
      if (normalized.includes(n) || stripped.includes(s)) score += 2;
      else if (normalized.some((h) => h.includes(n) || n.includes(h))) score += 1;
    }
    if (score > 0) scores.push({ key: platform.key, name: platform.name, score });
  }

  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  if (!top || top.score < 2) {
    return { platformKey: null, confidence: 0, scores };
  }
  const maxPossible = Math.max(
    ...PLATFORM_CATALOG.filter((p) => p.key === top.key).map((p) => p.detectSignals.length * 2),
    1,
  );
  const confidence = Math.min(1, top.score / Math.max(4, maxPossible * 0.5));
  return { platformKey: top.key, confidence, scores: scores.slice(0, 5) };
}

function fuzzyTargetForHeader(header: string): { target: string; confidence: number; reason: string } | null {
  const n = normalizeHeader(header);
  const s = stripNoise(header).replace(/\s+/g, "");

  if (COMMON_ALIASES[n]) {
    return { target: COMMON_ALIASES[n], confidence: 0.95, reason: "exact alias" };
  }
  if (COMMON_ALIASES[s]) {
    return { target: COMMON_ALIASES[s], confidence: 0.9, reason: "normalized alias" };
  }

  for (const [alias, target] of Object.entries(COMMON_ALIASES)) {
    const a = alias.replace(/\s+/g, "");
    if (s.includes(a) || a.includes(s)) {
      if (Math.min(s.length, a.length) >= 3) {
        return { target, confidence: 0.72, reason: `fuzzy: ${alias}` };
      }
    }
  }

  return null;
}

export function buildFieldMappings(
  headers: string[],
  profileMappings: MappingRecord,
): FieldMapping[] {
  return buildFieldMappingsWithConfidence(headers, profileMappings).map(
    ({ sourceColumn, targetField, transform }) => ({
      sourceColumn,
      targetField,
      transform,
    }),
  );
}

export function buildFieldMappingsWithConfidence(
  headers: string[],
  profileMappings: MappingRecord = {},
): MappingSuggestion[] {
  const result: MappingSuggestion[] = [];
  const profileByNormalized = new Map<string, string>();
  const usedTargets = new Set<string>();

  for (const [source, target] of Object.entries(profileMappings)) {
    profileByNormalized.set(normalizeHeader(source), target);
    profileByNormalized.set(stripNoise(source), target);
  }

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const stripped = stripNoise(header);
    const fromProfile =
      profileByNormalized.get(normalized) ?? profileByNormalized.get(stripped);

    if (fromProfile && !usedTargets.has(fromProfile)) {
      usedTargets.add(fromProfile);
      result.push({
        sourceColumn: header,
        targetField: fromProfile,
        suggested: true,
        confidence: 0.98,
        matchReason: "platform profile",
      });
      continue;
    }

    const fuzzy = fuzzyTargetForHeader(header);
    if (fuzzy && !usedTargets.has(fuzzy.target)) {
      usedTargets.add(fuzzy.target);
      result.push({
        sourceColumn: header,
        targetField: fuzzy.target,
        suggested: true,
        confidence: fuzzy.confidence,
        matchReason: fuzzy.reason,
      });
      continue;
    }

    result.push({
      sourceColumn: header,
      targetField: "",
      suggested: false,
      confidence: 0,
      matchReason: "unmatched",
    });
  }

  return result;
}

export function defaultMappingsForPlatform(platformKey: string): MappingRecord {
  const platform = getPlatform(platformKey);
  return platform?.productMappings ?? getPlatform("csv")?.productMappings ?? {};
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

  const percentMatch = lower.match(/(?:by|increase|decrease|raise|lower)\s+(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s+above/);
  const percent = percentMatch
    ? parseFloat(percentMatch[1] ?? percentMatch[2] ?? "0")
    : null;
  const isIncrease = lower.includes("increase") || lower.includes("raise");
  const isDecrease = lower.includes("decrease") || lower.includes("reduce") || lower.includes("lower");

  let field = "variants.price";
  if (lower.includes("compare-at") || lower.includes("compare at")) {
    field = "variants.compareAtPrice";
  } else if (lower.includes("inventory") || lower.includes("stock")) {
    field = "variants.inventoryQuantity";
  } else if (lower.includes("tag")) {
    field = "tags";
  } else if (lower.includes("description") || lower.includes("content")) {
    field = "descriptionHtml";
  } else if (lower.includes("title")) {
    field = "title";
  }

  const collectionMatch = prompt.match(/(?:collection|tagged?)\s+["']?([^"']+)["']?/i);
  const filter: Record<string, unknown> = {};
  if (collectionMatch) {
    if (lower.includes("collection")) {
      filter.collection = collectionMatch[1].trim();
    } else {
      filter.tag = collectionMatch[1].trim();
    }
  }

  const skuMatch = prompt.match(/sku[s]?\s+(?:containing|with|like)\s+["']?([^"']+)["']?/i);
  if (skuMatch) filter.skuContains = skuMatch[1].trim();

  const addTagMatch = prompt.match(/add\s+tag\s+['"]?([^'"]+)['"]?/i);
  if (addTagMatch) {
    steps.push({
      action: "add",
      field: "tags",
      value: addTagMatch[1].trim(),
      filter,
      description: `Add tag "${addTagMatch[1].trim()}"`,
    });
    return { steps, estimatedAffectedCount: undefined };
  }

  if (field === "variants.compareAtPrice" && (lower.includes("above") || lower.includes("%"))) {
    steps.push({
      action: "custom",
      field,
      filter,
      description: prompt,
    });
    return { steps, estimatedAffectedCount: undefined };
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
  const priceRows = rows.filter(
    (r) => r.field.includes("price") && typeof r.before === "number" && typeof r.after === "number",
  );

  let priceSummary = "";
  if (priceRows.length > 0) {
    const avgBefore = priceRows.reduce((s, r) => s + (r.before as number), 0) / priceRows.length;
    const avgAfter = priceRows.reduce((s, r) => s + (r.after as number), 0) / priceRows.length;
    const pct = avgBefore > 0 ? ((avgAfter - avgBefore) / avgBefore) * 100 : 0;
    priceSummary = `, average price change of ${pct.toFixed(1)}%`;
  }

  return `This will update ${totalChanges} field change(s) across ${rows[0]?.resourceType ?? "resources"}${priceSummary}.`;
}

// Re-export catalog helpers used by API/UI
export { PLATFORM_CATALOG, getPlatform, platformsForImport, platformsForExport } from "./platforms";
