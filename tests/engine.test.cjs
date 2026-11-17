const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, readdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { MomoEngine } = require("../packages/server/dist/momo/Engine");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function settled(engine) {
  for (let n = 0; n < 150; n++) {
    const run = engine.snapshot().runs.at(-1);
    if (
      [
        "completed",
        "completed_with_warnings",
        "failed",
        "cancelled",
        "needs_input",
      ].includes(run?.status)
    )
      return run;
    await wait(10);
  }
  throw Error("run did not settle");
}
function fixture(t, complete, review) {
  const dir = mkdtempSync(path.join(tmpdir(), "momo-test-"));
  const engine = new MomoEngine(dir, (messages, settings, signal, json) => {
    if (json && messages[0].content.includes("QUALITY_REVIEW"))
      return Promise.resolve(
        review
          ? review(messages, settings)
          : JSON.stringify({
              approved: true,
              needsInput: false,
              feedback:
                "Work is supported and clearly labeled as a proposal where appropriate.",
            }),
      );
    return complete(messages, settings, signal, json);
  });
  t.after(async () => {
    await engine.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });
  return engine;
}
test("coordinator delegates, passes output between specialists, synthesizes and persists", async (t) => {
  let calls = [];
  let active = 0,
    max = 0;
  const engine = fixture(t, async (messages, settings, signal, json) => {
    max = Math.max(max, ++active);
    calls.push(messages);
    await wait(5);
    active--;
    if (json)
      return JSON.stringify({
        summary: "Research then draft",
        tasks: [
          { agentId: "sage", title: "Find the key facts" },
          { agentId: "luna", title: "Write the draft" },
        ],
      });
    return (
      ["", "", "Research facts", "Complete draft", "Final answer"][
        calls.length
      ] || "Research facts"
    );
  });
  const skill = engine.skill({
    name: "Brand voice",
    instructions: "Use a warm and precise tone.",
  });
  const luna = engine.store.agents.find((a) => a.id === "luna");
  engine.agent({ ...luna, skills: [...luna.skills, skill.id] }, "luna");
  const run = engine.submit("Write a launch announcement");
  assert.throws(() => engine.agent({ ...luna }, "luna"), /Finish or cancel/);
  const result = await settled(engine);
  assert.equal(result.status, "completed");
  assert.equal(result.steps.length, 2);
  assert.equal(max, 1);
  assert.ok(calls[2][1].content.includes(result.steps[0].output));
  assert.match(calls[2][0].content, /warm and precise/);
  assert.ok(result.result);
  assert.equal(readdirSync(path.join(engine.directory, "results")).length, 1);
  const restored = new MomoEngine(engine.directory, async () => {
    throw Error("not expected");
  });
  assert.equal(restored.snapshot().runs[0].result, result.result);
  await restored.shutdown();
});
test("rejects hallucinated teammate IDs without executing a worker", async (t) => {
  let calls = 0;
  const engine = fixture(t, async () => {
    calls++;
    return JSON.stringify({
      tasks: [{ agentId: "intruder", title: "Do something" }],
    });
  });
  engine.submit("Test");
  const result = await settled(engine);
  assert.equal(result.status, "failed");
  assert.match(result.error, /unknown teammate/);
  assert.equal(calls, 2);
});
test("only one queued request reaches the model at a time", async (t) => {
  let active = 0,
    max = 0;
  const engine = fixture(t, async (_messages, _settings, _signal, json) => {
    max = Math.max(max, ++active);
    await wait(10);
    active--;
    return json
      ? JSON.stringify({ tasks: [{ agentId: "pip", title: "Propose code" }] })
      : "A runnable proposal";
  });
  engine.submit("First");
  engine.submit("Second");
  for (
    let i = 0;
    i < 150 && engine.store.runs.some((r) => r.status !== "completed");
    i++
  )
    await wait(10);
  assert.equal(
    engine.store.runs.filter((r) => r.status === "completed").length,
    2,
  );
  assert.equal(max, 1);
});
test("cancellation aborts inference and keeps the next request runnable", async (t) => {
  let count = 0;
  const engine = fixture(t, async (_m, _s, signal, json) => {
    count++;
    if (count === 1)
      await new Promise((resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("cancelled", "AbortError")),
          { once: true },
        ),
      );
    return json
      ? JSON.stringify({ tasks: [{ agentId: "luna", title: "Write" }] })
      : "Done";
  });
  const first = engine.submit("Cancel me");
  engine.submit("Next");
  engine.cancel(first.id);
  for (let i = 0; i < 150 && engine.store.runs[1].status !== "completed"; i++)
    await wait(10);
  assert.equal(engine.store.runs[0].status, "cancelled");
  assert.equal(engine.store.runs[1].status, "completed");
});
test("disabled web permission never executes model-requested lookup", async (t) => {
  const original = global.fetch;
  let searches = 0;
  global.fetch = async () => {
    searches++;
    throw Error("unexpected network");
  };
  t.after(() => (global.fetch = original));
  const engine = fixture(t, async (_m, _s, _signal, json) =>
    json
      ? JSON.stringify({ tasks: [{ agentId: "pip", title: "Answer" }] })
      : JSON.stringify({ searchQuery: "untrusted request" }),
  );
  engine.submit("No network");
  const result = await settled(engine);
  assert.equal(result.status, "completed");
  assert.equal(searches, 0);
});
test("validates local-only model endpoint and retains the coordinator", async (t) => {
  const engine = fixture(t, async () => "unused");
  assert.throws(
    () => engine.settings({ model: "x", ollamaUrl: "https://example.com" }),
    /local Ollama/,
  );
  assert.throws(() => engine.removeAgent("momo"), /coordinator/);
  assert.throws(
    () => engine.agent({ name: "Luna", role: "Duplicate" }),
    /unique/,
  );
});

