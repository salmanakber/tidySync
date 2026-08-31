import type { MutationPlan, FieldMapping } from "@tidysync/shared";
import { parseNlBulkEdit } from "@tidysync/shared";
import { chatCompletion, listConfiguredAiProviders } from "./providers";
import {
  SHOPIFY_DESCRIPTION_HTML_INSTRUCTIONS,
  buildRichDescriptionFallback,
  finalizeShopifyDescriptionHtml,
  stripHtml,
} from "./description-html";

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
  const descPlain = stripHtml(String(product.descriptionHtml ?? ""));

  const fallback = {
    seoTitle: title.slice(0, 60),
    seoDescription:
      descPlain.slice(0, 155) || `Shop ${title} — premium quality, fast delivery, and trusted service.`,
    descriptionHtml: buildRichDescriptionFallback(title, descPlain),
    modelUsed: "rule-based",
  };

  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `You are an expert Shopify copywriter and SEO specialist.

Return JSON only (no markdown fences):
{
  "seoTitle": "40-60 characters, compelling, includes primary keyword",
  "seoDescription": "120-160 characters meta description with CTA",
  "descriptionHtml": "full rich HTML product description"
}

${SHOPIFY_DESCRIPTION_HTML_INSTRUCTIONS}`,
      },
      { role: "user", content: JSON.stringify({ product, metrics }) },
    ],
    { jsonMode: true, maxTokens: 2500, temperature: 0.35 },
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
    const descriptionHtml = finalizeShopifyDescriptionHtml(
      parsed.descriptionHtml ?? "",
      title,
      { minWords: 200, plainFallback: descPlain },
    );

    return {
      seoTitle: (parsed.seoTitle ?? fallback.seoTitle).slice(0, 70),
      seoDescription: (parsed.seoDescription ?? fallback.seoDescription).slice(0, 320),
      descriptionHtml,
      modelUsed: result.modelUsed,
    };
  } catch {
    return fallback;
  }
}

const REWRITE_CHUNK_SIZE = 3;

async function rewriteProductContentChunk(
  products: Array<{ title: string; description?: string }>,
  brandVoice: string,
): Promise<Array<{ title: string; description: string }>> {
  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `You rewrite Shopify product copy in this brand voice: ${brandVoice}.

Return JSON only: { "items": [{ "title": "...", "descriptionHtml": "..." }] }
- Same number of items as input, same order.
- title: polished product title (max 70 chars), optional light improvement only.
- descriptionHtml: full Shopify rich HTML description (NOT plain text, NOT markdown).

${SHOPIFY_DESCRIPTION_HTML_INSTRUCTIONS}`,
      },
      { role: "user", content: JSON.stringify({ products }) },
    ],
    { jsonMode: true, maxTokens: 4096, temperature: 0.4 },
  );

  if (result.provider === "rule-based" || !result.text) {
    return products.map((p) => ({
      title: p.title,
      description: finalizeShopifyDescriptionHtml(p.description ?? "", p.title, {
        minWords: 180,
        plainFallback: stripHtml(p.description ?? ""),
      }),
    }));
  }

  try {
    const parsed = JSON.parse(result.text) as {
      items?: Array<{ title?: string; description?: string; descriptionHtml?: string }>;
    };
    const items = parsed.items ?? [];

    return products.map((p, i) => {
      const item = items[i];
      const rawHtml = item?.descriptionHtml ?? item?.description ?? p.description ?? "";
      return {
        title: (item?.title ?? p.title).slice(0, 120),
        description: finalizeShopifyDescriptionHtml(rawHtml, p.title, {
          minWords: 180,
          plainFallback: stripHtml(p.description ?? ""),
        }),
      };
    });
  } catch {
    return products.map((p) => ({
      title: p.title,
      description: finalizeShopifyDescriptionHtml(p.description ?? "", p.title, {
        minWords: 180,
        plainFallback: stripHtml(p.description ?? ""),
      }),
    }));
  }
}

/** Rewrite titles and descriptionHtml for products (chunked for full-length rich HTML). */
export async function rewriteProductContent(
  products: Array<{ title: string; description?: string }>,
  brandVoice: string,
): Promise<Array<{ title: string; description: string }>> {
  if (products.length === 0) return [];

  const results: Array<{ title: string; description: string }> = [];

  for (let i = 0; i < products.length; i += REWRITE_CHUNK_SIZE) {
    const chunk = products.slice(i, i + REWRITE_CHUNK_SIZE);
    const rewritten = await rewriteProductContentChunk(chunk, brandVoice);
    results.push(...rewritten);
  }

  return results;
}
