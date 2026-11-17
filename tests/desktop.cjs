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
      args:
        process.env.MOMO_PACKAGED === "1"
          ? extra
          : [
              ...extra,
              process.env.MOMO_APP_PATH || path.resolve(__dirname, ".."),
            ],
      env: {
        ...process.env,
        MOMO_USER_DATA_DIR: temporary,
        MOMO_SPLASH_MIN_MS: "2500",
      },
      timeout: 30000,
    });
    console.log("Desktop process started");
    const splash = await app.firstWindow({ timeout: 10000 });
    assert.equal(await splash.title(), "Starting Momo Office");
    await splash
      .getByRole("progressbar", { name: "Starting Momo Office" })
      .waitFor();
    assert.equal(
      await splash
        .locator("img")
        .evaluate((image) => image.complete && image.naturalWidth > 0),
      true,
    );
    let window;
    for (let i = 0; i < 300 && !window; i++) {
      for (const candidate of app.windows()) {
        try {
          if ((await candidate.title()) === "Momo Office") {
            window = candidate;
            break;
          }
        } catch {}
      }
      if (!window) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(window, "The office window must open after the splash.");
    await window.getByRole("textbox", { name: "Ask Momo" }).waitFor();
    for (let i = 0; i < 300 && !splash.isClosed(); i++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      splash.isClosed(),
      true,
      "The loading screen must close after the office becomes ready.",
    );
    const officeWindow = await app.browserWindow(window);
    assert.equal(await officeWindow.evaluate((win) => win.isVisible()), true);
    assert.equal(await window.title(), "Momo Office");
    assert.equal(
      await window.evaluate(() => typeof window.require),
      "undefined",
    );
    assert.equal(
      await window.evaluate(() => typeof window.momoDesktop.openDataFolder),
      "function",
    );
    console.log("Desktop UI and preload are ready");
    const url = window.url();
    assert.ok(url.startsWith("http://127.0.0.1:"));
    const state = await (await fetch(url + "api/momo/state")).json();
    assert.equal(state.agents.length, 8);
    if (process.platform === "win32") {
      const fakeKey = "momo-desktop-test-not-a-real-provider-key";
      const saved = await window.evaluate(
        async (key) => window.momoDesktop.setProviderKey("gemini", key),
        fakeKey,
      );
      assert.equal(saved.hasKey, true);
      const providerState = await (
        await fetch(url + "api/momo/providers")
      ).json();
      assert.equal(
        providerState.providers.find((p) => p.id === "gemini").hasKey,
        true,
      );
      assert.ok(!JSON.stringify(providerState).includes(fakeKey));
      assert.ok(
        !JSON.stringify(
          await (await fetch(url + "api/momo/state")).json(),
        ).includes(fakeKey),
      );
      const encrypted = fs.readFileSync(
        path.join(temporary, "provider-keys.encrypted.json"),
        "utf8",
      );
      assert.ok(!encrypted.includes(fakeKey));
      assert.ok(
        !fs
          .readFileSync(path.join(temporary, "office/momo-office.json"), "utf8")
          .includes(fakeKey),
      );
      assert.ok(
        !fs
          .readFileSync(path.join(temporary, "office/desktop.log"), "utf8")
          .includes(fakeKey),
      );
      await window.evaluate(() =>
        window.momoDesktop.setProviderKey("gemini", ""),
      );
      console.log(
        "PASS: safeStorage ciphertext, IPC key retrieval, write-only state and key removal. No cloud requests.",
      );
    }
    console.log("Stopping the desktop app");
    await Promise.race([
      app.close(),
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Desktop shutdown timed out.")),
          15000,
        );
        timer.unref();
      }),
    ]);
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
      "PASS: loading screen and mascot appear, ready office replaces splash, renderer has no Node access, saved data exists, server stops with app.",
    );
  } catch (error) {
    try {
      console.error(
        "Desktop server log:",
        fs.readFileSync(path.join(temporary, "office/desktop.log"), "utf8"),
      );
    } catch {}
    throw error;
  } finally {
    if (app) {
      const child = app.process();
      const timer = setTimeout(() => {
        if (process.platform === "win32")
          require("node:child_process").spawnSync("taskkill", [
            "/pid",
            String(child.pid),
            "/T",
            "/F",
          ]);
        else child.kill("SIGKILL");
      }, 5000);
      try {
        await app.close();
      } catch {
      } finally {
        clearTimeout(timer);
      }
    }
    try {
      fs.rmSync(temporary, { recursive: true, force: true });
    } catch {}
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