test("all meeting, coffee and reading seats are reachable without crossing walls", () => {
  const {
    officeLayout,
    findOfficePath,
    walkable,
  } = require("../packages/server/dist/momo/OfficeLayout");
  for (const from of officeLayout.desks)
    for (const to of [
      ...officeLayout.meetingSeats,
      ...officeLayout.coffeeSeats,
      ...officeLayout.loungeSeats,
      ...officeLayout.readingSeats,
    ]) {
      const route = findOfficePath(from, to);
      assert.ok(
        route.length,
        `No route from ${JSON.stringify(from)} to ${JSON.stringify(to)}`,
      );
      let previous = from;
      for (const cell of route) {
        assert.equal(walkable(cell), true);
        assert.equal(
          Math.abs(previous.x - cell.x) + Math.abs(previous.y - cell.y),
          1,
        );
        previous = cell;
      }
      assert.deepEqual(route.at(-1), to);
    }
});

test("independent review requests a bounded correction before approval", async (t) => {
  let reviews = 0;
  const engine = fixture(
    t,
    async (messages, _settings, _signal, json) => {
      if (json)
        return JSON.stringify({
          tasks: [{ agentId: "pip", title: "Propose a solution" }],
        });
      if (messages[0].content.includes("A teammate reviewed"))
        return "Proposed code. It has not been executed.";
      if (messages[0].content.includes("Review and combine"))
        return "A corrected, untested code proposal.";
      return "Tests passed and I executed the code.";
    },
    (messages) => {
      reviews++;
      return JSON.stringify({
        approved: reviews > 1,
        needsInput: false,
        feedback:
          reviews === 1
            ? "Remove the unsupported execution claim; label it as an untested proposal."
            : "Corrected proposal is explicit about its limits.",
        agentId: "pip",
      });
    },
  );
  engine.submit("Write a code proposal");
  const result = await settled(engine);
  assert.equal(result.status, "completed");
  assert.equal(reviews, 2);
  assert.equal(result.review.revisions, 1);
  assert.match(result.steps[0].output, /not been executed/);
});
test("missing evidence pauses for input and a reply carries earlier work forward", async (t) => {
  let reviews = 0;
  let planningPrompts = [];
  const engine = fixture(
    t,
    async (messages, _settings, _signal, json) => {
      if (json) {
        planningPrompts.push(messages[1].content);
        return JSON.stringify({
          tasks: [{ agentId: "atlas", title: "Analyze supplied data" }],
        });
      }
      return "Analysis proposal based only on the supplied numbers.";
    },
    () =>
      JSON.stringify({
        approved: ++reviews > 1,
        needsInput: reviews === 1,
        feedback:
          reviews === 1
            ? "Please provide the revenue numbers."
            : "Data is now available.",
      }),
  );
  const first = engine.submit("Analyze my revenue");
  let result = await settled(engine);
  assert.equal(result.status, "needs_input");
  assert.ok(result.steps[0].output);
  assert.match(result.result, /revenue numbers/);
  engine.submit("The revenue numbers are 10 and 20.", first.id);
  result = await settled(engine);
  assert.equal(result.status, "completed");
  assert.match(planningPrompts[1], /Analyze my revenue/);
  assert.match(planningPrompts[1], /10 and 20/);
});
test("transient model failure is retried once and work continues", async (t) => {
  let attempts = 0;
  const engine = fixture(t, async (messages, _settings, _signal, json) => {
    if (json)
      return JSON.stringify({
        tasks: [{ agentId: "luna", title: "Write a draft" }],
      });
    if (!messages[0].content.includes("Review and combine") && ++attempts === 1)
      throw new TypeError("fetch failed");
    return "Recovered draft";
  });
  engine.submit("Write a short draft");
  const result = await settled(engine);
  assert.equal(result.status, "completed");
  assert.equal(attempts, 2);
});

