import path from "path";
import { ProviderPool } from "./ProviderPool";
import { Secrets } from "./secrets";
import { OllamaProvider } from "./ollama";
import { GeminiProvider } from "./gemini";
import { OpenAICompatibleProvider } from "./openaiCompatible";
import type { Store } from "../Engine";
export function createPool(
  directory: string,
  store: () => Store,
  secrets = new Secrets(),
) {
  return new ProviderPool(
    {
      ollama: new OllamaProvider(() => store().settings),
      gemini: new GeminiProvider(() => secrets.get("gemini")),
      groq: new OpenAICompatibleProvider("groq", () => secrets.get("groq")),
      openrouter: new OpenAICompatibleProvider("openrouter", () =>
        secrets.get("openrouter"),
      ),
    },
    secrets,
    () => store().providers,
    path.join(directory, "provider-usage.json"),
  );
}
