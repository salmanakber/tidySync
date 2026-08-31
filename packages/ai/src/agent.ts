import { chatCompletion } from "./providers";
import { parseNlBulkEdit } from "@tidysync/shared";

export type AgentIntent =
  | "FIX_STORE"
  | "IMPROVE_SEO"
  | "BULK_EDIT"
  | "CREATE_BACKUP"
  | "IMPORT_WITH_RULES"
  | "UNKNOWN";

export interface AgentIntentResult {
  intent: AgentIntent;
  productFilter?: string;
  prompt: string;
  confidence: number;
  suggestedActions: string[];
  modelUsed: string;
}

export function detectAgentIntentRuleBased(prompt: string): AgentIntentResult {
  const lower = prompt.toLowerCase();
  const productParen = prompt.match(/\(([^)]+)\)/);
  const productQuoted = prompt.match(/["']([^"']{2,60})["']/);
  const productFilter = productParen?.[1]?.trim() ?? productQuoted?.[1]?.trim();

  if (lower.includes("backup") || lower.includes("snapshot") || lower.includes("save catalog")) {
    return {
      intent: "CREATE_BACKUP",
      productFilter,
      prompt,
      confidence: 0.9,
      suggestedActions: ["Create a full product catalog backup"],
      modelUsed: "rule-based",
    };
  }

  if (
    lower.includes("fix my store") ||
    lower.includes("fix store") ||
    lower.includes("analyze store") ||
    lower.includes("store health") ||
    lower.includes("what's wrong")
  ) {
    return {
      intent: "FIX_STORE",
      prompt,
      confidence: 0.92,
      suggestedActions: [
        "Scan catalog for SEO gaps, duplicate SKUs, thin descriptions",
        "Review issues and approve fixes",
      ],
      modelUsed: "rule-based",
    };
  }

  if (
    lower.includes("improve seo") ||
    lower.includes("seo improvement") ||
    lower.includes("meta description") ||
    lower.includes("optimize seo")
  ) {
    return {
      intent: "IMPROVE_SEO",
      productFilter,
      prompt,
      confidence: 0.88,
      suggestedActions: productFilter
        ? [`Improve SEO title, meta, and description for "${productFilter}"`]
        : ["Improve SEO for matching products"],
      modelUsed: "rule-based",
    };
  }

  if (
    lower.includes("import") &&
    (lower.includes("discount") || lower.includes("condition") || lower.includes("if brand"))
  ) {
    return {
      intent: "IMPORT_WITH_RULES",
      prompt,
      confidence: 0.75,
      suggestedActions: ["Use Import tab with conditional rules on your file"],
      modelUsed: "rule-based",
    };
  }

  return {
    intent: "BULK_EDIT",
    productFilter,
    prompt,
    confidence: 0.6,
    suggestedActions: ["Generate bulk edit plan from your request"],
    modelUsed: "rule-based",
  };
}

export async function parseAgentIntent(prompt: string): Promise<AgentIntentResult> {
  const fallback = detectAgentIntentRuleBased(prompt);

  const result = await chatCompletion(
    [
      {
        role: "system",
        content:
          "Classify merchant intent for a Shopify ops agent. Return JSON only: { intent: FIX_STORE|IMPROVE_SEO|BULK_EDIT|CREATE_BACKUP|IMPORT_WITH_RULES|UNKNOWN, productFilter?: string, confidence: 0-1, suggestedActions: string[] }. productFilter is a product title fragment if they named a specific product.",
      },
      { role: "user", content: prompt },
    ],
    { jsonMode: true },
  );

  if (result.provider === "rule-based" || !result.text) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(result.text) as Partial<AgentIntentResult>;
    const intent = (parsed.intent as AgentIntent) ?? fallback.intent;
    return {
      intent,
      productFilter: parsed.productFilter ?? fallback.productFilter,
      prompt,
      confidence: parsed.confidence ?? 0.8,
      suggestedActions: parsed.suggestedActions ?? fallback.suggestedActions,
      modelUsed: result.modelUsed,
    };
  } catch {
    return fallback;
  }
}

