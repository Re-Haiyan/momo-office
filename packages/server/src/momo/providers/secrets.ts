import type { CloudId } from "./types";
export const cloudIds: CloudId[] = ["gemini", "groq", "openrouter"];
export class Secrets {
  private values = new Map<CloudId, string>();
  private known = new Set<string>();
  private pending = new Map<string, (value: string) => void>();
  constructor(
    private desktop = process.env.MOMO_DESKTOP === "1",
    initial?: Partial<Record<CloudId, string>>,
  ) {
    if (initial) for (const id of cloudIds) this.set(id, initial[id] || "");
    else if (!desktop)
      for (const id of cloudIds)
        this.set(id, process.env[`${id.toUpperCase()}_API_KEY`] || "");
    if (desktop)
      process.on("message", (m: any) => {
        if (m?.type === "vault:reply" && this.pending.has(m.id)) {
          this.pending.get(m.id)!(typeof m.key === "string" ? m.key : "");
          this.pending.delete(m.id);
        }
      });
  }
  private set(id: CloudId, key: string) {
    this.values.set(id, key);
    if (key) this.known.add(key);
  }
  async refresh() {
    if (!this.desktop) return;
    await Promise.all(
      cloudIds.map(async (id) => {
        const key = await new Promise<string>((resolve) => {
          const requestId = `${id}-${crypto.randomUUID()}`;
          const timer = setTimeout(() => {
            this.pending.delete(requestId);
            resolve("");
          }, 3000);
          this.pending.set(requestId, (value) => {
            clearTimeout(timer);
            resolve(value);
          });
          process.send?.({ type: "vault:get", id: requestId, provider: id });
        });
        this.set(id, key);
      }),
    );
  }
  get(id: CloudId) {
    return this.values.get(id) || "";
  }
  redact(text: string) {
    for (const value of this.known) text = text.split(value).join("[REDACTED]");
    return text;
  }
  safe<T>(value: T): T {
    const visit = (v: any): any => {
      if (typeof v === "string") return this.redact(v);
      if (Array.isArray(v)) return v.map(visit);
      if (v && typeof v === "object")
        return Object.fromEntries(
          Object.entries(v)
            .filter(
              ([key]) =>
                !/^(apikey|api_key|authorization|key|secret|token)$/i.test(key),
            )
            .map(([key, item]) => [this.redact(key), visit(item)]),
        );
      return v;
    };
    return visit(value);
  }
}
