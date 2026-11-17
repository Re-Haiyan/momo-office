import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { ModelRef, Trace, CloudId, ProviderSettings } from "./providers/types";
import {
  ProviderPool,
  defaultProviderSettings,
} from "./providers/ProviderPool";
import { createPool } from "./providers/createPool";
import { Secrets, cloudIds } from "./providers/secrets";
import { providersConfig, lastVerified } from "./providers/providers.config";
import { SearchSettings, validateSearch } from "./search";
export interface Skill {
  id: string;
  name: string;
  instructions: string;
}
export interface TeamAgent {
  model?: ModelRef;
  fallbackChain?: ModelRef[];
  id: string;
  name: string;
  role: string;
  instructions: string;
  skills: string[];
  webSearch: boolean;
  color: string;
}
export interface Step {
  dependsOn?: number[];
  id: string;
  agentId: string;
  title: string;
  status: "queued" | "working" | "completed" | "failed";
  output: string;
  sources: string[];
  answers?: Trace[];
}
export interface Run {
  resumable?: boolean;
  localOnly?: boolean;
  answers?: Trace[];
  warnings?: string[];
  id: string;
  prompt: string;
  status:
    | "queued"
    | "planning"
    | "working"
    | "reviewing"
    | "revising"
    | "needs_input"
    | "completed_with_warnings"
    | "completed"
    | "failed"
    | "cancelled";
  context?: string;
  notice?: string;
  review?: {
    by: string;
    feedback: string;
    approved: boolean;
    revisions: number;
  };
  plan: string;
  steps: Step[];
  result: string;
  error: string;
  createdAt: string;
  updatedAt: string;
}
export interface Settings {
  model: string;
  numCtx?: number;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  temperature?: number;
  numPredict?: number;
  keepAlive?: string;
  finalMode?: "assemble" | "rewrite";
  search?: SearchSettings;
  ollamaUrl: string;
}
export interface Store {
  notice?: string;
  version: number;
  providers: Record<CloudId, ProviderSettings>;
  agents: TeamAgent[];
  skills: Skill[];
  runs: Run[];
  settings: Settings;
}
export type Complete = (
  messages: { role: string; content: string }[],
  settings: Settings,
  signal: AbortSignal,
  json?: boolean | object,
  onPartial?: (text: string) => void,
) => Promise<string>;

export const STORE_VERSION = 3;
export class NewerStoreError extends Error {}
export function migrate(value: any): Store {
  if (!value || !Number.isInteger(value.version))
    throw new Error("Invalid saved store.");
  if (value.version > STORE_VERSION)
    throw new NewerStoreError(
      "Saved data belongs to a newer Momo Office version. Update the app; this file has not been changed.",
    );
  if (
    value.version < 1 ||
    !Array.isArray(value.agents) ||
    !Array.isArray(value.runs) ||
    !Array.isArray(value.skills) ||
    !value.settings
  )
    throw new Error("Invalid saved store.");
  const saved = structuredClone(value);
  if (saved.version === 1) {
    for (const a of saved.agents)
      if (typeof a.model === "string")
        a.model = { provider: "ollama", model: a.model };
    saved.version = 2;
  }
  if (saved.version === 2) {
    saved.settings.numCtx = 8192;
    saved.version = 3;
  }
  saved.settings.numCtx ??= 8192;
  saved.settings.timeoutMs ??= 240000;
  saved.settings.idleTimeoutMs ??= 90000;
  saved.settings.temperature ??= 0.35;
  saved.settings.numPredict ??= 2048;
  saved.settings.keepAlive ??= "10m";
  saved.settings.finalMode ??= "assemble";
  saved.settings.search ??= { provider: "duckduckgo" };
  return saved;
}

