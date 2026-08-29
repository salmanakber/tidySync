import type { MutationPlan, FieldMapping } from "@tidysync/shared";
import { parseNlBulkEdit } from "@tidysync/shared";
import { chatCompletion, listConfiguredAiProviders } from "./providers";

export { listConfiguredAiProviders } from "./providers";

export async function parseNlBulkEditWithAi(prompt: string): Promise<{
  plan: MutationPlan;
  modelUsed: string;
}> {
  const result = await chatCompletion(
    [
      {
        role: "system",
        content:
          "You convert merchant natural-language bulk edit requests into a JSON mutation plan for Shopify. Return { steps: [{ action, field, value?, filter?, description }], estimatedAffectedCount? }. Fields use dot notation like variants.price, title, tags. Actions: set, multiply, add, custom.",
      },
      { role: "user", content: prompt },
    ],
    { jsonMode: true },
  );

  if (result.provider === "rule-based" || !result.text) {
    return { plan: parseNlBulkEdit(prompt), modelUsed: "rule-based" };
  }

  try {
    const parsed = JSON.parse(result.text) as MutationPlan;
    if (!parsed.steps?.length) {
      return { plan: parseNlBulkEdit(prompt), modelUsed: "rule-based-fallback" };
    }
    return { plan: parsed, modelUsed: result.modelUsed };
  } catch {
    return { plan: parseNlBulkEdit(prompt), modelUsed: "rule-based-fallback" };
  }
}

export async function inferColumnMappingsWithAi(
  headers: string[],
  targetFields: string[],
): Promise<{ mappings: FieldMapping[]; modelUsed: string }> {
  const base: FieldMapping[] = headers.map((h) => ({
    sourceColumn: h,
    targetField: "",
  }));

  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `Map CSV headers to Shopify fields. Allowed targets: ${targetFields.join(", ")}. Return JSON { mappings: [{ sourceColumn, targetField }] }`,
      },
      { role: "user", content: JSON.stringify(headers) },
    ],
    { jsonMode: true },
  );

  if (result.provider === "rule-based" || !result.text) {
    return { mappings: base, modelUsed: "none" };
  }

  try {
    const parsed = JSON.parse(result.text) as { mappings?: FieldMapping[] };
    return { mappings: parsed.mappings ?? base, modelUsed: result.modelUsed };
  } catch {
    return { mappings: base, modelUsed: "none" };
  }
}

export async function generateImpactSummary(
  summaryData: Record<string, unknown>,
): Promise<string> {
  const fallback = String(summaryData.fallback ?? "Review the diff preview before committing.");
  const result = await chatCompletion([
    {
      role: "system",
      content:
        "Write a 1-2 sentence plain-English impact summary for a merchant about to run a bulk Shopify change. Be specific with numbers.",
    },
    { role: "user", content: JSON.stringify(summaryData) },
  ]);

  if (result.provider === "rule-based" || !result.text.trim()) {
    return fallback;
  }
  return result.text.trim();
}

export async function rewriteProductContent(
  products: Array<{ title: string; description?: string }>,
  brandVoice: string,
): Promise<Array<{ title: string; description: string }>> {
  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `Rewrite product titles/descriptions in brand voice: ${brandVoice}. Return JSON { items: [{ title, description }] } same order.`,
      },
      { role: "user", content: JSON.stringify(products) },
    ],
    { jsonMode: true },
  );

  if (result.provider === "rule-based" || !result.text) {
    return products.map((p) => ({
      title: p.title,
      description: p.description ?? "",
    }));
  }

  try {
    const parsed = JSON.parse(result.text) as {
      items?: Array<{ title: string; description: string }>;
    };
    return parsed.items ?? products.map((p) => ({ title: p.title, description: p.description ?? "" }));
  } catch {
    return products.map((p) => ({ title: p.title, description: p.description ?? "" }));
  }
}
