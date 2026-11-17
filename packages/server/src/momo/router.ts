import { Router } from "express";
import { momo } from "./instance";
import { cloudIds } from "./providers/secrets";
import type { CloudId } from "./providers/types";
import { officeLayout } from "./OfficeLayout";

export const momoRouter = Router();
// Browsers on other websites cannot submit commands to this local desktop app.
momoRouter.use((req, res, next) => {
  if (req.method !== "GET") {
    const origin = req.get("origin");
    if (
      origin &&
      origin !== `http://${req.get("host")}` &&
      origin !== "http://localhost:5173" &&
      origin !== "http://127.0.0.1:5173"
    ) {
      res.status(403).json({ error: "Requests must come from Momo Office." });
      return;
    }
    if (!req.is("application/json")) {
      res.status(415).json({ error: "Use application/json." });
      return;
    }
  }
  next();
});
momoRouter.use(async (_req, res, next) => {
  try {
    await momo.pool.secrets.refresh();
    next();
  } catch {
    res.status(503).json({ error: "Provider credentials are unavailable." });
  }
});
const action = (fn: (req: any) => unknown) => async (req: any, res: any) => {
  try {
    res.json(momo.pool.secrets.safe(await fn(req)));
  } catch (e: any) {
    res.status(400).json({ error: momo.pool.secrets.redact(e.message) });
  }
};
momoRouter.get("/office", (_req, res) => res.json(officeLayout));
momoRouter.get("/state", (_req, res) => res.json(momo.snapshot()));
momoRouter.get("/connection", async (_req, res) => {
  try {
    const response = await fetch(`${momo.store.settings.ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    const data = await response.json();
    const models = (data.models || []).map((m: any) =>
      momo.pool.secrets.redact(String(m.name)),
    );
    res.json({
      connected: true,
      models,
      ready: models.includes(momo.store.settings.model),
    });
  } catch (e: any) {
    res.json({
      connected: false,
      models: [],
      ready: false,
      error: momo.pool.secrets.redact(e.message),
    });
  }
});
momoRouter.post(
  "/runs",
  action((req) =>
    momo.submit(
      req.body.prompt,
      typeof req.body.parentId === "string" ? req.body.parentId : undefined,
      req.body.localOnly === true,
    ),
  ),
);
momoRouter.post(
  "/runs/:id/cancel",
  action((req) => {
    momo.cancel(req.params.id);
    return { ok: true };
  }),
);
momoRouter.get("/runs/:id/export", (req, res) => {
  const run = momo.store.runs.find((r) => r.id === req.params.id);
  if (!run) {
    res.sendStatus(404);
    return;
  }
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="momo-${run.id}.md"`,
  );
  res.type("text/markdown").send(momo.markdown(run));
});
momoRouter.post(
  "/agents",
  action((req) => momo.agent(req.body)),
);
momoRouter.put(
  "/agents/:id",
  action((req) => momo.agent(req.body, req.params.id)),
);
momoRouter.delete(
  "/agents/:id",
  action((req) => {
    momo.removeAgent(req.params.id);
    return { ok: true };
  }),
);
momoRouter.post(
  "/skills",
  action((req) => momo.skill(req.body)),
);
momoRouter.put(
  "/skills/:id",
  action((req) => momo.skill(req.body, req.params.id)),
);
momoRouter.put(
  "/settings",
  action((req) => momo.settings(req.body)),
);

function provider(id: string): CloudId {
  if (!cloudIds.includes(id as CloudId)) throw new Error("Unknown provider.");
  return id as CloudId;
}
momoRouter.get(
  "/providers",
  action(() => momo.providerState()),
);
momoRouter.put(
  "/providers/:id",
  action((req) => momo.configureProvider(provider(req.params.id), req.body)),
);
momoRouter.post(
  "/providers/:id/test",
  action((req) => momo.pool.check(provider(req.params.id))),
);
momoRouter.post(
  "/providers/:id/models",
  action((req) => momo.pool.discover(provider(req.params.id))),
);
momoRouter.post(
  "/auto-assign/preview",
  action(() => momo.autoAssign()),
);
momoRouter.post(
  "/auto-assign/apply",
  action((req) => momo.applyAssignments(req.body.agents)),
);

momoRouter.post(
  "/runs/:id/resume",
  action((req) => momo.resume(req.params.id)),
);
