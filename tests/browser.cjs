const assert = require("node:assert/strict");
const http = require("node:http");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const sessionToken = "browser-test-session";
const authedFetch = (url, options = {}) =>
  fetch(url, {
    ...options,
    headers: { ...options.headers, "X-Momo-Token": sessionToken },
  });
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
  let answer = body.format
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
  if (system.includes("QUALITY_REVIEW"))
    answer = JSON.stringify({
      approved: true,
      needsInput: false,
      feedback:
        "The work meets the request and makes no unsupported execution claims.",
    });
  res.end(JSON.stringify({ message: { content: answer } }));
});
(async () => {
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  child = fork(path.join(root, "packages/server/dist/index.js"), [], {
    cwd: temporary,
    env: {
      ...process.env,
      GEMINI_API_KEY: "fake-browser-secret-never-real",
      GROQ_API_KEY: "",
      OPENROUTER_API_KEY: "",
      MOMO_DESKTOP: "",
      MOMO_API_TOKEN: sessionToken,
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
      await authedFetch(origin + "/api/momo/runs", {
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
    (await authedFetch(origin + "/api/shutdown", { method: "POST" })).status,
    403,
  );
  assert.equal((await fetch(origin + "/api/momo/state")).status, 401);
  assert.equal(
    await new Promise((resolve, reject) => {
      const r = http.get(
        origin + "/api/momo/state",
        { headers: { Host: "evil.test", "X-Momo-Token": sessionToken } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      r.on("error", reject);
    }),
    403,
  );
  assert.equal(
    (
      await authedFetch(origin + "/api/momo/state", {
        headers: { Origin: "https://evil.test" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(origin + "/api/momo/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
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
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.agentCount === "8",
  );
  const canvas = page.locator("canvas");
  assert.equal(await canvas.getAttribute("data-pixel-art"), "true");
  assert.equal(await canvas.getAttribute("data-round-pixels"), "true");
  assert.equal(await canvas.getAttribute("data-floor-cached"), "true");
  const colors = await canvas.evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, 960, 640).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 124)
      colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return colors.size;
  });
  assert.ok(
    colors > 30,
    "The pixel office must contain rendered art, not a blank canvas.",
  );
  assert.equal(await canvas.evaluate((c) => c.width), 960);
  assert.equal(await canvas.evaluate((c) => c.height), 640);
  assert.equal(await canvas.getAttribute("data-zoom"), "1");
  assert.equal(
    await page.locator("html").getAttribute("data-audio-started"),
    "false",
  );
  const gameBox = await canvas.boundingBox();
  await page.mouse.click(
    gameBox.x + (448 * gameBox.width) / 960,
    gameBox.y + (152 * gameBox.height) / 640,
  );
  await page
    .getByRole("dialog", { name: "Talk with Momo", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "View output", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Change model", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Name", { exact: true }).inputValue(),
    "Momo",
  );
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await canvas.focus();
  await page.keyboard.press("+");
  assert.equal(await canvas.getAttribute("data-zoom"), "2");
  await page.keyboard.press("0");
  assert.equal(await canvas.getAttribute("data-zoom"), "1");
  await page.mouse.move(gameBox.x + 500, gameBox.y + 200);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(120);
  assert.equal(await canvas.getAttribute("data-zoom"), "2");
  await canvas.focus();
  await page.keyboard.press("0");
  await page.screenshot({ path: path.join(screenshots, "Momo-Office.png") });
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("tab", { name: "Skills", exact: true }).click();
  await page.getByRole("button", { name: "+ Add skill", exact: true }).click();
  await page.getByLabel("Skill name", { exact: true }).fill("Brand voice");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Use a friendly and concise voice.");
  await page.getByRole("button", { name: "Save skill", exact: true }).click();
  await page.getByRole("button", { name: /Brand voice/ }).waitFor();
  await page.getByRole("tab", { name: "Teammates", exact: true }).click();
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
  await page.getByRole("button", { name: "+ Add agent", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Nori");
  await page.getByLabel("Role", { exact: true }).fill("Editor");
  await page
    .getByRole("button", { name: "Save teammate", exact: true })
    .click();
  await page.getByRole("button", { name: /Nori/ }).waitFor();
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.agentCount === "10",
  );
  await page.getByRole("button", { name: /Pip/ }).click();
  await page
    .getByLabel("Ollama model (optional)", { exact: true })
    .fill("llama3.2:latest");
  await page
    .getByRole("button", { name: "Save teammate", exact: true })
    .click();
  await page.getByRole("button", { name: /Pip/ }).waitFor();
  await page
    .getByRole("button", { name: "Auto-assign models", exact: true })
    .click();
  await page.getByText("Review model assignments", { exact: true }).waitFor();
  const beforeAssign = await (
    await authedFetch(origin + "/api/momo/state")
  ).json();
  assert.ok(
    beforeAssign.agents.every((a) =>
      a.fallbackChain.every((r) => r.provider === "ollama"),
    ),
  );
  await page
    .getByRole("button", { name: "Discard preview", exact: true })
    .click();
  await page.getByRole("tab", { name: "Providers", exact: true }).click();
  await page
    .getByLabel("Enable this cloud provider", { exact: true })
    .first()
    .waitFor();
  assert.equal(
    await page
      .getByLabel("Enable this cloud provider", { exact: true })
      .count(),
    3,
  );
  for (const box of await page
    .getByLabel("Enable this cloud provider", { exact: true })
    .all())
    assert.equal(await box.isChecked(), false);
  assert.equal(
    await page
      .getByLabel("API key (write-only)", { exact: true })
      .first()
      .isDisabled(),
    true,
  );
  await page.screenshot({ path: path.join(screenshots, "Providers.png") });
  await page.getByRole("tab", { name: "Display", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(
    await page
      .getByRole("tab", { name: "Models", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page
      .getByRole("tab", { name: "Display", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.getByLabel("Weather", { exact: true }).selectOption("rain");
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.weatherActive === "true",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.weatherActive === "false",
  );
  await page
    .getByText(
      "Reduced motion is on. Weather and ambient animation are disabled.",
      { exact: true },
    )
    .waitFor();
  await page.getByLabel("Season", { exact: true }).selectOption("winter");
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.season === "winter",
  );
  await page.getByLabel("High-contrast panels", { exact: true }).check();
  assert.equal(
    await page.locator(".momo-app").getAttribute("data-high-contrast"),
    "true",
  );
  await page.getByLabel("Pixel cursor", { exact: true }).uncheck();
  assert.equal(
    await page.locator("html").getAttribute("data-pixel-cursor"),
    "false",
  );
  await page.getByLabel("Pixel cursor", { exact: true }).check();
  await page.getByLabel("High-contrast panels", { exact: true }).uncheck();
  assert.equal(
    await page.getByLabel("Enable sound", { exact: true }).isChecked(),
    false,
  );
  assert.equal(
    await page.locator("html").getAttribute("data-audio-started"),
    "false",
  );
  await page.getByLabel("Enable sound", { exact: true }).check();
  await page.waitForFunction(
    () => document.documentElement.dataset.audioStarted === "true",
  );
  await page.getByLabel("Enable sound", { exact: true }).uncheck();
  await page.getByLabel("Weather", { exact: true }).selectOption("off");
  await page.getByLabel("Season", { exact: true }).selectOption("auto");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 760, height: 640 });
  await page.getByLabel("UI scale", { exact: true }).selectOption("3");
  assert.equal(
    await page.locator(".momo-app").getAttribute("data-ui-scale"),
    "3",
  );
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Ask Momo" })
    .scrollIntoViewIfNeeded();
  let scaledBox = await page
    .getByRole("textbox", { name: "Ask Momo" })
    .boundingBox();
  assert.ok(
    scaledBox.x >= 0 &&
      scaledBox.x + scaledBox.width <= 761 &&
      scaledBox.y >= 0 &&
      scaledBox.y + scaledBox.height <= 641,
  );
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page.getByRole("tab", { name: "Display", exact: true }).click();
  await page.getByLabel("UI scale", { exact: true }).selectOption("2");
  assert.equal(
    await page.locator(".momo-app").getAttribute("data-ui-scale"),
    "2",
  );
  await page.getByLabel("UI scale", { exact: true }).selectOption("1");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Close settings" }).click();
  await page
    .getByLabel(
      "Local only · block cloud models and web lookup for this request",
      { exact: true },
    )
    .check();
  await page
    .getByRole("textbox", { name: "Ask Momo" })
    .fill(
      "Write a plan for my portfolio website fake-browser-secret-never-real",
    );
  await page.getByRole("button", { name: "Send prompt to Momo" }).click();
  await page
    .getByText(/Ready for you|Ready with warnings/, { exact: true })
    .waitFor({ timeout: 15000 });
  assert.ok(await page.getByText(/Your portfolio website plan/).count());
  const state = await (await authedFetch(origin + "/api/momo/state")).json();
  assert.ok(!JSON.stringify(state).includes("fake-browser-secret-never-real"));
  assert.ok(
    !fs
      .readFileSync(path.join(temporary, "momo-office.json"), "utf8")
      .includes("fake-browser-secret-never-real"),
  );
  assert.equal(state.agents.length, 10);
  assert.deepEqual(state.agents.find((a) => a.id === "pip").model, {
    provider: "ollama",
    model: "llama3.2:latest",
  });
  assert.ok(state.skills.some((s) => s.name === "Brand voice"));
  assert.ok(
    ["completed", "completed_with_warnings"].includes(state.runs[0].status),
  );
  assert.equal(state.runs[0].localOnly, true);
  assert.ok(state.runs[0].answers.length >= 5);
  assert.equal(state.runs[0].steps.length, 2);
  assert.equal(
    await page
      .getByLabel("Quest log", { exact: true })
      .locator(".step")
      .count(),
    2,
  );
  await page
    .getByRole("button", { name: "Talk to a teammate", exact: true })
    .click();
  await page.getByRole("button", { name: "Talk to Sage", exact: true }).click();
  await page.getByRole("button", { name: "View output", exact: true }).click();
  assert.equal(await page.locator(".step[open]").count(), 1);
  await page.screenshot({ path: path.join(screenshots, "Momo-Answer.png") });
  await page.locator(".answer-heading").click();
  for (const [width, height] of [
    [1920, 1080],
    [1280, 800],
    [760, 640],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    const promptBox = await page
      .getByRole("textbox", { name: "Ask Momo" })
      .boundingBox();
    assert.ok(
      promptBox.x >= 0 &&
        promptBox.x + promptBox.width <= width &&
        promptBox.y + promptBox.height <= height,
    );
    assert.ok(Number.isInteger(Number(await canvas.getAttribute("data-zoom"))));
    assert.ok(
      Number.isInteger(Number(await canvas.getAttribute("data-render-scale"))),
    );
    await page.screenshot({
      path: path.join(screenshots, `Pixel-Office-${width}x${height}.png`),
    });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  const frameRate = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let first = 0,
          last = 0,
          count = 0;
        function frame(t) {
          if (!count) first = t;
          last = t;
          if (++count >= 120)
            resolve({ fps: 119000 / (last - first), frames: count });
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }),
  );
  console.log(
    "1080p / 10 agents, headless Canvas 2D:",
    JSON.stringify(frameRate),
  );
  if (process.env.MOMO_PROFILE_VISUALS === "1") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const before = await cdp.send("Performance.getMetrics");
    await page.waitForTimeout(2000);
    const after = await cdp.send("Performance.getMetrics");
    console.log(
      "Profile metric deltas:",
      Object.fromEntries(
        after.metrics
          .filter((m) =>
            [
              "ScriptDuration",
              "LayoutDuration",
              "RecalcStyleDuration",
              "TaskDuration",
            ].includes(m.name),
          )
          .map((m) => [
            m.name,
            m.value - before.metrics.find((v) => v.name === m.name).value,
          ]),
      ),
    );
    for (const selector of ["#ui-root", "#phaser-container"]) {
      await page
        .locator(selector)
        .evaluate((e) => (e.style.visibility = "hidden"));
      const fps = await page.evaluate(
        () =>
          new Promise((resolve) => {
            let first = 0,
              count = 0;
            function frame(t) {
              if (!count) first = t;
              if (++count >= 60) resolve(59000 / (t - first));
              else requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
          }),
      );
      console.log("Profile hidden " + selector + ":", fps);
      await page.locator(selector).evaluate((e) => (e.style.visibility = ""));
    }
  }

  // A cold page with saved sound enabled still cannot start audio without a gesture.
  const cold = await browser.newPage();
  await cold.addInitScript(() =>
    localStorage.setItem("momo-sound", JSON.stringify({ enabled: true })),
  );
  await cold.goto(origin);
  await cold.getByRole("textbox", { name: "Ask Momo" }).waitFor();
  assert.equal(
    await cold.locator("html").getAttribute("data-audio-started"),
    "false",
  );
  await cold.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const box = await page
    .getByRole("textbox", { name: "Ask Momo" })
    .boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  await page.screenshot({ path: path.join(screenshots, "Momo-Mobile.png") });
  const exportResponse = await authedFetch(
    origin + `/api/momo/runs/${state.runs[0].id}/export`,
  );
  assert.equal(exportResponse.status, 200);
  const exported = await exportResponse.text();
  assert.match(exported, /portfolio website plan/);
  assert.ok(!exported.includes("fake-browser-secret-never-real"));
  const invalid = await authedFetch(origin + "/api/momo/providers/gemini", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: '{"fake-browser-secret-never-real"',
  });
  assert.equal(invalid.status, 400);
  assert.ok(!(await invalid.text()).includes("fake-browser-secret-never-real"));
  assert.deepEqual(errors, []);
  console.log(
    "PASS: clean office UI, desktop/mobile layouts, skills, added teammate, prompt routing, specialist results, final answer, export, origin guard, no browser exceptions. AI mocked.",
  );
})()
  .catch(async (e) => {
    try {
      await browser
        ?.contexts()[0]
        ?.pages()[0]
        ?.screenshot({ path: path.join(screenshots, "Failure.png") });
    } catch {}
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (child && origin) {
      await authedFetch(origin + "/api/shutdown", {
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