const initialSkills: Skill[] = [
  {
    id: "research",
    name: "Research & evidence",
    instructions:
      "Separate verified facts from assumptions. Cite supplied sources with URLs. If live information is needed and web search is enabled, request a search. Never invent citations or claim to browse without tool results.",
  },
  {
    id: "code",
    name: "Code & debugging",
    instructions:
      "Write clear, maintainable code and explain how to run it. Include checks for meaningful failure cases. Code is a proposal; you cannot execute it or modify the user’s computer.",
  },
  {
    id: "writing",
    name: "Clear writing",
    instructions:
      "Write in plain, natural language. Match the requested audience, tone and length. Produce a complete draft instead of advice about writing a draft.",
  },
  {
    id: "planning",
    name: "Project planning",
    instructions:
      "Break goals into concrete steps with dependencies, deliverables and practical constraints. State assumptions and identify decisions the user needs to make.",
  },
  {
    id: "review",
    name: "Quality review",
    instructions:
      "Check the work against the original request. Flag unsupported claims, inconsistencies and missing requirements. Be precise about what is and is not validated.",
  },
];
initialSkills.push(
  {
    id: "design",
    name: "Design & accessibility",
    instructions:
      "Propose clear layouts, visual hierarchy, accessible interactions and responsive behavior. Explain design decisions. Treat unmeasured contrast and accessibility compliance as unverified; never claim to have created a design file or run an accessibility audit.",
  },
  {
    id: "analysis",
    name: "Data analysis",
    instructions:
      "Use only supplied data and cited evidence. State definitions, units and assumptions. Show calculation steps and sanity-check arithmetic. Ask for missing data rather than inventing values. Distinguish observations from causal claims; do not claim to have executed analysis code.",
  },
  {
    id: "testing",
    name: "Testing & verification",
    instructions:
      "Review requirements, edge cases, failure paths and contradictions. Propose concrete checks with expected results. Flag unsupported facts, invented citations, and claims that code was executed or tests passed. No execution tool is available, so proposed checks are not completed tests.",
  },
);
const initialAgents: TeamAgent[] = [
  {
    id: "momo",
    name: "Momo",
    role: "Team coordinator",
    instructions:
      "Understand the user’s goal, delegate to the right specialists, and return one useful final answer. Prefer a small practical plan. Involve only the teammates needed for this request, not the whole office. Do not invent completed actions.",
    skills: ["planning", "review"],
    webSearch: false,
    color: "#eeaf70",
  },
  {
    id: "sage",
    name: "Sage",
    role: "Researcher",
    instructions:
      "Investigate questions, gather evidence, and explain uncertainty.",
    skills: ["research"],
    webSearch: true,
    color: "#98bfa1",
  },
  {
    id: "pip",
    name: "Pip",
    role: "Developer",
    instructions:
      "Build solutions as runnable code proposals and help debug software.",
    skills: ["code", "review"],
    webSearch: false,
    color: "#a4b6ef",
  },
  {
    id: "luna",
    name: "Luna",
    role: "Writer",
    instructions: "Turn ideas into polished, useful drafts and explanations.",
    skills: ["writing"],
    webSearch: false,
    color: "#dab0d5",
  },
  {
    id: "nova",
    name: "Nova",
    role: "Planner",
    instructions:
      "Create realistic plans, organize work, and design clear user experiences.",
    skills: ["planning", "review"],
    webSearch: false,
    color: "#bdb0e6",
  },
];
initialAgents.push(
  {
    id: "coco",
    name: "Coco",
    role: "Designer",
    instructions:
      "Design practical, coherent interfaces and visual directions. Work with Pip on implementation and Luna on clear interface copy.",
    skills: ["design", "review"],
    webSearch: false,
    color: "#c8ae86",
  },
  {
    id: "atlas",
    name: "Atlas",
    role: "Data analyst",
    instructions:
      "Analyze numbers and evidence supplied in the prompt or by Sage. Explain methods and uncertainty. Do not invent datasets or results.",
    skills: ["analysis", "research"],
    webSearch: false,
    color: "#81b1b6",
  },
  {
    id: "echo",
    name: "Echo",
    role: "Quality reviewer",
    instructions:
      "Independently review teammates' work against the user's request. Send specific corrections back to the responsible specialist. Ask for input when missing evidence or constraints prevent a reliable answer.",
    skills: ["testing", "review"],
    webSearch: false,
    color: "#c3b87f",
  },
);
export const terminal = (run: Run) =>
  [
    "completed",
    "completed_with_warnings",
    "failed",
    "cancelled",
    "needs_input",
  ].includes(run.status);
