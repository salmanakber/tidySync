export type AppErrorCode =
  | "CREDIT_LIMIT"
  | "PLAN_LIMIT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "BILLING_REQUIRED"
  | "INTERNAL_SERVER_ERROR";

export interface GraphQLExtensions {
  code?: AppErrorCode | string;
  creditsUsed?: number;
  creditsLimit?: number;
  creditsRemaining?: number;
  creditsRequested?: number;
  planSlug?: string | null;
  planName?: string | null;
  [key: string]: unknown;
}

export interface GraphQLClientErrorPayload {
  message: string;
  extensions?: GraphQLExtensions;
  path?: string[];
}

export class GraphQLClientError extends Error {
  readonly code?: string;
  readonly extensions?: GraphQLExtensions;
  readonly path?: string[];

  constructor(payload: GraphQLClientErrorPayload) {
    super(payload.message);
    this.name = "GraphQLClientError";
    this.code = payload.extensions?.code;
    this.extensions = payload.extensions;
    this.path = payload.path;
  }

  get isCreditLimit(): boolean {
    return this.code === "CREDIT_LIMIT";
  }

  get isPlanLimit(): boolean {
    return this.code === "PLAN_LIMIT";
  }

  get isBillingRelated(): boolean {
    return this.isCreditLimit || this.isPlanLimit || this.code === "BILLING_REQUIRED";
  }
}

export function parseGraphQLClientError(
  errors: Array<{ message?: string; extensions?: GraphQLExtensions; path?: string[] }>,
): GraphQLClientError {
  const first = errors[0] ?? { message: "Request failed" };
  return new GraphQLClientError({
    message: first.message ?? "Request failed",
    extensions: first.extensions,
    path: first.path,
  });
}

export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof GraphQLClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export interface AppAlertModel {
  id: string;
  tone: "critical" | "warning" | "info" | "success";
  title?: string;
  message: string;
  code?: string;
  primaryAction?: { content: string; onAction: () => void };
  secondaryAction?: { content: string; onAction: () => void };
}

export function alertFromError(
  error: unknown,
  onBilling?: () => void,
): Omit<AppAlertModel, "id"> {
  if (error instanceof GraphQLClientError) {
    if (error.isCreditLimit) {
      const remaining = error.extensions?.creditsRemaining;
      const limit = error.extensions?.creditsLimit;
      const detail =
        typeof remaining === "number" && typeof limit === "number"
          ? `You have used ${error.extensions?.creditsUsed ?? limit - remaining} of ${limit} AI credits this month.`
          : error.message;
      return {
        tone: "warning",
        title: "AI credits exhausted",
        message: detail,
        code: error.code,
        primaryAction: onBilling
          ? { content: "Buy credits", onAction: onBilling }
          : undefined,
        secondaryAction: onBilling
          ? { content: "Upgrade plan", onAction: onBilling }
          : undefined,
      };
    }
    if (error.isPlanLimit) {
      return {
        tone: "warning",
        title: "Plan limit",
        message: error.message,
        code: error.code,
        primaryAction: onBilling ? { content: "View plans", onAction: onBilling } : undefined,
      };
    }
    if (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN") {
      return {
        tone: "critical",
        title: "Access denied",
        message: error.message,
        code: error.code,
      };
    }
    if (error.code === "VALIDATION" || error.code === "NOT_FOUND") {
      return {
        tone: "critical",
        title: "Request issue",
        message: error.message,
        code: error.code,
      };
    }
    return {
      tone: "critical",
      message: error.message,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    return {
      tone: "critical",
      message: error.message,
    };
  }

  return {
    tone: "critical",
    message: "Something went wrong. Please try again.",
  };
}

export function planUsageAlerts(
  tenant: {
    productCount: number;
    plan?: {
      name?: string;
      maxProducts?: number;
      aiCreditsRemaining?: number;
    } | null;
  },
  onBilling?: () => void,
): Omit<AppAlertModel, "id">[] {
  const alerts: Omit<AppAlertModel, "id">[] = [];
  const credits = tenant.plan?.aiCreditsRemaining;
  const maxProducts = tenant.plan?.maxProducts;

  if (credits != null && credits <= 0) {
    alerts.push({
      tone: "warning",
      title: "No AI credits left",
      message:
        "AI features (bulk edit, SEO insights, import polish) need credits. Buy a top-up or upgrade your plan.",
      code: "CREDIT_LIMIT",
      primaryAction: onBilling ? { content: "Go to Billing", onAction: onBilling } : undefined,
    });
  } else if (credits != null && credits <= 3) {
    alerts.push({
      tone: "info",
      title: "AI credits running low",
      message: `Only ${credits} AI credit${credits === 1 ? "" : "s"} left on your ${tenant.plan?.name ?? "plan"}.`,
      primaryAction: onBilling ? { content: "Add credits", onAction: onBilling } : undefined,
    });
  }

  if (maxProducts && tenant.productCount >= maxProducts) {
    alerts.push({
      tone: "warning",
      title: "Product limit reached",
      message: `${tenant.productCount.toLocaleString()} / ${maxProducts.toLocaleString()} products on your ${tenant.plan?.name ?? "plan"}. Upgrade to import more.`,
      code: "PLAN_LIMIT",
      primaryAction: onBilling ? { content: "Upgrade plan", onAction: onBilling } : undefined,
    });
  } else if (maxProducts && tenant.productCount >= maxProducts * 0.9) {
    alerts.push({
      tone: "info",
      title: "Approaching product limit",
      message: `${tenant.productCount.toLocaleString()} / ${maxProducts.toLocaleString()} products used.`,
      primaryAction: onBilling ? { content: "View plans", onAction: onBilling } : undefined,
    });
  }

  return alerts;
}
