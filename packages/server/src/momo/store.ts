import type { Store } from "./Engine";
export const STORE_VERSION = 3;
export class NewerStoreError extends Error {}
export function migrate(value: any): Store {
  if (!value || !Number.isInteger(value.version))
    throw new Error("Invalid saved store.");
  if (value.version > STORE_VERSION)
    throw new NewerStoreError(
      "Saved data belongs to a newer Momo Office version. Update the app; this file has not been changed.",
    );
  if (
    value.version < 1 ||
    !Array.isArray(value.agents) ||
    !Array.isArray(value.runs) ||
    !Array.isArray(value.skills) ||
    !value.settings
  )
    throw new Error("Invalid saved store.");
  const saved = structuredClone(value);
  if (saved.version === 1) {
    for (const a of saved.agents)
      if (typeof a.model === "string")
        a.model = { provider: "ollama", model: a.model };
    saved.version = 2;
  }
  if (saved.version === 2) {
    saved.settings.numCtx = 8192;
    saved.version = 3;
  }
  saved.settings.numCtx ??= 8192;
  saved.settings.timeoutMs ??= 240000;
  saved.settings.idleTimeoutMs ??= 90000;
  saved.settings.temperature ??= 0.35;
  saved.settings.numPredict ??= 2048;
  saved.settings.keepAlive ??= "10m";
  saved.settings.finalMode ??= "assemble";
  saved.settings.search ??= { provider: "duckduckgo" };
  return saved;
}
