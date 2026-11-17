import { providersConfig } from "./providers.config";
import { request } from "./http";
import { budget, family, ModelProvider, ModelInfo, Request } from "./types";
const config = providersConfig.gemini;
export class GeminiProvider implements ModelProvider {
  id = "gemini" as const;
  constructor(private key: () => string) {}
  limits() {
    return { ...config.limits };
  }
  async check(signal: AbortSignal) {
    return (await this.listModels(signal)).length > 0;
  }
  async listModels(signal: AbortSignal): Promise<ModelInfo[]> {
    const result: ModelInfo[] = [];
    let page = "";
    do {
      const data = await request(
        config.baseURL,
        config.models + (page ? `?pageToken=${encodeURIComponent(page)}` : ""),
        this.key(),
        config.auth,
        signal,
      );
      for (const m of data.models || []) {
        const id = String(m.name).replace(/^models\//, "");
        if (
          !(config.freeModels as readonly string[]).includes(id) ||
          !m.supportedGenerationMethods?.includes("generateContent")
        )
          continue;
        if (!(m.inputTokenLimit > 0 && m.outputTokenLimit > 0)) continue;
        result.push({
          id,
          family: family(id),
          contextWindow: m.inputTokenLimit,
          outputLimit: m.outputTokenLimit,
          json: true,
          code: true,
        });
      }
      page = data.nextPageToken || "";
    } while (page && result.length < 100);
    return result;
  }
  async complete(r: Request) {
    const info = (await this.listModels(r.signal)).find(
      (m) => m.id === r.model,
    );
    if (!info)
      throw new Error(
        "Gemini model is not in the verified free-tier catalog. Refresh models or update providers.config.ts.",
      );
    const data = await request(
      config.baseURL,
      `/models/${encodeURIComponent(r.model)}:generateContent`,
      this.key(),
      config.auth,
      r.signal,
      {
        systemInstruction: {
          parts: [
            {
              text: r.messages
                .filter((m) => m.role === "system")
                .map((m) => m.content)
                .join("\n"),
            },
          ],
        },
        contents: r.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: budget(r.messages, info),
          ...(r.json ? { responseMimeType: "application/json" } : {}),
        },
      },
    );
    const text = data.candidates?.[0]?.content?.parts
      ?.filter((p: any) => !p.thought)
      .map((p: any) => p.text || "")
      .join("")
      .trim();
    if (!text) throw new Error("Gemini returned no usable answer.");
    return {
      text,
      model:
        typeof data.modelVersion === "string" ? data.modelVersion : r.model,
      family: info.family,
    };
  }
}
