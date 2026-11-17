const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "momo-cancel-"));
  let instance;
  try {
    instance = await electron.launch({
      executablePath: process.env.ELECTRON_EXECUTABLE || undefined,
      args:
        process.platform === "linux"
          ? ["--no-sandbox", "--disable-gpu", path.resolve(__dirname, "..")]
          : [path.resolve(__dirname, "..")],
      env: {
        ...process.env,
        MOMO_USER_DATA_DIR: data,
        MOMO_SPLASH_MIN_MS: "5000",
      },
      timeout: 30000,
    });
    const splash = await instance.firstWindow();
    await splash.getByRole("button", { name: "Cancel", exact: true }).waitFor();
    const childProcess = instance.process();
    const exit = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        childProcess.kill();
        reject(new Error("Cancelling startup did not stop the app."));
      }, 12000);
      childProcess.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    await Promise.all([
      exit,
      splash
        .getByRole("button", { name: "Cancel", exact: true })
        .click()
        .catch((error) => {
          if (!/closed/i.test(error.message)) throw error;
        }),
    ]);
    instance = null;
    const log = path.join(data, "office/desktop.log");
    const address = fs.existsSync(log)
      ? fs
          .readFileSync(log, "utf8")
          .match(/Momo Office ready at (http:\/\/127\.0\.0\.1:\d+)/)?.[1]
      : null;
    if (address) {
      let running = false;
      try {
        running = (
          await fetch(address + "/api/health", {
            signal: AbortSignal.timeout(1500),
          })
        ).ok;
      } catch {}
      assert.equal(running, false);
    }
    console.log(
      "PASS: cancelling the loading screen closes the app without leaving its local server running.",
    );
  } finally {
    if (instance) instance.process().kill();
    fs.rmSync(data, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
