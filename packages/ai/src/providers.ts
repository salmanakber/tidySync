import OpenAI from "openai";

export type AiProviderName = "openai" | "groq" | "gemini" | "rule-based";

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
  const raw = process.env.AI_FALLBACK_ORDER ?? "groq,gemini,openai";
  const names = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is AiProviderName =>
      s === "openai" || s === "groq" || s === "gemini" || s === "rule-based",
    );
  return names.length ? names : ["groq", "gemini", "openai"];
}

function configuredProviders(): AiProviderName[] {
  const forced = process.env.AI_PROVIDER?.trim().toLowerCase();
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
): Promise<ChatCompletionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
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
  if (provider === "groq" && process.env.GROQ_API_KEY) {
    const client = openaiCompatibleClient(
      "https://api.groq.com/openai/v1",
      process.env.GROQ_API_KEY,
    );
    const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
    return chatOpenAICompatible(client, model, messages, options, "groq");
  }

  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    const client = openaiCompatibleClient("https://api.openai.com/v1", process.env.OPENAI_API_KEY);
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    return chatOpenAICompatible(client, model, messages, options, "openai");
  }

  if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    return chatGemini(messages, options);
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

  for (const provider of providers) {
    try {
      return await chatWithProvider(provider, messages, callOptions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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

export function listConfiguredAiProviders(): AiProviderName[] {
  const list: AiProviderName[] = [];
  if (process.env.GROQ_API_KEY) list.push("groq");
  if (process.env.GEMINI_API_KEY) list.push("gemini");
  if (process.env.OPENAI_API_KEY) list.push("openai");
  return list;
}