export function buildSeoImprovementPlan(productFilter?: string) {
  const filter: Record<string, unknown> = {};
  if (productFilter) filter.titleContains = productFilter;

  return {
    steps: [
      {
        action: "ai_improve_seo",
        field: "seo",
        filter,
        description: productFilter
          ? `AI improve SEO + description for products matching "${productFilter}"`
          : "AI improve SEO + descriptions for matching products",
      },
    ],
  };
}

export function buildSeoImprovementPlanForProductIds(productIds: string[]) {
  return {
    steps: [
      {
        action: "ai_improve_seo",
        field: "seo",
        filter: { productIds },
        description: `AI improve SEO for ${productIds.length} selected product(s)`,
      },
    ],
  };
}

export function buildDescriptionRewritePlanForProductIds(
  productIds: string[],
  brandVoice = "professional, helpful, SEO-optimized",
) {
  return {
    steps: [
      {
        action: "ai_rewrite_description",
        field: "descriptionHtml",
        filter: { productIds },
        value: brandVoice,
        description: `AI rewrite descriptions for ${productIds.length} selected product(s)`,
      },
    ],
  };
}

export function enhanceNlPromptForSeo(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  if (!lower.includes("seo") && !lower.includes("meta") && !lower.includes("description")) {
    return null;
  }

  const productParen = prompt.match(/\(([^)]+)\)/);
  const productFor = prompt.match(/(?:for|of)\s+(?:the\s+)?(?:product\s+)?["']?([^"'.()]+?)["']?\s*(?:product)?$/i);
  const filter = productParen?.[1]?.trim() ?? productFor?.[1]?.trim();

  if (lower.includes("improve") || lower.includes("optimize") || lower.includes("fix")) {
    return JSON.stringify(buildSeoImprovementPlan(filter));
  }

  return null;
}

export async function parseNlBulkEditWithAiEnhanced(prompt: string): Promise<{
  plan: import("@tidysync/shared").MutationPlan;
  modelUsed: string;
  isSeoAgent?: boolean;
}> {
  const seoPlanJson = enhanceNlPromptForSeo(prompt);
  if (seoPlanJson) {
    try {
      const plan = JSON.parse(seoPlanJson) as import("@tidysync/shared").MutationPlan;
      return { plan, modelUsed: "seo-intent", isSeoAgent: true };
    } catch {
      /* continue to AI */
    }
  }

  const result = await chatCompletion(
    [
      {
        role: "system",
        content:
          `Convert merchant requests into a Shopify bulk mutation plan JSON: { steps: [{ action, field, value?, filter?, description }] }.
Actions: set, multiply, add, custom, ai_improve_seo, ai_rewrite_description.
Fields: variants.price, variants.compareAtPrice, variants.sku, title, descriptionHtml, tags, vendor, seo.title, seo.description.
For "improve SEO/description for product X" use action ai_improve_seo with filter.titleContains = X.
For price changes use multiply/add/set. Always include a clear description.`,
      },
      { role: "user", content: prompt },
    ],
    { jsonMode: true },
  );

  if (result.provider === "rule-based" || !result.text) {
    const rulePlan = parseNlBulkEdit(prompt);
    if (rulePlan.steps.length > 0) {
      return { plan: rulePlan, modelUsed: "rule-based" };
    }
    const filterMatch = prompt.match(/\(([^)]+)\)/);
    if (lowerIncludesSeo(prompt)) {
      return {
        plan: buildSeoImprovementPlan(filterMatch?.[1]?.trim()),
        modelUsed: "rule-based-seo",
        isSeoAgent: true,
      };
    }
    return { plan: rulePlan, modelUsed: "rule-based" };
  }

  try {
    const parsed = JSON.parse(result.text) as import("@tidysync/shared").MutationPlan;
    if (!parsed.steps?.length) {
      return { plan: parseNlBulkEdit(prompt), modelUsed: "rule-based-fallback" };
    }
    const isSeo = parsed.steps.some((s) => s.action === "ai_improve_seo");
    return { plan: parsed, modelUsed: result.modelUsed, isSeoAgent: isSeo };
  } catch {
    return { plan: parseNlBulkEdit(prompt), modelUsed: "rule-based-fallback" };
  }
}

function lowerIncludesSeo(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return lower.includes("seo") || lower.includes("meta description");
}
