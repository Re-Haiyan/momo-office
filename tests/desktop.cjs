const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "momo-desktop-"));
  let app;
  try {
    const extra =
      process.platform === "linux" ? ["--no-sandbox", "--disable-gpu"] : [];
    app = await electron.launch({
      executablePath: process.env.ELECTRON_EXECUTABLE || undefined,
      args: [...extra, path.resolve(__dirname, "..")],
      env: { ...process.env, MOMO_USER_DATA_DIR: temporary },
      timeout: 30000,
    });
    const window = await app.firstWindow({ timeout: 10000 });
    await window.getByRole("textbox", { name: "Ask Momo" }).waitFor();
    assert.equal(await window.title(), "Momo Office");
    assert.equal(
      await window.evaluate(() => typeof window.require),
      "undefined",
    );
    assert.equal(
      await window.evaluate(() => typeof window.momoDesktop.openDataFolder),
      "function",
    );
    const url = window.url();
    assert.ok(url.startsWith("http://127.0.0.1:"));
    const state = await (await fetch(url + "api/momo/state")).json();
    assert.equal(state.agents.length, 5);
    await app.close();
    app = null;
    assert.ok(fs.existsSync(path.join(temporary, "office/momo-office.json")));
    await new Promise((r) => setTimeout(r, 500));
    let stopped = false;
    try {
      await fetch(url + "api/health", { signal: AbortSignal.timeout(1000) });
    } catch {
      stopped = true;
    }
    assert.equal(stopped, true);
    console.log(
      "PASS: desktop launches its own local server and UI, renderer has no Node access, fixed data IPC works, saved data exists, server stops with app.",
    );
  } finally {
    if (app) await app.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
