import OpenAI from "openai";
import {
  getAiRuntimeConfig,
  resolveAiSetting,
  type AiProviderName,
} from "./runtime-config";

export type { AiProviderName, AiRuntimeConfig } from "./runtime-config";
export { setAiRuntimeConfig, getAiRuntimeConfig, resolveAiSetting } from "./runtime-config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResult {
  text: string;
  modelUsed: string;
  provider: AiProviderName;
}

export interface ChatCompletionOptions {
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
}

interface ProviderCallOptions {
  jsonMode: boolean;
  maxTokens?: number;
  temperature: number;
}

function parseFallbackOrder(): AiProviderName[] {
  const raw =
    resolveAiSetting("fallbackOrder", "AI_FALLBACK_ORDER") ?? "groq,gemini,openai";
  const names = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is AiProviderName =>
      s === "openai" || s === "groq" || s === "gemini" || s === "rule-based",
    );
  return names.length ? names : ["groq", "gemini", "openai"];
}

function configuredProviders(): AiProviderName[] {
  const forced = (
    resolveAiSetting("provider", "AI_PROVIDER") ?? "auto"
  ).trim().toLowerCase();
  if (forced && forced !== "auto") {
    if (forced === "openai" || forced === "groq" || forced === "gemini") {
      return [forced];
    }
  }
  return parseFallbackOrder().filter((p) => p !== "rule-based");
}

function openaiCompatibleClient(baseURL: string, apiKey: string) {
  return new OpenAI({ apiKey, baseURL });
}

async function chatOpenAICompatible(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  options: ProviderCallOptions,
  provider: AiProviderName,
): Promise<ChatCompletionResult> {
  const response = await client.chat.completions.create({
    model,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    response_format: options.jsonMode ? { type: "json_object" } : undefined,
    messages,
  });
  const text = response.choices[0]?.message?.content ?? "";
  return {
    text,
    modelUsed: `${provider}:${response.model}`,
    provider,
  };
}

async function chatGemini(
  messages: ChatMessage[],
  options: ProviderCallOptions,
  apiKey: string,
  model: string,
): Promise<ChatCompletionResult> {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const userParts = messages.filter((m) => m.role === "user").map((m) => m.content);
  const userText = userParts.join("\n\n");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: `${system}\n\n${userText}` }] }],
    generationConfig: {
      temperature: options.temperature,
      responseMimeType: options.jsonMode ? "application/json" : "text/plain",
    },
  };
  if (options.maxTokens) {
    (body.generationConfig as Record<string, unknown>).maxOutputTokens = options.maxTokens;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { text, modelUsed: `gemini:${model}`, provider: "gemini" };
}

async function chatWithProvider(
  provider: AiProviderName,
  messages: ChatMessage[],
  options: ProviderCallOptions,
): Promise<ChatCompletionResult> {
  if (provider === "groq") {
    const apiKey = resolveAiSetting("groqApiKey", "GROQ_API_KEY");
    if (!apiKey) throw new Error("Groq API key not configured (admin AI settings or GROQ_API_KEY)");
    const client = openaiCompatibleClient("https://api.groq.com/openai/v1", apiKey);
    const model = resolveAiSetting("groqModel", "GROQ_MODEL") ?? "llama-3.3-70b-versatile";
    return chatOpenAICompatible(client, model, messages, options, "groq");
  }

  if (provider === "openai") {
    const apiKey = resolveAiSetting("openaiApiKey", "OPENAI_API_KEY");
    if (!apiKey) throw new Error("OpenAI API key not configured (admin AI settings or OPENAI_API_KEY)");
    const client = openaiCompatibleClient("https://api.openai.com/v1", apiKey);
    const model = resolveAiSetting("openaiModel", "OPENAI_MODEL") ?? "gpt-4o-mini";
    return chatOpenAICompatible(client, model, messages, options, "openai");
  }

  if (provider === "gemini") {
    const apiKey = resolveAiSetting("geminiApiKey", "GEMINI_API_KEY");
    if (!apiKey) throw new Error("Gemini API key not configured (admin AI settings or GEMINI_API_KEY)");
    const model = resolveAiSetting("geminiModel", "GEMINI_MODEL") ?? "gemini-2.0-flash";
    return chatGemini(messages, options, apiKey, model);
  }

  throw new Error(`Provider ${provider} not configured`);
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const callOptions: ProviderCallOptions = {
    jsonMode: options?.jsonMode ?? false,
    maxTokens: options?.maxTokens,
    temperature: options?.temperature ?? 0.2,
  };
  const providers = configuredProviders();
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      return await chatWithProvider(provider, messages, callOptions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider}: ${msg}`);
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[tidysync-ai] ${provider} failed: ${msg}`);
      }
    }
  }

  return {
    text: "",
    modelUsed: "rule-based",
    provider: "rule-based",
  };
}

/** Throws if no live provider succeeds — used by admin AI test. */
export async function testAiConnection(prompt?: string): Promise<{
  ok: boolean;
  provider: AiProviderName;
  modelUsed: string;
  reply: string;
  configuredProviders: AiProviderName[];
  providerMode: string;
  error?: string;
}> {
  const configured = listConfiguredAiProviders();
  const providerMode = resolveAiSetting("provider", "AI_PROVIDER") ?? "auto";

  if (configured.length === 0) {
    return {
      ok: false,
      provider: "rule-based",
      modelUsed: "none",
      reply: "",
      configuredProviders: [],
      providerMode,
      error: "No AI API keys configured. Save a Groq, Gemini, or OpenAI key in Admin → AI settings.",
    };
  }

  const callOptions: ProviderCallOptions = {
    jsonMode: false,
    maxTokens: 80,
    temperature: 0.2,
  };
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: "You are a connectivity probe for TidySync. Reply in one short sentence.",
    },
    {
      role: "user",
      content: prompt?.trim() || "Reply with: TidySync AI is working.",
    },
  ];

  const errors: string[] = [];
  for (const provider of configuredProviders()) {
    try {
      const result = await chatWithProvider(provider, messages, callOptions);
      if (!result.text.trim()) {
        errors.push(`${provider}: empty response`);
        continue;
      }
      return {
        ok: true,
        provider: result.provider,
        modelUsed: result.modelUsed,
        reply: result.text.trim(),
        configuredProviders: configured,
        providerMode,
      };
    } catch (err) {
      errors.push(`${provider}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    ok: false,
    provider: "rule-based",
    modelUsed: "none",
    reply: "",
    configuredProviders: configured,
    providerMode,
    error: errors.join(" | ") || "All providers failed",
  };
}

export function listConfiguredAiProviders(): AiProviderName[] {
  const list: AiProviderName[] = [];
  if (resolveAiSetting("groqApiKey", "GROQ_API_KEY")) list.push("groq");
  if (resolveAiSetting("geminiApiKey", "GEMINI_API_KEY")) list.push("gemini");
  if (resolveAiSetting("openaiApiKey", "OPENAI_API_KEY")) list.push("openai");
  return list;
}

export function getAiProviderStatus() {
  return {
    providerMode: resolveAiSetting("provider", "AI_PROVIDER") ?? "auto",
    fallbackOrder: resolveAiSetting("fallbackOrder", "AI_FALLBACK_ORDER") ?? "groq,gemini,openai",
    configuredProviders: listConfiguredAiProviders(),
    runtimeSource: Object.keys(getAiRuntimeConfig()).length > 0 ? "admin+env" : "env",
  };
}
