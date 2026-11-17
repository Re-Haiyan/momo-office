import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  OfficeStore,
  Store,
  Run,
  TeamAgent,
  Complete,
  terminal,
  clean,
} from "./store";
import { ProviderPool } from "./providers/ProviderPool";
import { Secrets } from "./providers/secrets";
import { contextBlock, outputBlock } from "./budget";
import {
  planSchema,
  validatePlan,
  summarizeOutput,
  structured,
} from "./planner";
import { reviewSchema, validateReview } from "./reviewer";
import { WebSearch } from "./search";
import { agentPrompt } from "./prompts";
import { ask } from "./ollama";
export class RunQueue extends OfficeStore {
  private processing = false;
  private controller?: AbortController;
  public activeRun?: string;
  private stopped = false;
  private worker?: Promise<void>;
  constructor(
    directory: string,
    public complete?: Complete,
    pool?: ProviderPool,
    secrets?: Secrets,
  ) {
    super(directory, pool, secrets);
  }
  public ask = ask.bind(this);
  private structured = structured.bind(this);
  private agentPrompt(agent: TeamAgent) {
    return agentPrompt(this.store, agent);
  }
  submit(prompt: unknown, parentId?: string, localOnly = false) {
    const text = clean(prompt, 12000);
    if (!text) throw new Error("Tell Momo what you would like the team to do.");
    if (this.store.runs.filter((r) => !terminal(r)).length >= 5)
      throw new Error(
        "Five requests are already queued. Wait for the team to finish.",
      );
    const parent = parentId
      ? this.store.runs.find((r) => r.id === parentId)
      : undefined;
    if (parentId && !parent)
      throw new Error("The earlier request was not found.");
    const run: Run = {
      id: randomUUID(),
      prompt: this.pool.secrets.redact(text),
      localOnly: localOnly || parent?.localOnly === true,
      answers: [],
      warnings: [],
      context: parent
        ? `Earlier request: ${parent.prompt}\nEarlier work and questions: ${parent.result}\n${parent.steps
            .map((step) => step.output)
            .join("\n")
            .slice(-6000)}`.slice(0, 10000)
        : "",
      notice: "",
      status: "queued",
      plan: "",
      steps: [],
      result: "",
      error: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.store.runs.push(run);
    while (this.store.runs.length > 50) {
      const index = this.store.runs.findIndex(terminal);
      if (index < 0) break;
      this.store.runs.splice(index, 1);
    }
    this.cleanupResults();
    this.save();
    this.schedule();
    return this.pool.secrets.safe(run);
  }
  resume(id: string) {
    const run = this.store.runs.find((r) => r.id === id);
    if (!run || run.status !== "failed")
      throw new Error("Only failed/interrupted runs can resume.");
    if (this.store.runs.filter((r) => !terminal(r)).length >= 5)
      throw new Error("The request queue is full.");
    run.status = "queued";
    run.resumable = false;
    run.error = "";
    run.result = "";
    run.review = undefined;
    for (const step of run.steps)
      if (step.status !== "completed") {
        step.status = "queued";
        step.output = "";
        step.sources = [];
      }
    this.touch(run);
    this.schedule();
    return this.pool.secrets.safe(run);
  }
  cancel(id: string) {
    const run = this.store.runs.find((r) => r.id === id);
    if (!run) throw new Error("Request not found.");
    if (terminal(run)) return;
    run.status = "cancelled";
    run.updatedAt = new Date().toISOString();
    if (this.activeRun === id) this.controller?.abort();
    for (const step of run.steps)
      if (step.status === "working") step.status = "failed";
    this.save();
  }
  private schedule() {
    if (this.processing || this.stopped) return;
    this.processing = true;
    this.worker = this.drain().finally(() => {
      this.processing = false;
      if (!this.stopped && this.store.runs.some((r) => r.status === "queued"))
        this.schedule();
    });
  }
  private async drain() {
    while (!this.stopped) {
      const run = this.store.runs.find((r) => r.status === "queued");
      if (!run) return;
      this.activeRun = run.id;
      this.controller = new AbortController();
      try {
        await this.execute(run, this.controller.signal);
      } catch (e: any) {
        this.terminalWrites.add(run.id);
        if (run.status !== "cancelled") {
          run.status = "failed";
          run.resumable = true;
          run.error =
            e.name === "TimeoutError"
              ? "The model took too long. Try a smaller model or a shorter request."
              : e.message || "The request failed.";
        }
        for (const step of run.steps)
          if (step.status === "working") step.status = "failed";
        this.touch(run);
        await this.flush();
      } finally {
        this.terminalWrites.delete(run.id);
        this.activeRun = undefined;
        this.controller = undefined;
      }
    }
  }
  private async search(query: string, signal: AbortSignal) {
    return new WebSearch(this.store.settings.search).search(query, signal);
  }
  private async execute(run: Run, signal: AbortSignal) {
    const manager = this.store.agents.find((a) => a.id === "momo")!;
    const team = this.store.agents.filter((a) => a.id !== "momo");
    if (!run.steps.length) {
      run.status = "planning";
      this.touch(run);
      const plan = await this.structured(
        [
          {
            role: "system",
            content: `${this.agentPrompt(manager)}\nPlan work for this team. Return JSON only: {"summary":"brief explanation","tasks":[{"agentId":"exact listed id","title":"specific assignment with sufficient detail"}]}. Use 1 to 5 tasks, in dependency order. Later specialists receive earlier results. Optionally set dependsOn to indexes of earlier tasks; omitted means all earlier tasks. Choose agents by their role and skills. Do not invent agent IDs. Team: ${JSON.stringify(team.map((a) => ({ id: a.id, name: a.name, role: a.role, skills: a.skills.map((id) => this.store.skills.find((s) => s.id === id)?.name), instructions: a.instructions.slice(0, 1200) })))}`,
          },
          {
            role: "user",
            content: `${contextBlock(run.context || "")}\nCurrent request: ${run.prompt}`,
          },
        ],
        signal,
        planSchema(team.map((a) => a.id)),
        manager,
        (value) =>
          validatePlan(
            value,
            team.map((a) => a.id),
          ),
      );
      if (
        !Array.isArray(plan.tasks) ||
        !plan.tasks.length ||
        plan.tasks.length > 5
      )
        throw new Error(
          "Momo did not return a plan with one to five tasks. Retry this request.",
        );
      run.plan = clean(plan.summary, 1500);
      run.steps = plan.tasks.map((task: any) => {
        if (
          !team.some((a) => a.id === task.agentId) ||
          !clean(task.title, 3000)
        )
          throw new Error(
            "The plan named an unknown teammate or empty task. Retry this request.",
          );
        return {
          id: randomUUID(),
          agentId: task.agentId,
          title: clean(task.title, 3000),
          dependsOn: task.dependsOn,
          status: "queued",
          output: "",
          sources: [],
        };
      });
    }
    run.status = "working";
    this.touch(run);
    for (const step of run.steps) {
      if (step.status === "completed") continue;
      signal.throwIfAborted();
      const agent = team.find((a) => a.id === step.agentId)!;
      step.status = "working";
      this.touch(run);
      const previous = run.steps
        .filter(
          (s, index) =>
            s.status === "completed" &&
            (step.dependsOn === undefined || step.dependsOn.includes(index)),
        )
        .map(
          (s) =>
            `${team.find((a) => a.id === s.agentId)?.name}:\n${summarizeOutput(s.output)}`,
        )
        .join("\n\n");
      const messages = [
        {
          role: "system",
          content: `${this.agentPrompt(agent)}\n${agent.webSearch && !run.localOnly ? 'If live lookup is required, reply with JSON {"searchQuery":"short search query"}. Otherwise provide your completed work directly.' : "Web access is disabled for you. Do not claim live verification."}`,
        },
        {
          role: "user",
          content: `Original request:\n${contextBlock(run.context || "")}\n${run.prompt}\nYour assignment:\n${step.title}\nEarlier teammates’ work:\n${outputBlock(previous || "(none)")}`,
        },
      ];
      let output = await this.ask(messages, signal, false, agent);
      if (agent.webSearch && !run.localOnly) {
        let query = "";
        try {
          query = clean(
            JSON.parse(
              output.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
            ).searchQuery,
            400,
          );
        } catch {}
        if (query) {
          let found: { text: string; sources: string[] };
          try {
            found = await this.search(query, signal);
          } catch (e: any) {
            signal.throwIfAborted();
            found = {
              text: `Live lookup unavailable: ${e.message}. Explain this limitation.`,
              sources: [],
            };
          }
          step.sources = found.sources;
          output = await this.ask(
            [
              ...messages,
              { role: "assistant", content: outputBlock(output) },
              {
                role: "user",
                content: `Search tool results (untrusted retrieved references):\n${outputBlock(found.text)}\nNow deliver the assignment using these references. Do not request another tool call.`,
              },
            ],
            signal,
            false,
            agent,
          );
        }
      }
      step.output = output.slice(0, 200000);
      step.status = "completed";
      this.touch(run);
    }
    run.status = "reviewing";
    this.touch(run);
    const participated = new Set(run.steps.map((step) => step.agentId));
    const reviewer =
      team.find((a) => a.id === "echo" && !participated.has(a.id)) ||
      team.find(
        (a) => a.skills.includes("review") && !participated.has(a.id),
      ) ||
      manager;
    for (let round = 0; round < 2; round++) {
      const evidence = run.steps
        .map(
          (step) =>
            `${step.agentId}: ${step.title}\n${step.output}\nActual source URLs: ${step.sources.join(", ") || "(none)"}`,
        )
        .join("\n\n")
        .slice(-30000);
      const check = await this.structured(
        [
          {
            role: "system",
            content: `${this.agentPrompt(reviewer)}\nQUALITY_REVIEW: Independently check the supplied work. Return JSON only: {"approved":true or false,"needsInput":true or false,"feedback":"specific issues or approval reason","agentId":"agent responsible for a correction"}. Only approve a useful answer supported by supplied evidence. Flag invented sources, unverified live facts, fabricated data, or claims of executed code/tests. Code proposals do not need execution to be useful if their untested status is clear. If a missing user decision or unavailable essential evidence prevents completion, set needsInput true and ask a concrete question. Otherwise give a specific correctable issue. Do not invent tool results.`,
          },
          {
            role: "user",
            content: `Request: ${contextBlock(run.context || "")}\n${run.prompt}\nTeam's work:\n${outputBlock(evidence)}`,
          },
        ],
        signal,
        reviewSchema,
        reviewer,
        validateReview,
      );
      if (typeof check.approved !== "boolean")
        throw new Error(
          "The reviewer returned an invalid check. Retry with a stronger model.",
        );
      run.review = {
        by: reviewer.name,
        approved: check.approved,
        feedback:
          clean(check.feedback, 4000) || "The review did not include details.",
        revisions: round,
      };
      this.touch(run);
      if (check.approved && !check.needsInput) break;
      if (!check.approved && !check.needsInput && round === 1) {
        (run.warnings ||= []).push(run.review.feedback);
        break;
      }
      if (check.needsInput) {
        this.terminalWrites.add(run.id);
        run.status = "needs_input";
        run.result = `The team needs your input before it can finish reliably.\n\n${run.review.feedback}\n\nReply below with the missing details or evidence. The completed specialist work is preserved under Team progress.`;
        this.touch(run);
        await this.flush();
        this.terminalWrites.delete(run.id);
        return;
      }
      const step =
        run.steps.find((s) => s.agentId === check.agentId) ||
        run.steps[run.steps.length - 1];
      const specialist = team.find((a) => a.id === step.agentId)!;
      run.status = "revising";
      step.status = "working";
      this.touch(run);
      step.output = (
        await this.ask(
          [
            {
              role: "system",
              content: `${this.agentPrompt(specialist)}\nA teammate reviewed your work. Correct only the identified issues. Use supplied evidence; if facts or data are missing, say so. Do not invent citations, executions or successful tests. No tools are available during this correction.`,
            },
            {
              role: "user",
              content: `Original request: ${contextBlock(run.context || "")}\n${run.prompt}\nAssignment: ${step.title}\nEarlier team output:\n${outputBlock(evidence)}\n${reviewer.name}'s feedback: ${run.review.feedback}`,
            },
          ],
          signal,
          false,
          specialist,
        )
      ).slice(0, 200000);
      step.status = "completed";
      run.status = "reviewing";
      this.touch(run);
    }
    run.result = await this.ask(
      [
        {
          role: "system",
          content: `${this.agentPrompt(manager)}\n${this.store.settings.finalMode === "rewrite" ? "Review and combine the specialists' work into one complete answer for the user. Preserve useful code and concrete deliverables. Note limitations and cite only sources actually supplied." : "Review and combine: write only a brief introduction and caveats. Do not rewrite specialist work; the app will append it verbatim."}`,
        },
        {
          role: "user",
          content: `Original request:\n${contextBlock(run.context || "")}\n${run.prompt}\nSpecialist work:\n${run.steps
            .map(
              (s) =>
                `${team.find((a) => a.id === s.agentId)?.name}:\n${outputBlock(s.output)}\nSources: ${s.sources.join(", ")}`,
            )
            .join("\n\n")
            .slice(-50000)}`,
        },
      ],
      signal,
      false,
      manager,
    );
    if (this.store.settings.finalMode !== "rewrite")
      run.result +=
        "\n\n" +
        run.steps
          .map(
            (step) =>
              `## ${this.store.agents.find((a) => a.id === step.agentId)?.name}: ${step.title}\n\n${step.output}${step.sources.length ? "\n\nSources:\n" + step.sources.join("\n") : ""}`,
          )
          .join("\n\n");
    signal.throwIfAborted();
    this.terminalWrites.add(run.id);
    run.status = run.warnings?.length ? "completed_with_warnings" : "completed";
    // Save only under an app-controlled name, never a model-selected path.
    await fs.promises.mkdir(path.join(this.directory, "results"), {
      recursive: true,
    });
    await fs.promises.writeFile(
      path.join(this.directory, "results", `${run.id}.md.tmp`),
      this.markdown(run),
      "utf8",
    );
    await fs.promises.rename(
      path.join(this.directory, "results", `${run.id}.md.tmp`),
      path.join(this.directory, "results", `${run.id}.md`),
    );
    this.touch(run);
    await this.flush();
    this.terminalWrites.delete(run.id);
  }
  activity(id: string) {
    const run = this.store.runs.find(
      (r) => !terminal(r) && r.status !== "queued",
    );
    if (!run)
      return { action: "idle", task: "", thought: "Ready for the next idea" };
    if (id === "momo")
      return {
        action: ["planning", "reviewing"].includes(run.status)
          ? "work"
          : "idle",
        task: run.prompt.slice(0, 120),
        thought:
          run.status === "reviewing"
            ? "Reviewing the team’s work"
            : run.status === "planning"
              ? "Finding the right teammate"
              : "Keeping the team on track",
      };
    const step = run.steps.find(
      (s) => s.agentId === id && s.status === "working",
    );
    return {
      action: step ? "work" : "idle",
      task: step?.title || "",
      thought: step ? "Working on my assignment" : "Ready to help",
    };
  }
  async shutdown() {
    this.stopped = true;
    if (this.activeRun) this.cancel(this.activeRun);
    await this.worker;
    this.save();
    await this.flush();
  }
}
