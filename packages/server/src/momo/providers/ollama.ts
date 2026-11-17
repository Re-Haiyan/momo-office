import type { Settings } from "../Engine";
import type { ModelProvider, Request, ModelInfo } from "./types";
import { budget, family } from "./types";
export async function ollamaComplete(
  messages: { role: string; content: string }[],
  settings: Settings,
  signal: AbortSignal,
  json = false,
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
      ...(json ? { format: "json" } : {}),
      options: { temperature: 0.35, num_ctx: 8192, num_predict: 2048 },
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
      contextWindow: 8192,
      outputLimit: 2048,
      json: true,
    }));
  }
  async complete(r: Request) {
    let contextWindow = 8192; // Existing request's configured context, never increased silently.
    try {
      const metadata = await fetch(`${this.settings().ollamaUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: r.model }),
        signal: AbortSignal.any([r.signal, AbortSignal.timeout(4000)]),
      });
      if (metadata.ok) {
        const data = await metadata.json();
        const declared = Object.entries(data.model_info || {})
          .filter(
            ([key, value]) =>
              key.endsWith(".context_length") &&
              typeof value === "number" &&
              value > 0,
          )
          .map(([, value]) => Number(value));
        if (declared.length) contextWindow = Math.min(8192, ...declared);
      }
    } catch {
      r.signal.throwIfAborted();
    }
    budget(r.messages, {
      id: r.model,
      family: family(r.model),
      contextWindow,
      outputLimit: 2048,
      json: true,
    });
    return {
      text: await ollamaComplete(
        r.messages,
        { ...this.settings(), model: r.model },
        r.signal,
        r.json,
      ),
      model: r.model,
      family: family(r.model),
    };
  }
}
