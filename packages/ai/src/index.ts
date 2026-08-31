import type { MutationPlan, FieldMapping } from "@tidysync/shared";
import { parseNlBulkEdit } from "@tidysync/shared";
import { chatCompletion, listConfiguredAiProviders } from "./providers";

export {
  parseAgentIntent,
  detectAgentIntentRuleBased,
  buildSeoImprovementPlan,
  parseNlBulkEditWithAiEnhanced,
  type AgentIntent,
  type AgentIntentResult,
} from "./agent";

export { listConfiguredAiProviders } from "./providers";

export async function parseNlBulkEditWithAi(prompt: string): Promise<{
  plan: MutationPlan;
  modelUsed: string;
  isSeoAgent?: boolean;
}> {
  const { parseNlBulkEditWithAiEnhanced } = await import("./agent");
  return parseNlBulkEditWithAiEnhanced(prompt);
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

export async function generateProductSeoInsight(
  product: Record<string, unknown>,
  metrics: Record<string, unknown>,
): Promise<string> {
  const fallback =
    "Review title length, meta description, and description depth. Add alt text to images and expand thin content.";
  const result = await chatCompletion([
    {
      role: "system",
      content:
        "You are a senior Shopify SEO strategist. Given product data and computed SEO metrics, write a concise expert briefing: 1) overall verdict, 2) top 3 strengths, 3) top 3 prioritized fixes, 4) one quick win for today. Use short paragraphs and bullet points. Be specific with numbers from the data. Tone: premium, clear, actionable.",
    },
    { role: "user", content: JSON.stringify({ product, metrics }) },
  ]);

  if (result.provider === "rule-based" || !result.text.trim()) {
    return fallback;
  }
  return result.text.trim();
}

export async function generateProductSeoImprovements(
  product: Record<string, unknown>,
  metrics: Record<string, unknown>,
): Promise<{
  seoTitle: string;
  seoDescription: string;
  descriptionHtml: string;
  modelUsed: string;
}> {
  const title = String(product.title ?? "Product");
  const desc = String(product.descriptionHtml ?? "").replace(/<[^>]+>/g, " ").trim();
  const fallback = {
    seoTitle: title.slice(0, 60),
    seoDescription: desc.slice(0, 155) || `Shop ${title} — premium quality and fast delivery.`,
    descriptionHtml:
      desc.length >= 120
        ? `<p>${desc}</p>`
        : `<p>${title} — crafted for quality and discoverability. Add rich details about materials, benefits, and use cases.</p>`,
    modelUsed: "rule-based",
  };

  const result = await chatCompletion(
    [
      {
        role: "system",
        content:
          "You optimize Shopify product SEO. Return JSON only: { seoTitle (40-60 chars), seoDescription (120-160 chars), descriptionHtml (HTML, 150+ words, keyword-rich, scannable headings/bullets) }. Be truthful to the product. No markdown fences.",
      },
      { role: "user", content: JSON.stringify({ product, metrics }) },
    ],
    { jsonMode: true },
  );

  if (result.provider === "rule-based" || !result.text) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(result.text) as {
      seoTitle?: string;
      seoDescription?: string;
      descriptionHtml?: string;
    };
    return {
      seoTitle: (parsed.seoTitle ?? fallback.seoTitle).slice(0, 70),
      seoDescription: (parsed.seoDescription ?? fallback.seoDescription).slice(0, 320),
      descriptionHtml: parsed.descriptionHtml ?? fallback.descriptionHtml,
      modelUsed: result.modelUsed,
    };
  } catch {
    return fallback;
  }
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