test("planner, specialist, correction and reviewer use their assigned local models", async (t) => {
  const calls = [];
  let reviews = 0;
  const engine = fixture(
    t,
    async (messages, settings, _signal, json) => {
      calls.push(settings.model);
      return json
        ? JSON.stringify({ tasks: [{ agentId: "pip", title: "Propose code" }] })
        : "Untested code proposal";
    },
    (_messages, settings) => {
      calls.push(settings.model);
      return JSON.stringify({
        approved: ++reviews > 1,
        needsInput: false,
        feedback: "Clarify assumptions in the proposal.",
        agentId: "pip",
      });
    },
  );
  for (const [id, model] of [
    ["momo", "general-model:7b"],
    ["pip", "code-model:7b"],
    ["echo", "review-model:7b"],
  ])
    engine.agent(
      { ...engine.store.agents.find((a) => a.id === id), model },
      id,
    );
  engine.submit("Propose a program");
  const result = await settled(engine);
  assert.equal(result.status, "completed");
  assert.deepEqual(calls, [
    "general-model:7b",
    "code-model:7b",
    "review-model:7b",
    "code-model:7b",
    "review-model:7b",
    "general-model:7b",
  ]);
  engine.agent(
    { ...engine.store.agents.find((a) => a.id === "pip"), model: "" },
    "pip",
  );
  assert.deepEqual(engine.store.agents.find((a) => a.id === "pip").model, {
    provider: "ollama",
    model: engine.store.settings.model,
  });
  assert.throws(
    () =>
      engine.agent(
        {
          ...engine.store.agents.find((a) => a.id === "pip"),
          model: "bad model name",
        },
        "pip",
      ),
    /Invalid provider or model/,
  );
});

