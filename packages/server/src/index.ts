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
app.use(express.json({ limit: "128kb" }));
app.use("/api/momo", momoRouter);
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, app: "momo-office" }),
);
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
  transport: new WebSocketTransport({ server: httpServer }),
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
  });
