import helmet from "helmet";
import fs from "fs";
import { randomUUID } from "crypto";
import { checkRequest } from "./momo/security";
import express from "express";
import path from "path";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import { OfficeRoom } from "./rooms/OfficeRoom";
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
const server = new Server({
  greet: false,
  transport: new WebSocketTransport({
    server: httpServer,
    verifyClient: (info, done) => {
      const code = checkRequest(info.req, apiToken, true, dev);
      done(
        !code,
        code || undefined,
        code ? "Office session rejected." : undefined,
      );
    },
  }),
});
app.post("/api/shutdown", (req, res) => {
  if (
    !process.env.OFFICE_SHUTDOWN_TOKEN ||
    req.get("X-Office-Token") !== process.env.OFFICE_SHUTDOWN_TOKEN
  ) {
    res.sendStatus(403);
    return;
  }
  res.json({ ok: true });
  setTimeout(() => void server.gracefullyShutdown(), 100);
});
server.define("office", OfficeRoom);
server.onShutdown(() => momo.shutdown());
initializeMomo()
  .then(() => server.listen(Number(process.env.PORT || 3000), "127.0.0.1"))
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
