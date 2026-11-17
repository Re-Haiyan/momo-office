// Editable protocol/catalog policy. Recheck linked official docs before changing IDs or quotas.
// Unknown/account-specific limits intentionally remain null, never guessed.
export const lastVerified = "2026-11-17";
export const providersConfig = {
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    auth: "x-goog-api-key",
    chat: "/models/{model}:generateContent",
    models: "/models",
    structured:
      "generationConfig.responseMimeType=application/json; responseJsonSchema supported by compatible models",
    streaming:
      "/models/{model}:streamGenerateContent?alt=sse (SSE); app uses non-streaming completions",
    limits: { rpm: null, rpd: null, timezone: "America/Los_Angeles" },
    quotaNote:
      "Project/model/account-specific RPM, TPM and RPD. RPD resets midnight Pacific; see AI Studio limits.",
    // Standard free input/output verified in pricing; intersect with live catalog, never guess a replacement.
    freeModels: ["gemini-3.8-flash"],
    docs: [
      "https://ai.google.dev/api/generate-content",
      "https://ai.google.dev/api/models",
      "https://ai.google.dev/gemini-api/docs/structured-output",
      "https://ai.google.dev/gemini-api/docs/rate-limits",
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://ai.google.dev/gemini-api/terms",
    ],
    keyURL: "https://aistudio.google.com/api-keys",
    privacy:
      "Free-tier prompts and responses may be used to improve Google products. Use an unbilled/free-tier project; the app cannot determine your billing tier.",
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    auth: "Authorization: Bearer",
    chat: "/chat/completions",
    models: "/models",
    structured:
      "response_format.type=json_object; json_schema availability is model-specific",
    streaming: "stream=true, SSE deltas (app uses non-streaming)",
    limits: { rpm: null, rpd: null, timezone: "UTC" },
    quotaNote:
      "Organization/model-specific RPM, RPD, TPM and TPD. Exact limits in Groq Console. Local day counter uses UTC.",
    // Current rate-limit table documents these chat models; use live context_window, no remembered sizes.
    freeModels: [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
    ],
    modelLimits: { rpm: 30, rpd: 1000 },
    outputLimits: {
      "openai/gpt-oss-120b": 65536,
      "openai/gpt-oss-20b": 65536,
      "qwen/qwen3.8-27b": 16384,
    } as Record<string, number>,
    docs: [
      "https://console.groq.com/docs/openai",
      "https://console.groq.com/docs/api-reference",
      "https://console.groq.com/docs/text-chat",
      "https://console.groq.com/docs/models",
      "https://console.groq.com/docs/structured-outputs",
      "https://console.groq.com/docs/rate-limits",
      "https://console.groq.com/docs/your-data",
    ],
    keyURL: "https://console.groq.com/keys",
    privacy:
      "Use a Free Plan account. Data retention and logging depend on Groq policies and account controls; review Your Data. The app cannot determine billing tier.",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    auth: "Authorization: Bearer",
    chat: "/chat/completions",
    models: "/models",
    structured:
      "response_format JSON object/schema only when advertised in supported_parameters",
    streaming: "stream=true, SSE (app uses non-streaming)",
    limits: { rpm: null, rpd: null, timezone: "UTC" },
    quotaNote:
      "Free limits depend on account credit history. Read free_model_daily_requests from GET /key; documentation table values unavailable at verification. Local day counter uses UTC. Honor 429 Retry-After.",
    freeModels: [] as string[], // Discovered dynamically: explicit :free AND every advertised price zero.
    docs: [
      "https://openrouter.ai/docs/api/reference/overview",
      "https://openrouter.ai/docs/api-reference/models/get-models",
      "https://openrouter.ai/docs/guides/features/structured-outputs",
      "https://openrouter.ai/docs/api/reference/streaming",
      "https://openrouter.ai/docs/api/reference/limits",
      "https://openrouter.ai/docs/guides/routing/model-variants/free",
      "https://openrouter.ai/docs/guides/routing/provider-selection",
      "https://openrouter.ai/docs/guides/privacy/data-collection",
    ],
    keyURL: "https://openrouter.ai/settings/keys",
    privacy:
      "Prompts pass through OpenRouter to third-party model hosts. Logging, retention and training policies vary by host. Free availability is not guaranteed.",
  },
} as const;
// Independent allowlist prevents a config typo or redirects sending credentials to another host.
export const allowedBases = new Set([
  "https://generativelanguage.googleapis.com/v1beta",
  "https://api.groq.com/openai/v1",
  "https://openrouter.ai/api/v1",
]);