test("budget trims oldest evidence before context and never the system/current assignment", () => {
  const {
    budgetMessages,
    outputBlock,
    contextBlock,
  } = require("../packages/server/dist/momo/budget");
  const input = [
    { role: "system", content: "SYSTEM KEEP" },
    {
      role: "user",
      content:
        contextBlock("context ".repeat(600)) +
        "CURRENT ASSIGNMENT KEEP" +
        outputBlock("old ".repeat(4000)) +
        outputBlock("recent evidence"),
    },
  ];
  const b = budgetMessages(input, 4096, 2048);
  assert.equal(b.trimmed, true);
  assert.equal(b.messages[0].content, "SYSTEM KEEP");
  assert.ok(b.messages[1].content.includes("CURRENT ASSIGNMENT KEEP"));
  assert.ok(b.messages[1].content.includes("recent evidence"));
  assert.ok(b.tokens <= 4096);
  assert.ok(input[1].content.length > b.messages[1].content.length);
  assert.throws(
    () =>
      budgetMessages(
        [{ role: "system", content: "x".repeat(20000) }],
        2048,
        2048,
      ),
    /system prompt and current assignment/,
  );
});
test("corrupt stores are backed up, version migrations run, newer files never overwritten", async (t) => {
  const fs = require("node:fs");
  const dir = mkdtempSync(path.join(tmpdir(), "momo-corrupt-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "momo-office.json");
  fs.writeFileSync(file, "{bad");
  const e = new MomoEngine(dir, async () => "");
  assert.match(e.snapshot().notice, /backup/);
  const backup = readdirSync(dir).find((f) => f.includes(".corrupt-"));
  assert.equal(readFileSync(path.join(dir, backup), "utf8"), "{bad");
  assert.equal(e.snapshot().settings.numCtx, 8192);
  await e.shutdown();
  const newer = JSON.stringify({ ...e.snapshot(), version: 999 });
  fs.writeFileSync(file, newer);
  assert.throws(() => new MomoEngine(dir, async () => ""), /newer/);
  assert.equal(readFileSync(file, "utf8"), newer);
});
test("startup cleans orphan result Markdown, pruning deletes results for removed runs", async (t) => {
  const fs = require("node:fs");
  const e = fixture(t, async (_m, _s, _signal, json) =>
    json
      ? JSON.stringify({ tasks: [{ agentId: "pip", title: "Work" }] })
      : "result",
  );
  const r = e.submit("First");
  await settled(e);
  const results = path.join(e.directory, "results");
  assert.ok(fs.existsSync(path.join(results, r.id + ".md")));
  for (let i = 0; i < 50; i++)
    e.store.runs.push({
      ...e.store.runs[0],
      id: require("node:crypto").randomUUID(),
    });
  e.submit("Prune");
  await settled(e);
  assert.ok(!fs.existsSync(path.join(results, r.id + ".md")));
  await e.shutdown();
  fs.writeFileSync(path.join(results, "orphan.md"), "orphan");
  fs.writeFileSync(path.join(results, "keep.txt"), "keep");
  const fresh = new MomoEngine(e.directory, async () => "");
  assert.ok(!fs.existsSync(path.join(results, "orphan.md")));
  assert.ok(fs.existsSync(path.join(results, "keep.txt")));
  await fresh.shutdown();
});
test("review rejection after one revision completes with warnings unless needsInput is explicit", async (t) => {
  const e = fixture(
    t,
    async (_m, _s, _signal, json) =>
      json
        ? JSON.stringify({ tasks: [{ agentId: "pip", title: "Work" }] })
        : "proposal",
    () =>
      JSON.stringify({
        approved: false,
        needsInput: false,
        feedback: "Check assumptions",
        agentId: "pip",
      }),
  );
  e.submit("Proposal");
  const run = await settled(e);
  assert.equal(run.status, "completed_with_warnings");
  assert.ok(run.warnings.includes("Check assumptions"));
  assert.match(e.markdown(run), /completed_with_warnings/);
  assert.ok(fsExists(path.join(e.directory, "results", run.id + ".md")));
});
function fsExists(file) {
  return require("node:fs").existsSync(file);
}

test("plan schema validation retries once with the validation error and enforces earlier dependencies", async (t) => {
  let planCalls = 0;
  const schemas = [];
  const e = fixture(t, async (messages, _settings, _signal, json) => {
    if (json) {
      schemas.push(json);
      if (++planCalls === 1)
        return JSON.stringify({
          tasks: [
            { agentId: "pip", title: "Invalid dependency", dependsOn: [1] },
          ],
        });
      assert.match(
        messages.at(-1).content,
        /failed validation:.*earlier task indexes/,
      );
      return JSON.stringify({
        tasks: [{ agentId: "pip", title: "Code", dependsOn: [] }],
      });
    }
    return "proposal";
  });
  e.submit("Code");
  assert.equal((await settled(e)).status, "completed");
  assert.equal(planCalls, 2);
  assert.equal(schemas[0].properties.tasks.maxItems, 5);
});
test("dependsOn scopes specialist evidence and assemble preserves code verbatim", async (t) => {
  const code = '```js\nconst exact = "keep me";\n```';
  let pipCalls = 0;
  const e = fixture(t, async (messages, _settings, _signal, json) => {
    if (json)
      return JSON.stringify({
        tasks: [
          { agentId: "pip", title: "First" },
          { agentId: "luna", title: "Second", dependsOn: [] },
          { agentId: "pip", title: "Third", dependsOn: [0] },
        ],
      });
    if (messages[0].content.includes("You are Luna")) {
      assert.ok(!messages[1].content.includes(code));
      return "Independent prose";
    }
    if (messages[0].content.includes("You are Pip")) {
      if (pipCalls++) {
        assert.ok(messages[1].content.includes(code));
        assert.ok(!messages[1].content.includes("Independent prose"));
      }
      return code;
    }
    return "Short intro";
  });
  e.submit("Build");
  const r = await settled(e);
  assert.equal(r.status, "completed");
  assert.ok(r.result.includes(code));
  assert.ok(r.result.includes("Independent prose"));
  const {
    summarizeOutput,
    validatePlan,
  } = require("../packages/server/dist/momo/planner");
  assert.ok(summarizeOutput("x".repeat(5000) + code).includes(code));
  assert.throws(
    () =>
      validatePlan({ tasks: [{ agentId: "pip", title: "", dependsOn: [] }] }, [
        "pip",
      ]),
    /empty title/,
  );
});
test("invalid review booleans retry with actionable validation feedback", async (t) => {
  let calls = 0;
  const e = fixture(
    t,
    async (_m, _s, _signal, json) =>
      json
        ? JSON.stringify({ tasks: [{ agentId: "pip", title: "Work" }] })
        : "proposal",
    (messages) => {
      if (++calls === 1)
        return JSON.stringify({
          approved: "yes",
          needsInput: false,
          feedback: "bad",
        });
      assert.match(messages.at(-1).content, /must both be booleans/);
      return JSON.stringify({
        approved: true,
        needsInput: false,
        feedback: "ok",
      });
    },
  );
  e.submit("Work");
  assert.equal((await settled(e)).status, "completed");
  assert.equal(calls, 2);
});
test("search settings allow only configured local SearXNG and validated providers", () => {
  const { validateSearch } = require("../packages/server/dist/momo/search");
  assert.deepEqual(
    validateSearch({ provider: "searxng", url: "http://127.0.0.1:8888" }),
    { provider: "searxng", url: "http://127.0.0.1:8888" },
  );
  assert.throws(
    () => validateSearch({ provider: "searxng", url: "https://remote.test" }),
    /local loopback/,
  );
  assert.throws(
    () => validateSearch({ provider: "arbitrary" }),
    /Invalid search/,
  );
});

test("resume reuses completed steps, restarts the failed step, and does not replan", async (t) => {
  let plans = 0,
    pip = 0,
    luna = 0,
    fail = true;
  const e = fixture(t, async (messages, _s, _signal, json) => {
    if (json) {
      plans++;
      return JSON.stringify({
        tasks: [
          { agentId: "pip", title: "First" },
          { agentId: "luna", title: "Second" },
        ],
      });
    }
    if (messages[0].content.includes("You are Pip")) {
      pip++;
      return "First completed";
    }
    if (messages[0].content.includes("You are Luna")) {
      luna++;
      if (fail) throw new Error("intentional failure");
      return "Recovered second";
    }
    return "Intro";
  });
  const submitted = e.submit("Two steps");
  let r = await settled(e);
  assert.equal(r.status, "failed");
  assert.equal(r.resumable, true);
  assert.equal(r.steps[0].status, "completed");
  fail = false;
  e.resume(submitted.id);
  r = await settled(e);
  assert.equal(r.status, "completed");
  assert.equal(plans, 1);
  assert.equal(pip, 1);
  assert.equal(luna, 2);
  assert.equal(e.snapshot().runs.length, 1);
});
test("mock streaming completions expose and persist partial work and cancel mid-stream", async (t) => {
  let partial;
  const e = fixture(
    t,
    async (_messages, _settings, signal, json, onPartial) => {
      if (json)
        return JSON.stringify({ tasks: [{ agentId: "pip", title: "Stream" }] });
      onPartial?.("Partial work");
      partial = true;
      await new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
      return "";
    },
  );
  // fixture forwards the optional partial callback just like the real provider.
  const original = e.complete;
  e.complete = (messages, settings, signal, json, onPartial) =>
    json
      ? original(messages, settings, signal, json, onPartial)
      : Promise.resolve().then(() => {
          onPartial("Partial work");
          partial = true;
          return new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            }),
          );
        });
  const r = e.submit("Stream");
  for (let n = 0; n < 50 && !partial; n++) await wait(10);
  assert.equal(e.snapshot().runs[0].steps[0].output, "Partial work");
  for (let n = 0; n < 100; n++) {
    try {
      if (
        readFileSync(
          path.join(e.directory, "momo-office.json"),
          "utf8",
        ).includes("Partial work")
      )
        break;
    } catch {}
    await wait(10);
  }
  assert.match(
    readFileSync(path.join(e.directory, "momo-office.json"), "utf8"),
    /Partial work/,
  );
  e.cancel(r.id);
  assert.equal((await settled(e)).status, "cancelled");
});
test("Ollama NDJSON stream continues length once and honors settings without live inference", async (t) => {
  const {
    ollamaComplete,
  } = require("../packages/server/dist/momo/providers/ollama");
  const original = global.fetch;
  t.after(() => (global.fetch = original));
  let calls = 0;
  const bodies = [];
  global.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    const n = ++calls;
    return new Response(
      JSON.stringify({
        message: { content: n === 1 ? "hello " : "world" },
        done: true,
        done_reason: n === 1 ? "length" : "stop",
      }) + "\n",
      { headers: { "Content-Type": "application/x-ndjson" } },
    );
  };
  const partial = [];
  const output = await ollamaComplete(
    [{ role: "user", content: "Write" }],
    {
      model: "mock",
      ollamaUrl: "http://127.0.0.1:11434",
      numCtx: 8192,
      numPredict: 1024,
      keepAlive: "10m",
    },
    new AbortController().signal,
    false,
    (text) => partial.push(text),
  );
  assert.equal(output, "hello world");
  assert.equal(calls, 2);
  assert.equal(bodies[0].stream, true);
  assert.equal(bodies[0].options.num_predict, 1024);
  assert.equal(partial.at(-1), "hello world");
});
test("advanced settings validate timeout, generation reserve and keep-alive", (t) => {
  const e = fixture(t, async () => "");
  const settings = e.snapshot().settings;
  for (const patch of [
    { numCtx: 100 },
    { numPredict: 9000 },
    { temperature: 3 },
    { timeoutMs: 0 },
    { idleTimeoutMs: 0 },
    { keepAlive: "forever" },
  ])
    assert.throws(() => e.settings({ ...settings, ...patch }));
  const updated = e.settings({
    ...settings,
    numCtx: 16384,
    numPredict: 1024,
    keepAlive: "10m",
  });
  assert.equal(updated.numCtx, 16384);
});

