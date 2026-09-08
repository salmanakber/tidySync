export interface ScopedMutationStep {
  action: string;
  field: string;
  value?: string | number | boolean;
  filter?: Record<string, unknown>;
  description: string;
}

export interface ScopedMutationPlan {
  steps: ScopedMutationStep[];
  estimatedAffectedCount?: number;
}

const MENTION_TOKEN_RE = /\{\{mention:([^|]+)\|([^|]*)\|([^}]+)\}\}/g;
const MENTION_ID_MARK_RE = /@"([^"]+)"\{\{id:([^}]+)\}\}/g;
const AT_PRODUCT_RE = /@([A-Za-z0-9][\w\s\-&.']{1,80}?)(?=\s*(?:$|[,.;]|\band\b|\bset\b|\bchange\b|\bto\b|\bprice\b))/gi;

export interface ProductScope {
  productIds: string[];
  titleContains?: string;
  /** True when the merchant clearly asked for the whole catalog */
  storeWide: boolean;
}

export function isStoreWideIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    /\ball\s+products?\b/.test(lower) ||
    /\bevery\s+product\b/.test(lower) ||
    /\bentire\s+catalog\b/.test(lower) ||
    /\bwhole\s+store\b/.test(lower) ||
    /\bacross\s+(the\s+)?(store|catalog|shop)\b/.test(lower)
  );
}

/** Pull exact product IDs / title fragments from mentions and “for product X” phrasing. */
export function extractProductScopeFromPrompt(prompt: string): ProductScope {
  const productIds: string[] = [];
  const titles: string[] = [];

  for (const match of prompt.matchAll(MENTION_TOKEN_RE)) {
    const id = match[1]?.trim();
    const title = match[3]?.trim();
    if (id) productIds.push(id);
    if (title) titles.push(title);
  }

  for (const match of prompt.matchAll(MENTION_ID_MARK_RE)) {
    const title = match[1]?.trim();
    const id = match[2]?.trim();
    if (id) productIds.push(id);
    if (title) titles.push(title);
  }

  for (const match of prompt.matchAll(AT_PRODUCT_RE)) {
    const title = match[1]?.trim();
    if (title && title.length > 1) titles.push(title);
  }

  const named =
    prompt.match(
      /(?:for|on|of)\s+(?:the\s+)?product\s+["']?([^"',.\n]+?)["']?(?=\s*(?:$|and|,|;|\.|set|change|update|increase|decrease))/i,
    ) ??
    prompt.match(
      /(?:title|name|rename)\s+(?:of|for)\s+["']?([^"']+?)["']?\s+(?:to|yo|into)\b/i,
    ) ??
    prompt.match(
      /(?:change|update|set)\s+(?:the\s+)?(?:price|prices|title|name|tags?|vendor|description)\s+(?:of|for)\s+["']?([^"']+?)["']?(?=\s+(?:to|yo|into|by|and|$))/i,
    );

  if (named?.[1]?.trim()) {
    titles.push(named[1].trim());
  }

  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  const titleContains = titles.sort((a, b) => b.length - a.length)[0]?.trim();

  return {
    productIds: uniqueIds,
    titleContains: titleContains || undefined,
    storeWide: isStoreWideIntent(prompt) && uniqueIds.length === 0 && !titleContains,
  };
}

function mergeFilter(
  existing: Record<string, unknown> | undefined,
  scope: ProductScope,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existing ?? {}) };
  if (scope.productIds.length) {
    const prev = Array.isArray(next.productIds) ? (next.productIds as string[]) : [];
    next.productIds = [...new Set([...prev, ...scope.productIds])];
  }
  if (scope.titleContains && !next.titleContains && !scope.productIds.length) {
    next.titleContains = scope.titleContains;
  }
  // Prefer exact IDs when present — drop fuzzy titleContains to avoid over-matching
  if (scope.productIds.length && next.titleContains) {
    delete next.titleContains;
  }
  return next;
}

/**
 * Safety layer: if the merchant named/mentioned a product, force that scope onto every step.
 * Prevents AI/rule plans from accidentally editing the whole catalog.
 */
export function applyProductScopeToPlan(prompt: string, plan: ScopedMutationPlan): ScopedMutationPlan {
  const scope = extractProductScopeFromPrompt(prompt);
  if (scope.storeWide || (scope.productIds.length === 0 && !scope.titleContains)) {
    return plan;
  }

  const steps: ScopedMutationStep[] = (plan.steps ?? []).map((step) => ({
    ...step,
    filter: mergeFilter(step.filter as Record<string, unknown> | undefined, scope),
  }));

  return { ...plan, steps };
}

/** True when a named product was indicated but the plan has no product filter (unsafe). */
export function planMissingRequiredProductScope(prompt: string, plan: ScopedMutationPlan): boolean {
  const scope = extractProductScopeFromPrompt(prompt);
  if (scope.storeWide || (scope.productIds.length === 0 && !scope.titleContains)) {
    return false;
  }
  return !(plan.steps ?? []).every((step) => {
    const f = step.filter as Record<string, unknown> | undefined;
    if (!f) return false;
    if (Array.isArray(f.productIds) && f.productIds.length > 0) return true;
    if (typeof f.titleContains === "string" && f.titleContains.trim()) return true;
    return false;
  });
}
