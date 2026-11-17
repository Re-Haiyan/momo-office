const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
let server,
  origin,
  closing = false,
  mainWindow;
const userData = process.env.MOMO_USER_DATA_DIR
  ? path.resolve(process.env.MOMO_USER_DATA_DIR)
  : path.join(app.getPath("appData"), "momo-office");
fs.mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
app.setAppUserModelId("com.momo.office");
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
const token = randomUUID();
const root = path.resolve(__dirname, "..");
const dataDirectory = () => path.join(app.getPath("userData"), "office");
function external(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || u.protocol === "http:")
      void shell.openExternal(u.toString());
  } catch {}
}
async function reuseOllama() {
  let address = "http://127.0.0.1:11434";
  try {
    address = JSON.parse(
      fs.readFileSync(path.join(dataDirectory(), "momo-office.json"), "utf8"),
    ).settings.ollamaUrl;
  } catch {}
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/.test(address)) return;
  try {
    if (
      (
        await fetch(`${address}/api/tags`, {
          signal: AbortSignal.timeout(2000),
        })
      ).ok
    )
      return;
  } catch {}
  // Do not replace or stop an existing Ollama instance. Let the UI explain missing models.
  const candidate =
    process.platform === "win32"
      ? path.join(
          process.env.LOCALAPPDATA || "",
          "Programs",
          "Ollama",
          "ollama.exe",
        )
      : "ollama";
  const child = spawn(candidate, ["serve"], {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
  });
  child.on("error", () => {});
  child.unref();
}
async function startServer() {
  const data = dataDirectory();
  fs.mkdirSync(data, { recursive: true });
  const log = fs.createWriteStream(path.join(data, "desktop.log"), {
    flags: "a",
  });
  server = spawn(
    process.execPath,
    [path.join(root, "packages/server/dist/index.js")],
    {
      cwd: data,
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_OPTIONS: "",
        PORT: "0",
        MOMO_MODE: "1",
        MOMO_DATA_DIR: data,
        OFFICE_SHUTDOWN_TOKEN: token,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.pipe(log, { end: false });
  server.stderr.pipe(log, { end: false });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error(
            "The office server did not start. See desktop.log in the saved data folder.",
          ),
        ),
      30000,
    );
    server.once("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    let output = "";
    server.stdout.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-3000);
      const match = output.match(
        /Momo Office ready at (http:\/\/127\.0\.0\.1:\d+)/,
      );
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    server.once("exit", (code) => {
      clearTimeout(timeout);
      log.end();
      if (!origin)
        reject(
          new Error(
            `Office server exited (${code}). See desktop.log in ${data}.`,
          ),
        );
      else if (!closing) {
        dialog.showErrorBox(
          "Momo Office stopped",
          `The local server stopped unexpectedly. Reopen Momo Office. Logs are in ${data}.`,
        );
        app.quit();
      }
    });
  });
}
if (lock)
  app
    .whenReady()
    .then(async () => {
      ipcMain.handle("momo:open-data", (event) => {
        if (event.senderFrame?.url.startsWith(origin + "/"))
          return shell.openPath(dataDirectory());
      });
      void reuseOllama();
      origin = await startServer();
      mainWindow = new BrowserWindow({
        title: "Momo Office",
        width: 1280,
        height: 920,
        minWidth: 760,
        minHeight: 640,
        backgroundColor: "#242335",
        icon: path.join(root, "packages/ui/dist/momo-icon.png"),
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webviewTag: false,
        },
      });
      mainWindow.removeMenu();
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        external(url);
        return { action: "deny" };
      });
      mainWindow.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(origin + "/")) {
          event.preventDefault();
          external(url);
        }
      });
      mainWindow.webContents.session.setPermissionRequestHandler(
        (_wc, permission, callback) =>
          callback(permission === "clipboard-sanitized-write"),
      );
      mainWindow.webContents.session.on("will-download", (_event, item) => {
        item.setSaveDialogOptions({
          title: "Save your team’s work",
          defaultPath: path.join(app.getPath("downloads"), item.getFilename()),
        });
      });
      await mainWindow.loadURL(origin);
    })
    .catch((error) => {
      console.error("Momo Office startup error:", error);
      dialog.showErrorBox("Could not open Momo Office", error.message);
      if (server) server.kill();
      closing = true;
      app.quit();
    });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (closing || !server || server.exitCode !== null) return;
  event.preventDefault();
  closing = true;
  Promise.resolve(
    origin &&
      fetch(`${origin}/api/shutdown`, {
        method: "POST",
        headers: {
          "X-Office-Token": token,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(3000),
      }),
  )
    .catch(() => {})
    .finally(() => {
      const timer = setTimeout(() => {
        server.kill();
        app.quit();
      }, 6000);
      server.once("exit", () => {
        clearTimeout(timer);
        app.quit();
      });
      if (server.exitCode !== null) {
        clearTimeout(timer);
        app.quit();
      }
    });
});
