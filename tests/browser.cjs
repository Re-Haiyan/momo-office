const assert = require("node:assert/strict");
const http = require("node:http");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "momo-browser-"));
const screenshots =
  process.env.TEST_OUTPUT_DIR || path.join(root, "work/test-results");
fs.mkdirSync(screenshots, { recursive: true });
let child,
  browser,
  origin,
  errors = [];
const mock = http.createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  const body = JSON.parse(text || "{}");
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/tags") {
    res.end(JSON.stringify({ models: [{ name: "llama3.2:latest" }] }));
    return;
  }
  await new Promise((r) => setTimeout(r, 150));
  const system = body.messages?.[0]?.content || "";
  let answer =
    body.format === "json"
      ? JSON.stringify({
          summary: "Research the idea, then write a useful draft.",
          tasks: [
            { agentId: "sage", title: "List the practical requirements" },
            { agentId: "luna", title: "Write the portfolio website plan" },
          ],
        })
      : system.includes("Review and combine")
        ? "Your portfolio website plan\n\n1. Home: introduce yourself and your work.\n2. Projects: show three case studies.\n3. About: explain your experience.\n4. Contact: add an email link.\n\nNext step: choose your three projects."
        : system.includes("Researcher")
          ? "A portfolio should introduce its owner, demonstrate work with case studies, and offer a clear contact route."
          : "Draft sections: Home, Projects, About and Contact. Keep the writing brief and specific.";
  res.end(JSON.stringify({ message: { content: answer } }));
});
(async () => {
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  child = fork(path.join(root, "packages/server/dist/index.js"), [], {
    cwd: temporary,
    env: {
      ...process.env,
      PORT: "0",
      MOMO_DATA_DIR: temporary,
      OLLAMA_URL: `http://127.0.0.1:${mock.address().port}`,
      OFFICE_SHUTDOWN_TOKEN: "browser-test",
    },
    silent: true,
  });
  let logs = "";
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));
  origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(logs)), 15000);
    child.on("message", (m) => {
      if (m.type === "ready") {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${m.port}`);
      }
    });
    child.on("exit", () => {
      clearTimeout(timer);
      reject(Error(logs));
    });
  });
  assert.equal(
    (
      await fetch(origin + "/api/momo/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://untrusted.example",
        },
        body: JSON.stringify({ prompt: "bad" }),
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(origin + "/api/shutdown", { method: "POST" })).status,
    403,
  );
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    headless: true,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByRole("textbox", { name: "Ask Momo" }).waitFor();
  await page.waitForFunction(() => document.querySelector("canvas")?.width > 0);
  await page.waitForTimeout(1500);
  assert.equal(await page.getByText("Task Board", { exact: true }).count(), 0);
  assert.equal(
    await page.getByText("Showrunner Controls", { exact: true }).count(),
    0,
  );
  assert.equal(await page.getByRole("textbox").count(), 1);
  await page.screenshot({ path: path.join(screenshots, "Momo-Office.png") });
  await page.getByRole("button", { name: "Open settings" }).click();
  await page
    .getByRole("button", { name: "Skill library", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Add skill", exact: true }).click();
  await page.getByLabel("Skill name", { exact: true }).fill("Brand voice");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Use a friendly and concise voice.");
  await page.getByRole("button", { name: "Save skill", exact: true }).click();
  await page.getByRole("button", { name: /Brand voice/ }).waitFor();
  await page.getByRole("button", { name: "Teammates", exact: true }).click();
  await page.getByRole("button", { name: "+ Add agent", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Kiki");
  await page.getByLabel("Role", { exact: true }).fill("Designer");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Create practical visual design proposals.");
  await page.getByLabel("Brand voice", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save teammate", exact: true })
    .click();
  await page.getByRole("button", { name: /Kiki/ }).waitFor();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page
    .getByRole("textbox", { name: "Ask Momo" })
    .fill("Write a plan for my portfolio website");
  await page.getByRole("button", { name: "Send prompt to Momo" }).click();
  await page
    .getByText("Ready for you", { exact: true })
    .waitFor({ timeout: 15000 });
  assert.ok(await page.getByText(/Your portfolio website plan/).count());
  const state = await (await fetch(origin + "/api/momo/state")).json();
  assert.equal(state.agents.length, 6);
  assert.ok(state.skills.some((s) => s.name === "Brand voice"));
  assert.equal(state.runs[0].status, "completed");
  assert.equal(state.runs[0].steps.length, 2);
  await page.screenshot({ path: path.join(screenshots, "Momo-Answer.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const box = await page
    .getByRole("textbox", { name: "Ask Momo" })
    .boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  await page.screenshot({ path: path.join(screenshots, "Momo-Mobile.png") });
  const exportResponse = await fetch(
    origin + `/api/momo/runs/${state.runs[0].id}/export`,
  );
  assert.equal(exportResponse.status, 200);
  assert.match(await exportResponse.text(), /portfolio website plan/);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: clean office UI, desktop/mobile layouts, skills, added teammate, prompt routing, specialist results, final answer, export, origin guard, no browser exceptions. AI mocked.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (child && origin) {
      await fetch(origin + "/api/shutdown", {
        method: "POST",
        headers: { "X-Office-Token": "browser-test" },
      }).catch(() => {});
      await new Promise((r) => {
        const t = setTimeout(() => {
          child.kill();
          r();
        }, 5000);
        child.once("exit", () => {
          clearTimeout(t);
          r();
        });
      });
    }
    mock.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  });