test("router and upgrade security reject bad Host/Origin, missing tokens and unauthenticated writes", () => {
  const { checkRequest } = require("../packages/server/dist/momo/security");
  const token = "test-session-token";
  const req = (headers = {}, method = "GET") => ({
    headers: { host: "127.0.0.1:3000", ...headers },
    method,
    socket: { localPort: 3000 },
  });
  assert.equal(checkRequest(req(), token), 401);
  assert.equal(checkRequest(req({ "x-momo-token": token }), token), 0);
  assert.equal(
    checkRequest(req({ host: "evil.test", "x-momo-token": token }), token),
    403,
  );
  assert.equal(
    checkRequest(req({ host: "localhost:99", "x-momo-token": token }), token),
    403,
  );
  assert.equal(
    checkRequest(
      req({ origin: "https://evil.test", "x-momo-token": token }),
      token,
    ),
    403,
  );
  assert.equal(checkRequest(req({}, "POST"), token, false), 403);
  assert.equal(checkRequest(req({ "x-momo-token": token }, "POST"), token), 0);
  assert.equal(
    checkRequest(
      req({ cookie: `momo-session=${token}`, origin: "http://127.0.0.1:3000" }),
      token,
    ),
    0,
  );
  assert.equal(
    checkRequest(
      req({ origin: "http://localhost:5173", "x-momo-token": token }),
      token,
      true,
      false,
    ),
    403,
  );
  assert.equal(
    checkRequest(
      req({ origin: "http://localhost:5173", "x-momo-token": token }),
      token,
      true,
      true,
    ),
    0,
  );
  assert.doesNotThrow(() =>
    checkRequest(req({ "x-momo-token": "é".repeat(token.length) }), token),
  );
});
