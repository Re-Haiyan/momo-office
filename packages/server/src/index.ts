import helmet from "helmet";
import fs from "fs";
import { randomUUID } from "crypto";
import { checkRequest } from "./momo/security";
import express from "express";
import path from "path";
import { createServer } from "http";
import { OfficeSimulation } from "./momo/office";
import { momoRouter } from "./momo/router";
import { momo, initializeMomo } from "./momo/instance";

const app = express();
app.disable("x-powered-by");
const apiToken = process.env.MOMO_API_TOKEN || randomUUID();
if (!/^[a-zA-Z0-9_-]{16,128}$/.test(apiToken))
  throw new Error("Invalid session token configuration.");
const dev = process.env.NODE_ENV === "development";
app.use((req, res, next) => {
  const code = checkRequest(req, apiToken, false, dev);
  if (code) {
    res.status(code).json({ error: "Host or Origin rejected." });
    return;
  }
  next();
});
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        styleSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws://127.0.0.1:*", "ws://localhost:*"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(["/api", "/matchmake"], (req, res, next) => {
  if (req.originalUrl.split("?")[0] === "/api/health") {
    next();
    return;
  }
  const code = checkRequest(req, apiToken, true, dev);
  if (code) {
    res.status(code).json({ error: "Office session authentication required." });
    return;
  }
  next();
});
app.use(express.json({ limit: "128kb" }));
app.use("/api/momo", momoRouter);
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, app: "momo-office" }),
);
app.get("/", (_req, res) => {
  res.setHeader(
    "Set-Cookie",
    `momo-session=${apiToken}; HttpOnly; SameSite=Strict; Path=/`,
  );
  res.setHeader("Cache-Control", "no-store");
  const html = fs
    .readFileSync(path.resolve(__dirname, "../../ui/dist/index.html"), "utf8")
    .replace(
      "</head>",
      `<meta name="momo-token" content="${apiToken}" /></head>`,
    );
  res.type("html").send(html);
});
app.use(express.static(path.resolve(__dirname, "../../ui/dist")));
app.use(
  (
    _error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(400).json({ error: "Invalid request." });
  },
);
const httpServer = createServer(app);
let office: OfficeSimulation;
const clients = new Set<express.Response>();
app.get("/api/office/events", (req, res) => {
  if (clients.size >= 10) {
    res.sendStatus(429);
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  clients.add(res);
  res.write(`event: office\ndata: ${JSON.stringify(office.snapshot())}\n\n`);
  req.on("close", () => clients.delete(res));
});
const tick = setInterval(() => {
  if (!office || !clients.size) return;
  const frame = `event: office\ndata: ${JSON.stringify(office.snapshot())}\n\n`;
  for (const res of clients) {
    if (res.writableLength > 262144) {
      res.end();
      clients.delete(res);
    } else res.write(frame);
  }
}, 180);
tick.unref();
httpServer.on("upgrade", (req, socket) => {
  const code = checkRequest(req, apiToken, true, dev) || 400;
  socket.end(`HTTP/1.1 ${code} Rejected\r\nConnection: close\r\n\r\n`);
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(tick);
  for (const res of clients) res.end();
  clients.clear();
  await momo.shutdown();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
app.post("/api/shutdown", (req, res) => {
  if (
    !process.env.OFFICE_SHUTDOWN_TOKEN ||
    req.get("X-Office-Token") !== process.env.OFFICE_SHUTDOWN_TOKEN
  ) {
    res.sendStatus(403);
    return;
  }
  res.json({ ok: true });
  setTimeout(() => void shutdown(), 100);
});
initializeMomo()
  .then(() => {
    office = new OfficeSimulation(momo);
    return new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(Number(process.env.PORT || 3000), "127.0.0.1", resolve);
    });
  })
  .then(() => {
    const port = (httpServer.address() as any).port;
    if (process.send) process.send({ type: "ready", port });
    console.log(`Momo Office ready at http://127.0.0.1:${port}`);
  })
  .catch(() => {
    // Corrupt JSON can include a source excerpt: never print raw initialization errors.
    console.error(
      "Momo Office could not initialize. Check the saved data file and local server port.",
    );
    process.exit(1);
  });
