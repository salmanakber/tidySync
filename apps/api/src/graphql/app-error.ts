import { GraphQLError } from "graphql";

export type AppErrorCode =
  | "CREDIT_LIMIT"
  | "PLAN_LIMIT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "BILLING_REQUIRED";

const USER_FACING_CODES = new Set<AppErrorCode>([
  "CREDIT_LIMIT",
  "PLAN_LIMIT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "VALIDATION",
  "NOT_FOUND",
  "BILLING_REQUIRED",
]);

export function isUserFacingErrorCode(code: string | undefined): boolean {
  return code != null && USER_FACING_CODES.has(code as AppErrorCode);
}

export function appError(
  code: AppErrorCode,
  message: string,
  extensions?: Record<string, unknown>,
): GraphQLError {
  return new GraphQLError(message, {
    extensions: {
      code,
      ...extensions,
    },
  });
}

export function creditLimitError(
  tenant: {
    aiCreditsUsed: number;
    extraAiCredits: number;
    plan: { aiCreditsPerMonth: number; slug?: string | null; name?: string | null };
  },
  creditsRequested = 1,
): GraphQLError {
  const limit = tenant.plan.aiCreditsPerMonth + tenant.extraAiCredits;
  const remaining = Math.max(0, limit - tenant.aiCreditsUsed);
  return appError(
    "CREDIT_LIMIT",
    "AI credit limit reached. Purchase a top-up or upgrade your plan.",
    {
      creditsUsed: tenant.aiCreditsUsed,
      creditsLimit: limit,
      creditsRemaining: remaining,
      creditsRequested,
      planSlug: tenant.plan.slug ?? null,
      planName: tenant.plan.name ?? null,
    },
  );
}

export function planLimitError(message: string, extensions?: Record<string, unknown>): GraphQLError {
  return appError("PLAN_LIMIT", message, extensions);
}
