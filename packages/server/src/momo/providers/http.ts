import { allowedBases } from "./providers.config";
import { ProviderError } from "./types";
export async function request(
  base: string,
  route: string,
  key: string,
  header: string,
  signal: AbortSignal,
  body?: unknown,
) {
  if (
    !allowedBases.has(base) ||
    !route.startsWith("/") ||
    route.includes("://")
  )
    throw new Error("Provider URL is not allowlisted.");
  if (!key) throw new Error("Provider key is missing.");
  let response: Response;
  try {
    response = await fetch(base + route, {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(240000)]),
      headers: {
        "Content-Type": "application/json",
        [header]: header === "Authorization" ? `Bearer ${key}` : key,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    signal.throwIfAborted();
    throw Object.assign(
      new Error("Provider connection interrupted or timed out."),
      { retryable: true },
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProviderError(
      response.status,
      response.headers.get("retry-after"),
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Provider returned an invalid response.");
  }
}
