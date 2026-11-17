import { providersConfig } from "./providers.config";
import { request } from "./http";
import { budget, family, ModelInfo, ModelProvider, Request } from "./types";
export function isFreeModel(m: any) {
  return (
    typeof m.id === "string" &&
    m.id.endsWith(":free") &&
    m.pricing &&
    ["prompt", "completion"].every(
      (k) => m.pricing[k] !== undefined && Number(m.pricing[k]) === 0,
    ) &&
    Object.values(m.pricing).every((v) => Number(v) === 0)
  );
}
export class OpenAICompatibleProvider implements ModelProvider {
  private accountDailyLimit: number | null = null;
  private async accountQuota(signal: AbortSignal) {
    const data = await request(
      providersConfig.openrouter.baseURL,
      "/key",
      this.key(),
      "Authorization",
      signal,
    );
    const quota = data.data?.free_model_daily_requests;
    if (quota && Number.isInteger(quota.limit) && quota.limit >= 0)
      this.accountDailyLimit = quota.limit;
    return quota;
  }
  constructor(
    public id: "groq" | "openrouter",
    private key: () => string,
  ) {}
  limits(model: string) {
    return {
      ...providersConfig[this.id].limits,
      ...(this.id === "openrouter" ? { rpd: this.accountDailyLimit } : {}),
      ...(this.id === "groq" &&
      (providersConfig.groq.freeModels as readonly string[]).includes(model)
        ? providersConfig.groq.modelLimits
        : {}),
    };
  }
  async check(signal: AbortSignal) {
    if (this.id === "openrouter") await this.accountQuota(signal);
    return (await this.listModels(signal)).length > 0;
  }
  async listModels(signal: AbortSignal): Promise<ModelInfo[]> {
    const c = providersConfig[this.id];
    const data = await request(
      c.baseURL,
      c.models,
      this.key(),
      "Authorization",
      signal,
    );
    return (data.data || [])
      .filter((m: any) =>
        this.id === "openrouter"
          ? isFreeModel(m)
          : (c.freeModels as readonly string[]).includes(m.id),
      )
      .map((m: any) => ({
        id: m.id,
        family: family(m.id),
        contextWindow: Number(m.context_length || m.context_window) || 0,
        outputLimit:
          Number(
            m.top_provider?.max_completion_tokens ||
              m.max_completion_tokens ||
              (this.id === "groq"
                ? providersConfig.groq.outputLimits[m.id]
                : undefined),
          ) || 0,
        json:
          this.id === "groq" ||
          m.supported_parameters?.includes("response_format"),
        code: this.id === "groq",
      }))
      .filter((m: ModelInfo) => m.contextWindow > 0 && m.outputLimit > 0);
  }
  async complete(r: Request) {
    const info = (await this.listModels(r.signal)).find(
      (m) => m.id === r.model,
    );
    if (!info || (r.json && !info.json))
      throw new Error(
        "Provider model is unavailable, unverified as free, or lacks JSON output.",
      );
    const c = providersConfig[this.id];
    if (this.id === "openrouter") {
      const quota = await this.accountQuota(r.signal);
      if (quota && Number.isFinite(quota.remaining) && quota.remaining <= 0)
        throw new Error(
          "OpenRouter account free-model daily quota is exhausted.",
        );
    }
    const data = await request(
      c.baseURL,
      c.chat,
      this.key(),
      "Authorization",
      r.signal,
      {
        model: r.model,
        messages: r.messages,
        stream: false,
        temperature: 0.35,
        max_tokens: budget(r.messages, info),
        ...(r.json ? { response_format: { type: "json_object" } } : {}),
        ...(this.id === "openrouter"
          ? {
              provider: {
                max_price: { prompt: 0, completion: 0, request: 0 },
                require_parameters: true,
                allow_fallbacks: false,
              },
            }
          : {}),
      },
    );
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Provider returned no usable answer.");
    // Some hosts return the canonical identity without the catalog :free suffix.
    // Accept only the selected model or its exact canonical identity; routing remains zero-price.
    const actual = typeof data.model === "string" ? data.model : r.model;
    if (
      this.id === "openrouter" &&
      actual !== r.model &&
      actual !== r.model.replace(/:free$/, "")
    )
      throw new Error("OpenRouter returned an unexpected model identity.");
    return { text, model: actual, family: family(actual) };
  }
}
