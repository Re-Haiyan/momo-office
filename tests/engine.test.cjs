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
    if (["completed", "failed", "cancelled"].includes(run?.status)) return run;
    await wait(10);
  }
  throw Error("run did not settle");
}
function fixture(t, complete) {
  const dir = mkdtempSync(path.join(tmpdir(), "momo-test-"));
  const engine = new MomoEngine(dir, complete);
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
  assert.equal(calls, 1);
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
