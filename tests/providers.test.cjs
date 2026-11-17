const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  ProviderPool,
  defaultProviderSettings,
} = require("../packages/server/dist/momo/providers/ProviderPool");
const {
  ProviderError,
  family,
  budget,
} = require("../packages/server/dist/momo/providers/types");
const { Secrets } = require("../packages/server/dist/momo/providers/secrets");
const { MomoEngine } = require("../packages/server/dist/momo/Engine");
const {
  GeminiProvider,
} = require("../packages/server/dist/momo/providers/gemini");
const {
  OpenAICompatibleProvider,
  isFreeModel,
} = require("../packages/server/dist/momo/providers/openaiCompatible");
const { request } = require("../packages/server/dist/momo/providers/http");
const { Credentials } = require("../desktop/credentials.cjs");
const ids = ["ollama", "gemini", "groq", "openrouter"];
const ref = (provider, model) => ({
  provider,
  model:
    model ||
    {
      ollama: "llama-local",
      gemini: "gemini-test",
      groq: "qwen-test",
      openrouter: "mistral/test:free",
    }[provider],
});
const chain = ["gemini", "groq", "openrouter", "ollama"].map((id) => ref(id));
const req = () => ({
  messages: [{ role: "user", content: "Test" }],
  signal: new AbortController().signal,
});
function fixture(overrides = {}, options = {}) {
  const calls = [];
  const settings = defaultProviderSettings();
  for (const id of ids.slice(1))
    Object.assign(settings[id], {
      enabled: true,
      consented: true,
      dailyCap: 50,
    });
  const secrets = new Secrets(false, {
    gemini: "mock-gemini-secret",
    groq: "mock-groq-secret",
    openrouter: "mock-openrouter-secret",
  });
  const providers = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        limits: () => ({ rpm: 30, rpd: 100, timezone: "UTC" }),
        check: async () => true,
        listModels: async () => [
          {
            id: ref(id).model,
            family: family(ref(id).model),
            contextWindow: 10000,
            outputLimit: 2048,
            json: true,
            code: true,
          },
        ],
        complete: async (r) => {
          calls.push([id, r.model]);
          if (overrides[id]) return overrides[id](r);
          return { text: "answer", model: r.model, family: family(r.model) };
        },
      },
    ]),
  );
  const pool = new ProviderPool(
    providers,
    secrets,
    () => settings,
    options.file,
    options.now,
  );
  return { pool, settings, secrets, calls, providers };
}
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "momo-providers-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
async function settle(engine) {
  for (let i = 0; i < 200; i++) {
    const r = engine.snapshot().runs.at(-1);
    if (r && ["completed", "failed", "needs_input"].includes(r.status))
      return r;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("Run did not settle");
}
test("fallbacks preserve order and end in Ollama, recording actual response identity", async () => {
  const f = fixture({
    gemini: () => {
      throw Error("unavailable");
    },
    groq: () => {
      throw Error("unavailable");
    },
    openrouter: () => {
      throw Error("unavailable");
    },
  });
  const a = await f.pool.complete(chain, req(), false);
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    ids.slice(1).concat("ollama"),
  );
  assert.equal(a.provider, "ollama");
  assert.equal(a.model, "llama-local");
});
test("429 Retry-After seconds cools down whole provider and moves on immediately", async () => {
  let now = Date.UTC(2026, 0, 1);
  const f = fixture(
    {
      gemini: () => {
        throw new ProviderError(429, "120");
      },
    },
    { now: () => now },
  );
  assert.equal((await f.pool.complete(chain, req(), false)).provider, "groq");
  assert.equal(f.pool.status("gemini").cooldownUntil, now + 120000);
  await f.pool.complete(chain, req(), false);
  assert.equal(f.calls.filter((c) => c[0] === "gemini").length, 1);
  now += 120001;
  await f.pool.complete(chain, req(), false);
  assert.equal(f.calls.filter((c) => c[0] === "gemini").length, 2);
});
test("Retry-After HTTP-date and persisted daily cap survive restart", async (t) => {
  const file = path.join(directory(t), "usage.json");
  const now = Date.UTC(2026, 0, 1);
  const f = fixture(
    {
      gemini: () => {
        throw new ProviderError(429, new Date(now + 90000).toUTCString());
      },
    },
    { file, now: () => now },
  );
  await f.pool.complete(chain, req(), false);
  assert.equal(f.pool.status("gemini").cooldownUntil, now + 90000);
  const g = fixture({}, { file, now: () => now });
  g.settings.groq.dailyCap = 1;
  assert.equal(
    (await g.pool.complete(chain, req(), false)).provider,
    "openrouter",
  );
  assert.equal(
    g.calls.some((c) => c[0] === "groq"),
    false,
  );
});
test("user daily cap, minute cap and day rollover gate calls before inference", async () => {
  let now = Date.UTC(2026, 0, 1);
  const f = fixture({}, { now: () => now });
  f.settings.gemini.dailyCap = 1;
  await f.pool.complete(chain, req(), false);
  await f.pool.complete(chain, req(), false);
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    ["gemini", "groq"],
  );
  now += 86400000;
  await f.pool.complete(chain, req(), false);
  assert.equal(f.calls.at(-1)[0], "gemini");
  f.settings.groq.rpm = 1;
  await f.pool.complete([ref("groq"), ref("ollama")], req(), false);
  await f.pool.complete([ref("groq"), ref("ollama")], req(), false);
  assert.equal(f.calls.at(-1)[0], "ollama");
});
test("Local only never invokes cloud completion, metadata, check or key access", async () => {
  const f = fixture();
  for (const id of ids.slice(1))
    for (const method of ["complete", "listModels", "check", "limits"])
      f.providers[id][method] = () => {
        throw Error("Cloud method called");
      };
  const get = f.secrets.get.bind(f.secrets);
  f.secrets.get = (id) => {
    throw Error("Cloud key accessed");
  };
  const a = await f.pool.complete(chain, req(), true, [ref("groq")], true);
  assert.equal(a.provider, "ollama");
  assert.deepEqual(f.calls, [["ollama", "llama-local"]]);
});
test("disabled and unconsented cloud never receives a prompt", async () => {
  const f = fixture();
  f.settings.gemini.enabled = false;
  f.settings.groq.consented = false;
  f.settings.openrouter.dailyCap = 0;
  assert.equal((await f.pool.complete(chain, req(), false)).provider, "ollama");
  assert.equal(f.calls.length, 1);
});
test("transient failure retries once, abort stops chain without sending later prompts", async () => {
  let count = 0;
  const f = fixture({
    gemini: (r) => {
      if (!count++)
        throw Object.assign(Error("temporary"), { retryable: true });
      return { text: "ok", model: r.model, family: "gemini" };
    },
  });
  await f.pool.complete(chain, req(), false);
  assert.equal(f.calls.length, 2);
  const controller = new AbortController();
  const g = fixture({
    gemini: () => {
      controller.abort();
      throw Error("aborted");
    },
  });
  await assert.rejects(
    g.pool.complete(chain, { ...req(), signal: controller.signal }, false),
  );
  assert.equal(g.calls.length, 1);
});
test("Echo chooses an OpenRouter free reviewer from a different known family", async () => {
  const f = fixture();
  f.providers.openrouter.listModels = async () => [
    { id: "qwen/test:free", family: "qwen", json: true },
    { id: "mistral/test:free", family: "mistral", json: true },
  ];
  const a = await f.pool.complete(
    [ref("openrouter", "qwen/test:free"), ref("gemini"), ref("ollama")],
    req(),
    false,
    [ref("groq", "qwen-author")],
    true,
  );
  assert.equal(a.provider, "openrouter");
  assert.equal(a.model, "mistral/test:free");
  assert.equal(a.warning, undefined);
});
test("same-model-only reviewer records warning and unknown families never claim independence", async () => {
  const f = fixture();
  const a = await f.pool.complete(
    [ref("ollama")],
    req(),
    true,
    [ref("ollama")],
    true,
  );
  assert.match(a.warning, /shares a model family/);
  const b = await f.pool.complete(
    [ref("ollama", "opaque-model")],
    req(),
    true,
    [ref("groq", "opaque-author")],
    true,
  );
  assert.match(b.warning, /could not be verified/);
});
test("keys never escape provider errors, successful output, snapshots, JSON or Markdown exports", async (t) => {
  const f = fixture({
    gemini: () => {
      throw Error("mock-gemini-secret");
    },
  });
  f.providers.ollama.complete = async (r) => ({
    text: "mock-groq-secret output",
    model: r.model,
    family: "llama",
  });
  const result = await f.pool.complete(
    [ref("gemini"), ref("ollama")],
    req(),
    false,
  );
  assert.equal(result.text, "[REDACTED] output");
  f.providers.ollama.complete = async () => {
    throw Error("mock-openrouter-secret");
  };
  await assert.rejects(
    f.pool.complete([ref("gemini"), ref("ollama")], req(), false),
    (e) => !e.message.includes("secret"),
  );
  const dir = directory(t);
  const engine = new MomoEngine(
    dir,
    async (messages, _s, _signal, json) =>
      json
        ? JSON.stringify(
            messages[0].content.includes("QUALITY_REVIEW")
              ? { approved: true, feedback: "mock-gemini-secret" }
              : { tasks: [{ agentId: "pip", title: "mock-groq-secret" }] },
          )
        : "mock-openrouter-secret",
    f.pool,
  );
  engine.submit("Prompt mock-gemini-secret");
  const run = await settle(engine);
  assert.equal(run.status, "completed");
  for (const content of [
    JSON.stringify(engine.snapshot()),
    engine.markdown(run),
    fs.readFileSync(path.join(dir, "momo-office.json"), "utf8"),
    ...fs
      .readdirSync(path.join(dir, "results"))
      .map((file) => fs.readFileSync(path.join(dir, "results", file), "utf8")),
  ])
    assert.doesNotMatch(content, /mock-(gemini|groq|openrouter)-secret/);
  await engine.shutdown();
});
test("v1 string model store migrates to provider refs and local fallback without enabling cloud", async (t) => {
  const dir = directory(t);
  let e = new MomoEngine(dir, async () => "");
  const saved = e.snapshot();
  await e.shutdown();
  saved.version = 1;
  delete saved.providers;
  for (const a of saved.agents) {
    a.model = "legacy:7b";
    delete a.fallbackChain;
  }
  fs.writeFileSync(path.join(dir, "momo-office.json"), JSON.stringify(saved));
  e = new MomoEngine(dir, async () => "");
  assert.equal(e.snapshot().version, 3);
  assert.ok(
    e
      .snapshot()
      .agents.every(
        (a) =>
          a.model.provider === "ollama" &&
          a.model.model === "legacy:7b" &&
          a.fallbackChain.at(-1).provider === "ollama",
      ),
  );
  assert.ok(Object.values(e.snapshot().providers).every((p) => !p.enabled));
  await e.shutdown();
});
test("auto-assign previews correct role chains without saving until apply", async (t) => {
  const f = fixture();
  const e = new MomoEngine(directory(t), undefined, f.pool);
  for (const p of Object.values(e.store.providers))
    Object.assign(p, { enabled: true, consented: true, dailyCap: 10 });
  const before = e.snapshot().agents;
  const preview = await e.autoAssign();
  assert.deepEqual(e.snapshot().agents, before);
  const order = (id) =>
    preview.agents
      .find((a) => a.id === id)
      .fallbackChain.map((r) => r.provider);
  assert.deepEqual(order("momo"), ["gemini", "openrouter", "ollama"]);
  assert.deepEqual(order("pip"), ["groq", "gemini", "ollama"]);
  assert.deepEqual(order("sage"), ["gemini", "groq", "ollama"]);
  assert.deepEqual(order("echo"), ["openrouter", "gemini", "ollama"]);
  for (const id of ["luna", "nova", "coco", "atlas"])
    assert.deepEqual(order(id), ["groq", "gemini", "ollama"]);
  e.applyAssignments(preview.agents);
  assert.equal(
    e.snapshot().agents.find((a) => a.id === "momo").model.provider,
    "gemini",
  );
  await e.shutdown();
});
test("per-step and review provenance reports actual fallback models and Local only inherits on follow-up", async (t) => {
  const f = fixture();
  f.providers.ollama.complete = async (r) => ({
    text: r.json
      ? JSON.stringify(
          r.messages[0].content.includes("QUALITY_REVIEW")
            ? { approved: false, needsInput: true, feedback: "Need data" }
            : { tasks: [{ agentId: "pip", title: "Code" }] },
        )
      : "proposal",
    model: "llama-actual",
    family: "llama",
  });
  const e = new MomoEngine(directory(t), undefined, f.pool);
  e.store.agents.forEach((a) => {
    a.fallbackChain = chain;
    a.model = chain[0];
  });
  e.submit("Test", undefined, true);
  const run = await settle(e);
  assert.equal(run.status, "needs_input");
  assert.ok(
    run.answers.every(
      (a) => a.provider === "ollama" && a.model === "llama-actual",
    ),
  );
  assert.equal(run.steps[0].answers[0].stage, "working");
  assert.ok(run.warnings.length);
  e.submit("more data", run.id, false);
  const next = await settle(e);
  assert.equal(next.localOnly, true);
  assert.ok(f.calls.every((c) => c[0] === "ollama"));
  await e.shutdown();
});
test("OpenRouter free filtering rejects paid, missing-price, and non-free aliases", () => {
  assert.equal(
    isFreeModel({
      id: "qwen/x:free",
      pricing: { prompt: "0", completion: "0", request: "0" },
    }),
    true,
  );
  for (const m of [
    { id: "qwen/x", pricing: { prompt: "0", completion: "0" } },
    { id: "qwen/x:free", pricing: { prompt: "0", completion: "0.1" } },
    {
      id: "qwen/x:free",
      pricing: { prompt: "0", completion: "0", request: "1" },
    },
    { id: "qwen/x:free", pricing: {} },
  ])
    assert.equal(Boolean(isFreeModel(m)), false);
});
test("cloud adapters serialize auth, JSON mode, native Gemini roles and zero-price routing using mocked fetch", async (t) => {
  const calls = [];
  const original = global.fetch;
  t.after(() => (global.fetch = original));
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/key"))
      return Response.json({
        data: {
          free_model_daily_requests: { limit: 50, used: 1, remaining: 49 },
        },
      });
    const model = options.body && JSON.parse(options.body).model;
    if (url.endsWith("/models"))
      return Response.json(
        url.includes("googleapis")
          ? {
              models: [
                {
                  name: "models/gemini-3.8-flash",
                  supportedGenerationMethods: ["generateContent"],
                  inputTokenLimit: 10000,
                  outputTokenLimit: 1000,
                },
              ],
            }
          : {
              data: [
                {
                  id: "mistral/test:free",
                  pricing: { prompt: "0", completion: "0" },
                  context_length: 10000,
                  top_provider: { max_completion_tokens: 1000 },
                  supported_parameters: ["response_format"],
                },
              ],
            },
      );
    return Response.json(
      url.includes("googleapis")
        ? {
            modelVersion: "gemini-3.8-flash",
            candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
          }
        : { model, choices: [{ message: { content: '{"ok":true}' } }] },
    );
  };
  const gemini = new GeminiProvider(() => "fake-key");
  await gemini.complete({ ...req(), model: "gemini-3.8-flash", json: true });
  const geminiCall = calls.find(
    (c) => c.options.body && c.url.includes("googleapis"),
  );
  assert.equal(geminiCall.options.headers["x-goog-api-key"], "fake-key");
  assert.equal(
    JSON.parse(geminiCall.options.body).generationConfig.responseMimeType,
    "application/json",
  );
  const or = new OpenAICompatibleProvider("openrouter", () => "fake-key");
  await or.complete({ ...req(), model: "mistral/test:free", json: true });
  const c = calls.at(-1);
  assert.equal(c.options.headers.Authorization, "Bearer fake-key");
  const body = JSON.parse(c.options.body);
  assert.deepEqual(body.provider.max_price, {
    prompt: 0,
    completion: 0,
    request: 0,
  });
  assert.equal(body.provider.allow_fallbacks, false);
  assert.equal(body.max_tokens, 1000);
});
test("allowlist rejects malicious base before fetch and HTTP errors never include reflected keys", async (t) => {
  const original = global.fetch;
  t.after(() => (global.fetch = original));
  let count = 0;
  global.fetch = async () => {
    count++;
    return new Response("fake-key reflected", { status: 401 });
  };
  await assert.rejects(
    request(
      "https://evil.test",
      "/chat",
      "fake-key",
      "Authorization",
      req().signal,
    ),
    /allowlisted/,
  );
  assert.equal(count, 0);
  await assert.rejects(
    request(
      "https://api.groq.com/openai/v1",
      "/chat",
      "fake-key",
      "Authorization",
      req().signal,
    ),
    (e) => !e.message.includes("fake-key"),
  );
});
test("context budgeting rejects oversize inputs and respects actual model output limit", () => {
  assert.equal(
    budget(req().messages, { contextWindow: 20000, outputLimit: 512 }),
    512,
  );
  assert.throws(
    () =>
      budget([{ role: "user", content: "x".repeat(10000) }], {
        contextWindow: 1000,
        outputLimit: 500,
      }),
    /context window/,
  );
});
test("desktop vault uses safeStorage ciphertext only and refuses unavailable OS encryption", (t) => {
  const file = path.join(directory(t), "vault.json");
  const key = "fake-api-key";
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s.split("").reverse().join("")),
    decryptString: (b) => b.toString().split("").reverse().join(""),
  };
  const vault = new Credentials(file, storage);
  assert.deepEqual(vault.set("gemini", key), { hasKey: true });
  assert.equal(vault.get("gemini"), key);
  assert.ok(!fs.readFileSync(file, "utf8").includes(key));
  assert.throws(() => vault.set("bad", key), /Invalid/);
  vault.set("gemini", "");
  assert.equal(vault.get("gemini"), "");
  assert.throws(
    () =>
      new Credentials(file, { isEncryptionAvailable: () => false }).set(
        "gemini",
        key,
      ),
    /unavailable/,
  );
});