export const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export class OfficeStore {
  public store: Store;
  public pool: ProviderPool;
  protected file: string;
  protected writer: StoreWriter;
  protected terminalWrites = new Set<string>();
  constructor(
    public readonly directory: string,
    pool?: ProviderPool,
    secrets?: Secrets,
  ) {
    fs.mkdirSync(directory, { recursive: true });
    this.file = path.join(directory, "momo-office.json");
    this.store = {
      version: STORE_VERSION,
      providers: defaultProviderSettings(),
      agents: structuredClone(initialAgents),
      skills: structuredClone(initialSkills),
      runs: [],
      settings: {
        numCtx: 8192,
        timeoutMs: 240000,
        idleTimeoutMs: 90000,
        temperature: 0.35,
        numPredict: 2048,
        keepAlive: "10m",
        finalMode: "assemble",
        search: { provider: "duckduckgo" },
        model: process.env.OLLAMA_MODEL || "llama3.2:latest",
        ollamaUrl: process.env.OLLAMA_URL || "http://127.0.0.1:11434",
      },
    };
    if (fs.existsSync(this.file)) {
      let saved: Store | undefined;
      try {
        saved = migrate(JSON.parse(fs.readFileSync(this.file, "utf8")));
        this.validateSettings(saved.settings);
      } catch (e) {
        if (e instanceof NewerStoreError) throw e;
        saved = undefined;
        const backup = path.join(
          directory,
          `momo-office.corrupt-${Date.now()}.json`,
        );
        fs.copyFileSync(this.file, backup, fs.constants.COPYFILE_EXCL);
        this.store.notice = `Saved data was corrupt. A backup was kept as ${path.basename(backup)}; a fresh office was created.`;
      }
      if (saved) {
        this.store = saved;
        this.store.providers = Object.fromEntries(
          cloudIds.map((id) => [
            id,
            { ...defaultProviderSettings()[id], ...saved.providers?.[id] },
          ]),
        ) as Store["providers"];
        for (const a of this.store.agents) {
          if (typeof a.model === "string")
            a.model = { provider: "ollama", model: a.model };
          a.fallbackChain = this.normalizeChain(
            a.fallbackChain || (a.model ? [a.model] : []),
          );
          a.model = a.fallbackChain[0];
        }
        this.store.version = STORE_VERSION;
        for (const run of this.store.runs)
          if (!terminal(run)) {
            run.status = "failed";
            run.resumable = true;
            run.error =
              "The app closed during this request. Retry to start a fresh run.";
            for (const step of run.steps)
              if (step.status === "working") step.status = "failed";
          }
      }
    }
    this.pool = pool || createPool(directory, () => this.store, secrets);
    for (const a of this.store.agents) {
      a.fallbackChain = this.normalizeChain(a.fallbackChain || []);
      a.model = a.fallbackChain[0];
    }
    this.store = this.pool.secrets.safe(this.store);
    this.writer = new StoreWriter(
      this.file,
      () => JSON.stringify(this.pool.secrets.safe(this.store)),
      () => {
        this.store.notice =
          "Saved data could not be written. Check disk space and permissions.";
      },
    );
    this.cleanupResults(true);
    this.save();
  }
  protected save() {
    this.writer.schedule();
  }
  async flush() {
    await this.writer.flush();
  }
  protected cleanupResults(removeTemporary = false) {
    const directory = path.join(this.directory, "results");
    if (!fs.existsSync(directory)) return;
    const keep = new Set(this.store.runs.map((r) => `${r.id}.md`));
    for (const file of fs.readdirSync(directory))
      if (
        (file.endsWith(".md") && !keep.has(file)) ||
        (removeTemporary && file.endsWith(".md.tmp"))
      )
        fs.unlinkSync(path.join(directory, file));
  }
  snapshot() {
    const value = this.pool.secrets.safe(this.store);
    for (const run of value.runs)
      if (this.terminalWrites.has(run.id)) run.status = "working";
    return value;
  }
  normalizeChain(value: unknown): ModelRef[] {
    const refs = Array.isArray(value) ? value : [];
    if (refs.length > 8) throw new Error("Use at most eight fallback entries.");
    const result: ModelRef[] = [];
    for (const ref of refs) {
      if (
        !ref ||
        !["ollama", ...cloudIds].includes(ref.provider) ||
        typeof ref.model !== "string" ||
        !/^[a-zA-Z0-9._:/-]{1,150}$/.test(ref.model)
      )
        throw new Error("Invalid provider or model reference.");
      if (ref.provider === "openrouter" && !ref.model.endsWith(":free"))
        throw new Error("OpenRouter accepts explicit :free models only.");
      if (
        !result.some(
          (r) => r.provider === ref.provider && r.model === ref.model,
        )
      )
        result.push({ provider: ref.provider, model: ref.model });
    }
    const local = result.find((r) => r.provider === "ollama") || {
      provider: "ollama" as const,
      model: this.store.settings.model,
    };
    return [...result.filter((r) => r.provider !== "ollama"), local];
  }
  providerState() {
    return {
      lastVerified,
      desktop: process.env.MOMO_DESKTOP === "1",
      providers: cloudIds.map((id) => ({
        id,
        ...this.store.providers[id],
        hasKey: Boolean(this.pool.secrets.get(id)),
        usage: this.pool.status(id),
        models: this.pool.models(id),
        docs: providersConfig[id].docs,
        keyURL: providersConfig[id].keyURL,
        privacy: providersConfig[id].privacy,
        quotaNote: providersConfig[id].quotaNote,
      })),
    };
  }
  configureProvider(id: CloudId, value: any) {
    if (!cloudIds.includes(id)) throw new Error("Unknown provider.");
    if (this.store.runs.some((r) => !terminal(r)))
      throw new Error(
        "Finish or cancel queued work before changing providers.",
      );
    const old = this.store.providers[id];
    const dailyCap = Number(value.dailyCap);
    const rpm =
      value.rpm === null || value.rpm === "" ? null : Number(value.rpm);
    if (
      !Number.isInteger(dailyCap) ||
      dailyCap < 0 ||
      dailyCap > 1000000 ||
      (rpm !== null && (!Number.isInteger(rpm) || rpm < 1 || rpm > 100000))
    )
      throw new Error("Enter valid request caps.");
    const consented = old.consented || value.consented === true;
    if (value.enabled === true && (!consented || !dailyCap))
      throw new Error(
        "Confirm the provider data policy and set a positive daily cap before enabling cloud.",
      );
    const selectedModel = clean(value.selectedModel, 150),
      codeModel = clean(value.codeModel, 150);
    for (const model of [selectedModel, codeModel])
      if (model) this.normalizeChain([{ provider: id, model }]);
    this.store.providers[id] = {
      enabled: value.enabled === true,
      consented,
      dailyCap,
      rpm,
      selectedModel,
      codeModel,
    };
    this.save();
    return this.providerState();
  }
  async autoAssign() {
    const warnings: string[] = [];
    for (const id of cloudIds)
      if (this.pool.enabled(id)) {
        try {
          await this.pool.discover(id);
        } catch {
          warnings.push(`${id}: model list unavailable; omitted.`);
        }
      }
    const pick = (id: CloudId, code = false): ModelRef[] => {
      const config = this.store.providers[id];
      const models = this.pool
        .models(id)
        .filter((m) => m.json && (!code || m.code));
      const selected =
        models.find(
          (m) => m.id === (code ? config.codeModel : config.selectedModel),
        ) || models[0];
      return this.pool.enabled(id) && selected
        ? [{ provider: id, model: selected.id }]
        : [];
    };
    const agents = this.store.agents.map((a) => {
      const order: CloudId[] =
        a.id === "momo"
          ? ["gemini", "openrouter"]
          : a.id === "sage"
            ? ["gemini", "groq"]
            : a.id === "echo"
              ? ["openrouter", "gemini"]
              : ["groq", "gemini"];
      const local = a.fallbackChain?.find((r) => r.provider === "ollama") || {
        provider: "ollama" as const,
        model: this.store.settings.model,
      };
      return {
        id: a.id,
        name: a.name,
        fallbackChain: this.normalizeChain([
          ...order.flatMap((id) => pick(id, a.id === "pip" && id === "groq")),
          local,
        ]),
      };
    });
    warnings.push(
      "Only enabled, consented providers with verified free models are included. Echo selects a different known family at review time.",
    );
    return { agents, warnings };
  }
  applyAssignments(value: any) {
    if (this.store.runs.some((r) => !terminal(r)))
      throw new Error("Finish or cancel queued work before changing the team.");
    if (!Array.isArray(value) || value.length !== this.store.agents.length)
      throw new Error("Review every teammate before applying.");
    const changes = this.store.agents.map((a) => {
      const candidate = value.find((v: any) => v.id === a.id);
      if (!candidate) throw new Error("Missing teammate.");
      return { a, chain: this.normalizeChain(candidate.fallbackChain) };
    });
    for (const { a, chain } of changes) {
      a.fallbackChain = chain;
      a.model = chain[0];
    }
    this.save();
    return this.snapshot();
  }
  private validateSettings(value: Settings) {
    for (const [key, min, max, defaultValue] of [
      ["timeoutMs", 1000, 3600000, 240000],
      ["idleTimeoutMs", 1000, 600000, 90000],
      ["numPredict", 128, 32768, 2048],
    ] as const)
      if (
        !Number.isInteger(value[key] ?? defaultValue) ||
        (value[key] ?? defaultValue) < min ||
        (value[key] ?? defaultValue) > max
      )
        throw new Error(`Invalid ${key}.`);
    if (
      !Number.isFinite(value.temperature ?? 0.35) ||
      (value.temperature ?? 0.35) < 0 ||
      (value.temperature ?? 0.35) > 2
    )
      throw new Error("Temperature must be between 0 and 2.");
    if (
      value.keepAlive !== undefined &&
      !/^(0|[1-9][0-9]{0,3}[smh])$/.test(value.keepAlive)
    )
      throw new Error("keepAlive must be 0 or a duration such as 10m.");
    if ((value.numPredict ?? 2048) >= (value.numCtx ?? 8192))
      throw new Error("numPredict must be smaller than numCtx.");
    if (
      value.finalMode !== undefined &&
      !["assemble", "rewrite"].includes(value.finalMode)
    )
      throw new Error("Invalid finalMode.");
    if (value.search) validateSearch(value.search);
    if (
      !Number.isInteger(value.numCtx ?? 8192) ||
      (value.numCtx ?? 8192) < 2048 ||
      (value.numCtx ?? 8192) > 1048576
    )
      throw new Error("numCtx must be an integer from 2048 to 1048576.");
    if (!/^[a-zA-Z0-9._:/-]{1,100}$/.test(value.model))
      throw new Error("Enter a valid Ollama model name.");
    if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/.test(value.ollamaUrl))
      throw new Error(
        "Use a local Ollama address, such as http://127.0.0.1:11434.",
      );
    const port = Number(new URL(value.ollamaUrl).port);
    if (port < 1 || port > 65535) throw new Error("Invalid Ollama port.");
  }
  settings(value: unknown) {
    if (this.store.runs.some((r) => !terminal(r)))
      throw new Error(
        "Finish or cancel queued work before changing the model.",
      );
    const v = this.pool.secrets.safe(value) as Settings;
    const settings = {
      timeoutMs: v?.timeoutMs ?? this.store.settings.timeoutMs ?? 240000,
      idleTimeoutMs:
        v?.idleTimeoutMs ?? this.store.settings.idleTimeoutMs ?? 90000,
      temperature: v?.temperature ?? this.store.settings.temperature ?? 0.35,
      numPredict: v?.numPredict ?? this.store.settings.numPredict ?? 2048,
      keepAlive: v?.keepAlive ?? this.store.settings.keepAlive ?? "10m",
      finalMode: v?.finalMode ?? this.store.settings.finalMode ?? "assemble",
      search: validateSearch(
        v?.search || this.store.settings.search || { provider: "duckduckgo" },
      ),
      numCtx: v?.numCtx ?? this.store.settings.numCtx ?? 8192,
      model: clean(v?.model, 100),
      ollamaUrl: clean(v?.ollamaUrl, 100).replace(/\/$/, ""),
    };
    this.validateSettings(settings);
    this.store.settings = settings;
    this.save();
    return settings;
  }
  agent(value: unknown, id?: string) {
    const v = this.pool.secrets.safe(value) as TeamAgent;
    const existing = this.store.agents.find((a) => a.id === id);
    if (id && !existing) throw new Error("Agent not found.");
    if (!id && this.store.agents.length >= 10)
      throw new Error("This office supports up to ten teammates.");
    if (this.store.runs.some((r) => !terminal(r)))
      throw new Error("Finish or cancel queued work before changing the team.");
    const agent: TeamAgent = {
      id: existing?.id || randomUUID(),
      name: clean(v?.name, 32),
      role: existing?.id === "momo" ? "Team coordinator" : clean(v?.role, 80),
      instructions: clean(v?.instructions, 6000),
      model:
        typeof v?.model === "string"
          ? { provider: "ollama", model: clean(v.model, 100) }
          : v?.model,
      fallbackChain: this.normalizeChain(
        typeof v?.model === "string"
          ? v.model
            ? [{ provider: "ollama", model: v.model }]
            : []
          : v?.fallbackChain || (v?.model ? [v.model] : []),
      ),
      skills: Array.isArray(v?.skills)
        ? [...new Set(v.skills)].filter((s) =>
            this.store.skills.some((k) => k.id === s),
          )
        : [],
      webSearch: existing?.id === "momo" ? false : v?.webSearch === true,
      color: /^#[a-f\d]{6}$/i.test(v?.color) ? v.color : "#a4b6ef",
    };
    agent.model = agent.fallbackChain![0];
    if (!agent.name || !agent.role)
      throw new Error("Name and role are required.");
    if (
      this.store.agents.some(
        (a) =>
          a.id !== agent.id &&
          a.name.toLowerCase() === agent.name.toLowerCase(),
      )
    )
      throw new Error("Choose a unique agent name.");
    if (existing)
      this.store.agents[this.store.agents.indexOf(existing)] = agent;
    else this.store.agents.push(agent);
    this.save();
    return agent;
  }
  removeAgent(id: string) {
    if (id === "momo") throw new Error("The coordinator stays in the office.");
    if (this.store.runs.some((r) => !terminal(r)))
      throw new Error("Finish or cancel queued work before changing the team.");
    if (this.store.agents.length <= 2)
      throw new Error("Keep at least one specialist.");
    this.store.agents = this.store.agents.filter((a) => a.id !== id);
    this.save();
  }
  skill(value: unknown, id?: string) {
    if (this.store.runs.some((r) => !terminal(r)))
      throw new Error("Finish or cancel queued work before changing skills.");
    const v = this.pool.secrets.safe(value) as Skill;
    const existing = this.store.skills.find((s) => s.id === id);
    if (id && !existing) throw new Error("Skill not found.");
    if (!existing && this.store.skills.length >= 40)
      throw new Error("Skill library is full.");
    const skill = {
      id: existing?.id || randomUUID(),
      name: clean(v?.name, 60),
      instructions: clean(v?.instructions, 6000),
    };
    if (!skill.name || !skill.instructions)
      throw new Error("Skill name and instructions are required.");
    if (existing)
      this.store.skills[this.store.skills.indexOf(existing)] = skill;
    else this.store.skills.push(skill);
    this.save();
    return skill;
  }
  touch(run: Run) {
    run.updatedAt = new Date().toISOString();
    this.save();
  }
  markdown(run: Run) {
    return this.pool.secrets.redact(
      `# ${run.prompt}\n\nStatus: ${run.status}\n\n${run.result || "(No final answer yet.)"}\n\n---\n## Team plan\n${run.plan}\n\n${run.steps.map((s) => `### ${this.store.agents.find((a) => a.id === s.agentId)?.name || s.agentId}: ${s.title}\n\n${s.output}\n${s.sources.length ? "\nSources:\n" + s.sources.join("\n") : ""}`).join("\n\n")}\n\n## Model provenance\n${(run.answers || []).map((a) => `${a.stage} / ${a.agentId}: ${a.provider} / ${a.model}`).join("\n")}\n${(run.warnings || []).join("\n")}`,
    );
  }
}

/** One writer per office; serial, compact JSON snapshots and atomic rename. */
export class StoreWriter {
  private dirty = false;
  private timer?: ReturnType<typeof setTimeout>;
  private writing: Promise<void> = Promise.resolve();
  constructor(
    private file: string,
    private serialize: () => string,
    private failed: () => void,
  ) {}
  schedule() {
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(() => this.failed());
    }, 250);
    this.timer.unref();
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    const operation = this.writing.then(async () => {
      while (this.dirty) {
        this.dirty = false;
        const text = this.serialize();
        try {
          await fs.promises.writeFile(this.file + ".tmp", text, {
            encoding: "utf8",
            mode: 0o600,
          });
          await fs.promises.rename(this.file + ".tmp", this.file);
        } catch (e) {
          this.dirty = true;
          throw e;
        }
      }
    });
    this.writing = operation.catch(() => {});
    return operation;
  }
}
