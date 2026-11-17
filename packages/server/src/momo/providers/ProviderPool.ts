import fs from "fs";
import {
  Answer,
  CloudId,
  family,
  ModelInfo,
  ModelProvider,
  ModelRef,
  ProviderError,
  ProviderId,
  ProviderSettings,
  Request,
} from "./types";
import { Secrets, cloudIds } from "./secrets";
type Usage = {
  day: string;
  daily: number;
  minute: number[];
  cooldownUntil: number;
};
export const defaultProviderSettings = (): Record<CloudId, ProviderSettings> =>
  Object.fromEntries(
    cloudIds.map((id) => [
      id,
      {
        enabled: false,
        consented: false,
        dailyCap: 0,
        selectedModel: "",
        codeModel: "",
        rpm: null,
      },
    ]),
  ) as Record<CloudId, ProviderSettings>;
export class ProviderPool {
  private usage: Partial<Record<ProviderId, Usage>> = {};
  private catalog: Partial<Record<ProviderId, ModelInfo[]>> = {};
  constructor(
    public providers: Record<ProviderId, ModelProvider>,
    public secrets: Secrets,
    private settings: () => Record<CloudId, ProviderSettings>,
    private file?: string,
    private now = () => Date.now(),
  ) {
    if (file && fs.existsSync(file)) {
      try {
        this.usage = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {}
    }
  }
  private save() {
    if (this.file) {
      fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.usage));
      fs.renameSync(this.file + ".tmp", this.file);
    }
  }
  private counter(id: ProviderId, model = "") {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: this.providers[id].limits(model).timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(this.now());
    const old = this.usage[id];
    const u = (this.usage[id] = old || {
      day,
      daily: 0,
      minute: [],
      cooldownUntil: 0,
    });
    if (u.day !== day) {
      u.day = day;
      u.daily = 0;
    }
    u.minute = u.minute.filter((t) => t > this.now() - 60000);
    return u;
  }
  status(id: ProviderId) {
    const u = this.counter(id);
    return {
      daily: u.daily,
      rpm: u.minute.length,
      cooldownUntil: u.cooldownUntil,
      day: u.day,
    };
  }
  enabled(id: ProviderId) {
    return (
      id === "ollama" ||
      Boolean(
        this.settings()[id]?.enabled &&
        this.settings()[id]?.consented &&
        this.secrets.get(id),
      )
    );
  }
  models(id: ProviderId) {
    return this.catalog[id] || [];
  }
  async discover(id: ProviderId, signal = AbortSignal.timeout(15000)) {
    if (!this.enabled(id))
      throw new Error(
        "Enable the provider, confirm its data policy and supply a key first.",
      );
    // Metadata only; no user prompts sent. Used explicitly by Test/Refresh/Auto-assign.
    try {
      this.catalog[id] = await this.providers[id].listModels(signal);
    } catch (e) {
      delete this.catalog[id];
      throw e;
    }
    return this.catalog[id]!;
  }
  async check(id: ProviderId) {
    if (!this.enabled(id))
      throw new Error("Provider is disabled or its key/consent is missing.");
    await this.discover(id);
    return {
      ok: await this.providers[id].check(AbortSignal.timeout(15000)),
      models: this.models(id),
    };
  }
  private reserve(id: ProviderId, model: string) {
    const u = this.counter(id, model),
      l = this.providers[id].limits(model);
    if (u.cooldownUntil > this.now())
      throw new Error("Provider is cooling down.");
    const config = id === "ollama" ? undefined : this.settings()[id];
    const rpm =
      config?.rpm === null || config?.rpm === undefined
        ? l.rpm
        : l.rpm === null
          ? config.rpm
          : Math.min(config.rpm, l.rpm);
    if (rpm !== null && u.minute.length >= rpm)
      throw new Error("Provider minute cap reached.");
    const cap = config?.dailyCap || 0;
    if (id !== "ollama" && (!cap || u.daily >= cap))
      throw new Error("Provider daily cap reached or not configured.");
    if (l.rpd !== null && u.daily >= l.rpd)
      throw new Error("Provider daily quota reached.");
    u.minute.push(this.now());
    u.daily++;
    this.save();
  }
  reviewerChain(
    chain: ModelRef[],
    authors: ModelRef[],
    localOnly: boolean,
  ): ModelRef[] {
    const families = new Set(authors.map((a) => family(a.model)));
    return chain.flatMap((ref) => {
      if (
        ref.provider !== "openrouter" ||
        localOnly ||
        !this.enabled("openrouter")
      )
        return [ref];
      if (families.has("unknown")) return [];
      const models = this.models("openrouter").filter(
        (m) => m.json && m.family !== "unknown" && !families.has(m.family),
      );
      const replacement = models.find((m) => m.id === ref.model) || models[0];
      return replacement
        ? [{ provider: "openrouter" as const, model: replacement.id }]
        : [];
    });
  }

  async complete(
    chain: ModelRef[],
    request: Omit<Request, "model">,
    localOnly: boolean,
    authors: ModelRef[] = [],
    review = false,
  ): Promise<Answer & { provider: ProviderId; warning?: string }> {
    if (
      review &&
      !localOnly &&
      chain.some((r) => r.provider === "openrouter") &&
      this.enabled("openrouter")
    ) {
      try {
        await this.discover("openrouter", request.signal);
      } catch {
        request.signal.throwIfAborted();
      }
    }
    if (review) chain = this.reviewerChain(chain, authors, localOnly);
    // Local fallback is always last, even after independence ordering.
    chain = [
      ...chain.filter((r) => r.provider !== "ollama"),
      ...chain.filter((r) => r.provider === "ollama"),
    ];
    if (!chain.some((r) => r.provider === "ollama"))
      throw new Error("Fallback chain must end in Ollama.");
    for (const ref of chain) {
      request.signal.throwIfAborted();
      // Check this before discovery, key access or any provider method.
      if (localOnly && ref.provider !== "ollama") continue;
      if (!this.enabled(ref.provider)) continue;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            this.reserve(ref.provider, ref.model);
            const answer = await this.providers[ref.provider].complete({
              ...request,
              model: ref.model,
            });
            request.signal.throwIfAborted();
            const same =
              review &&
              authors.some(
                (a) =>
                  a.model === answer.model ||
                  (family(a.model) !== "unknown" &&
                    family(a.model) === answer.family),
              );
            const unknown =
              review &&
              (answer.family === "unknown" ||
                authors.some((a) => family(a.model) === "unknown"));
            return {
              ...answer,
              text: this.secrets.redact(answer.text),
              model: this.secrets.redact(answer.model),
              provider: ref.provider,
              ...(same || unknown
                ? {
                    warning: same
                      ? "Reviewer shares a model family with an author. Treat the review as potentially correlated."
                      : "Reviewer model-family independence could not be verified.",
                  }
                : {}),
            };
          } catch (e: any) {
            request.signal.throwIfAborted();
            if (e instanceof ProviderError && e.status === 429) {
              const value = e.retryAfter;
              const seconds =
                value !== null &&
                value !== undefined &&
                /^\d+(\.\d+)?$/.test(value)
                  ? Number(value) * 1000
                  : NaN;
              const target = Number.isFinite(seconds)
                ? this.now() + seconds
                : Date.parse(value || "");
              this.counter(ref.provider, ref.model).cooldownUntil =
                Number.isFinite(target)
                  ? Math.max(this.now() + 1000, target)
                  : this.now() + 60000;
              this.save();
              throw e;
            }
            const temporary =
              e.retryable ||
              e.name === "TypeError" ||
              e.name === "TimeoutError" ||
              (e instanceof ProviderError && e.status >= 500);
            if (attempt || !temporary) throw e;
          }
        }
      } catch {
        request.signal.throwIfAborted(); /* No upstream error text can escape, even from a mock or a reflected credential. */
      }
    }
    throw new Error(
      "No configured model could answer. Check local Ollama, provider availability, caps and cooldowns.",
    );
  }
}
