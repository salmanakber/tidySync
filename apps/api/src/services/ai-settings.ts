import { prisma } from "@tidysync/database";
import { setAiRuntimeConfig, type AiRuntimeConfig } from "@tidysync/ai";

export const AI_SETTINGS_KEY = "ai_providers";

export interface AiSettingsStored {
  provider?: string;
  fallbackOrder?: string;
  groqApiKey?: string;
  groqModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
}

export interface AiSettingsPublic {
  provider: string;
  fallbackOrder: string;
  groqApiKeySet: boolean;
  groqApiKeyHint: string | null;
  groqModel: string;
  geminiApiKeySet: boolean;
  geminiApiKeyHint: string | null;
  geminiModel: string;
  openaiApiKeySet: boolean;
  openaiApiKeyHint: string | null;
  openaiModel: string;
  /** Keys present via process.env (not shown as editable secrets) */
  envFallback: {
    groq: boolean;
    gemini: boolean;
    openai: boolean;
  };
  source: "database" | "env-only";
}

function maskHint(key?: string | null): string | null {
  if (!key?.trim()) return null;
  const t = key.trim();
  if (t.length <= 8) return "••••••••";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

function asStored(value: unknown): AiSettingsStored {
  if (!value || typeof value !== "object") return {};
  return value as AiSettingsStored;
}

export async function loadAiSettingsFromDb(): Promise<AiSettingsStored> {
  const row = await prisma.appSetting.findUnique({ where: { key: AI_SETTINGS_KEY } });
  return asStored(row?.value);
}

export async function applyAiSettingsToRuntime(stored?: AiSettingsStored): Promise<AiRuntimeConfig> {
  const settings = stored ?? (await loadAiSettingsFromDb());
  const config: AiRuntimeConfig = {
    provider: settings.provider,
    fallbackOrder: settings.fallbackOrder,
    groqApiKey: settings.groqApiKey,
    groqModel: settings.groqModel,
    geminiApiKey: settings.geminiApiKey,
    geminiModel: settings.geminiModel,
    openaiApiKey: settings.openaiApiKey,
    openaiModel: settings.openaiModel,
  };
  setAiRuntimeConfig(config);
  return config;
}

export async function getPublicAiSettings(): Promise<AiSettingsPublic> {
  const settings = await loadAiSettingsFromDb();
  const hasDb =
    Boolean(settings.groqApiKey?.trim()) ||
    Boolean(settings.geminiApiKey?.trim()) ||
    Boolean(settings.openaiApiKey?.trim()) ||
    Boolean(settings.provider?.trim());

  return {
    provider: settings.provider?.trim() || process.env.AI_PROVIDER || "auto",
    fallbackOrder:
      settings.fallbackOrder?.trim() || process.env.AI_FALLBACK_ORDER || "groq,gemini,openai",
    groqApiKeySet: Boolean(settings.groqApiKey?.trim()),
    groqApiKeyHint: maskHint(settings.groqApiKey),
    groqModel: settings.groqModel?.trim() || process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    geminiApiKeySet: Boolean(settings.geminiApiKey?.trim()),
    geminiApiKeyHint: maskHint(settings.geminiApiKey),
    geminiModel: settings.geminiModel?.trim() || process.env.GEMINI_MODEL || "gemini-2.0-flash",
    openaiApiKeySet: Boolean(settings.openaiApiKey?.trim()),
    openaiApiKeyHint: maskHint(settings.openaiApiKey),
    openaiModel: settings.openaiModel?.trim() || process.env.OPENAI_MODEL || "gpt-4o-mini",
    envFallback: {
      groq: Boolean(process.env.GROQ_API_KEY?.trim()),
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
    source: hasDb ? "database" : "env-only",
  };
}

export interface AiSettingsUpdateInput {
  provider?: string | null;
  fallbackOrder?: string | null;
  groqApiKey?: string | null;
  groqModel?: string | null;
  geminiApiKey?: string | null;
  geminiModel?: string | null;
  openaiApiKey?: string | null;
  openaiModel?: string | null;
  /** Clear a stored key without replacing (e.g. clearGroqApiKey: true) */
  clearGroqApiKey?: boolean | null;
  clearGeminiApiKey?: boolean | null;
  clearOpenaiApiKey?: boolean | null;
}

export async function updateAiSettings(input: AiSettingsUpdateInput): Promise<AiSettingsPublic> {
  const existing = await loadAiSettingsFromDb();
  const next: AiSettingsStored = { ...existing };

  if (input.provider !== undefined && input.provider !== null) {
    next.provider = input.provider.trim() || "auto";
  }
  if (input.fallbackOrder !== undefined && input.fallbackOrder !== null) {
    next.fallbackOrder = input.fallbackOrder.trim() || "groq,gemini,openai";
  }
  if (input.groqModel !== undefined && input.groqModel !== null) {
    next.groqModel = input.groqModel.trim();
  }
  if (input.geminiModel !== undefined && input.geminiModel !== null) {
    next.geminiModel = input.geminiModel.trim();
  }
  if (input.openaiModel !== undefined && input.openaiModel !== null) {
    next.openaiModel = input.openaiModel.trim();
  }

  // Only overwrite secrets when a non-empty new value is provided
  if (input.clearGroqApiKey) next.groqApiKey = "";
  else if (input.groqApiKey?.trim()) next.groqApiKey = input.groqApiKey.trim();

  if (input.clearGeminiApiKey) next.geminiApiKey = "";
  else if (input.geminiApiKey?.trim()) next.geminiApiKey = input.geminiApiKey.trim();

  if (input.clearOpenaiApiKey) next.openaiApiKey = "";
  else if (input.openaiApiKey?.trim()) next.openaiApiKey = input.openaiApiKey.trim();

  await prisma.appSetting.upsert({
    where: { key: AI_SETTINGS_KEY },
    create: { key: AI_SETTINGS_KEY, value: next as object },
    update: { value: next as object },
  });

  await applyAiSettingsToRuntime(next);
  return getPublicAiSettings();
}
