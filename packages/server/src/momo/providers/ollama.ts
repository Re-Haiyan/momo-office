import type { Settings } from "../Engine";
import type { ModelProvider, Request, ModelInfo } from "./types";
import { budget, family } from "./types";
export async function ollamaComplete(
  messages: { role: string; content: string }[],
  settings: Settings,
  signal: AbortSignal,
  json: boolean | object = false,
): Promise<string> {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(240000)]);
  const response = await fetch(`${settings.ollamaUrl}/api/chat`, {
    method: "POST",
    signal: combined,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      messages,
      stream: false,
      ...(json ? { format: typeof json === "object" ? json : "json" } : {}),
      options: {
        temperature: 0.35,
        num_ctx: settings.numCtx ?? 8192,
        num_predict: 2048,
      },
    }),
  });
  if (!response.ok)
    throw Object.assign(
      new Error(
        `Ollama returned ${response.status}. Check that ${settings.model} is installed and Ollama is running.`,
      ),
      { retryable: response.status >= 500 || response.status === 429 },
    );
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  const content = data.message?.content?.trim();
  if (!content)
    throw new Error(
      "Ollama returned an empty answer. Try a different model in Settings.",
    );
  return content;
}

export class OllamaProvider implements ModelProvider {
  id = "ollama" as const;
  constructor(private settings: () => Settings) {}
  limits() {
    return { rpm: null, rpd: null, timezone: "UTC" };
  }
  async check(signal: AbortSignal) {
    await this.listModels(signal);
    return true;
  }
  async listModels(signal: AbortSignal): Promise<ModelInfo[]> {
    const r = await fetch(`${this.settings().ollamaUrl}/api/tags`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
    });
    if (!r.ok) throw new Error("Ollama model list unavailable.");
    return ((await r.json()).models || []).map((m: any) => ({
      id: m.name,
      family: family(m.name),
      contextWindow: this.settings().numCtx ?? 8192,
      outputLimit: 2048,
      json: true,
    }));
  }
  async complete(r: Request) {
    return {
      text: await ollamaComplete(
        r.messages,
        { ...this.settings(), model: r.model },
        r.signal,
        r.schema || r.json,
      ),
      model: r.model,
      family: family(r.model),
    };
  }
}
