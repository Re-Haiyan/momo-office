import type { Settings } from "../Engine";
import type { ModelProvider, Request, ModelInfo } from "./types";
import { family } from "./types";
import { budgetMessages, outputBlock } from "../budget";
export async function ollamaComplete(
  messages: { role: string; content: string }[],
  settings: Settings,
  signal: AbortSignal,
  json: boolean | object = false,
  onPartial?: (text: string) => void,
): Promise<string> {
  const total = AbortSignal.any([
    signal,
    AbortSignal.timeout(settings.timeoutMs ?? 240000),
  ]);
  let accumulated = "";
  for (let continuation = 0; continuation < 2; continuation++) {
    const idle = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          idle.abort(new DOMException("Model stream stalled.", "TimeoutError")),
        settings.idleTimeoutMs ?? 90000,
      );
    };
    const combined = AbortSignal.any([total, idle.signal]);
    let text = "",
      reason = "";
    let sawDone = false;
    reset();
    try {
      const r = await fetch(`${settings.ollamaUrl}/api/chat`, {
        method: "POST",
        signal: combined,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: settings.model,
          messages,
          stream: true,
          keep_alive: settings.keepAlive ?? "10m",
          ...(json ? { format: typeof json === "object" ? json : "json" } : {}),
          options: {
            temperature: settings.temperature ?? 0.35,
            num_ctx: settings.numCtx ?? 8192,
            num_predict: settings.numPredict ?? 2048,
          },
        }),
      });
      if (!r.ok)
        throw Object.assign(
          new Error(
            `Ollama returned ${r.status}. Check the local model and connection.`,
          ),
          { retryable: r.status >= 500 || r.status === 429 },
        );
      const consume = (line: string) => {
        if (!line.trim()) return;
        const data = JSON.parse(line);
        if (data.error)
          throw new Error("Ollama could not complete this request.");
        text += data.message?.content || "";
        if (text.length > 200000)
          throw new Error("Model output exceeded the safety size limit.");
        if (data.done) {
          sawDone = true;
          reason = data.done_reason || "";
        }
        onPartial?.(accumulated + text);
      };
      if (r.headers.get("content-type")?.includes("application/json")) {
        consume(await r.text());
        sawDone = true;
      } else {
        const reader = r.body?.getReader();
        if (!reader) throw new Error("Ollama returned no response stream.");
        let pending = "";
        const decoder = new TextDecoder();
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            reset();
            pending += decoder.decode(chunk.value, { stream: true });
            if (pending.length > 1000000)
              throw new Error("Invalid oversized model stream.");
            const lines = pending.split("\n");
            pending = lines.pop() || "";
            for (const line of lines) consume(line);
          }
          pending += decoder.decode();
          consume(pending);
        } finally {
          await reader.cancel().catch(() => {});
        }
      }
      if (!sawDone)
        throw Object.assign(new Error("Model stream ended unexpectedly."), {
          retryable: true,
        });
    } finally {
      clearTimeout(timer!);
    }
    accumulated += text;
    if (reason !== "length" || continuation === 1) break;
    json = false;
    messages = budgetMessages(
      [
        ...messages,
        { role: "assistant", content: outputBlock(text) },
        {
          role: "user",
          content:
            "Continue exactly where you stopped. Do not repeat earlier text.",
        },
      ],
      settings.numCtx ?? 8192,
      settings.numPredict ?? 2048,
    ).messages;
  }
  if (!accumulated.trim())
    throw new Error(
      "Ollama returned an empty answer. Try another installed model.",
    );
  return accumulated.trim();
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
    if (!r.ok) throw new Error("Ollama models unavailable.");
    return ((await r.json()).models || []).map((m: any) => ({
      id: m.name,
      family: family(m.name),
      contextWindow: this.settings().numCtx ?? 8192,
      outputLimit: this.settings().numPredict ?? 2048,
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
        r.onPartial,
      ),
      model: r.model,
      family: family(r.model),
    };
  }
}
