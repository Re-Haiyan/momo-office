export type ProviderId = "ollama" | "gemini" | "groq" | "openrouter";
export type CloudId = Exclude<ProviderId, "ollama">;
export type ModelRef = { provider: ProviderId; model: string };
export type ModelInfo = {
  id: string;
  family: string;
  contextWindow: number;
  outputLimit: number;
  json: boolean;
  code?: boolean;
};
export type Limits = {
  rpm: number | null;
  rpd: number | null;
  timezone: string;
};
export type Message = { role: string; content: string };
export type Request = {
  messages: Message[];
  model: string;
  signal: AbortSignal;
  json?: boolean;
};
export type Answer = { text: string; model: string; family: string };
export interface ModelProvider {
  id: ProviderId;
  complete(request: Request): Promise<Answer>;
  listModels(signal: AbortSignal): Promise<ModelInfo[]>;
  check(signal: AbortSignal): Promise<boolean>;
  limits(model: string): Limits;
}
export type ProviderSettings = {
  enabled: boolean;
  consented: boolean;
  dailyCap: number;
  selectedModel: string;
  codeModel: string;
  rpm: number | null;
};
export type Trace = ModelRef & {
  agentId: string;
  stage: string;
  stepId?: string;
  family: string;
  at: string;
};
export class ProviderError extends Error {
  constructor(
    public status: number,
    public retryAfter?: string | null,
  ) {
    super(
      `Provider request failed (${status}). Check connection, model access and quota.`,
    );
  }
}
export function family(id: string): string {
  const name = id.toLowerCase();
  for (const f of [
    "gemini",
    "gemma",
    "qwen",
    "llama",
    "gpt-oss",
    "deepseek",
    "mistral",
    "phi",
    "command",
  ])
    if (name.includes(f)) return f;
  return "unknown";
}
export function budget(messages: Message[], info: ModelInfo): number {
  // UTF-8 bytes are a conservative upper bound for byte-based tokenizers; include framing.
  const input = messages.reduce(
    (n, m) => n + Buffer.byteLength(m.content, "utf8") + 32,
    128,
  );
  const output = Math.min(2048, info.outputLimit, info.contextWindow - input);
  if (!Number.isFinite(output) || output < 256)
    throw new Error(
      "This model cannot fit the request within its verified context window.",
    );
  return output;
}
