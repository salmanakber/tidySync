export type AiProviderName = "openai" | "groq" | "gemini" | "rule-based";

/** Runtime AI config — set from admin AppSettings (DB), with env as fallback. */
export interface AiRuntimeConfig {
  provider?: string; // auto | groq | gemini | openai
  fallbackOrder?: string; // "groq,gemini,openai"
  groqApiKey?: string;
  groqModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
}

let runtimeConfig: AiRuntimeConfig = {};

export function setAiRuntimeConfig(config: AiRuntimeConfig | null | undefined): void {
  runtimeConfig = { ...(config ?? {}) };
}

export function getAiRuntimeConfig(): AiRuntimeConfig {
  return { ...runtimeConfig };
}

export function resolveAiSetting(
  runtimeKey: keyof AiRuntimeConfig,
  envKey: string,
): string | undefined {
  const fromRuntime = runtimeConfig[runtimeKey];
  if (typeof fromRuntime === "string" && fromRuntime.trim()) {
    return fromRuntime.trim();
  }
  const fromEnv = process.env[envKey];
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return undefined;
}
