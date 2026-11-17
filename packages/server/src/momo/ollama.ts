import type { RunQueue } from "./queue";
import type { TeamAgent } from "./store";
import { budgetMessages } from "./budget";
import { family, Trace } from "./providers/types";
export { ollamaComplete, OllamaProvider } from "./providers/ollama";
export async function ask(
  this: RunQueue,
  messages: { role: string; content: string }[],
  signal: AbortSignal,
  json: boolean | object = false,
  agent?: TeamAgent,
) {
  signal.throwIfAborted();
  messages = this.pool.secrets.safe(messages);
  const run = this.store.runs.find((r) => r.id === this.activeRun);
  const budget = budgetMessages(
    messages,
    this.store.settings.numCtx ?? 8192,
    this.store.settings.numPredict ?? 2048,
  );
  messages = budget.messages;
  if (budget.trimmed && run) {
    run.notice =
      "Older specialist output/context was trimmed to fit the model context budget.";
    this.touch(run);
  }
  const reviewing = run?.status === "reviewing";
  const authors = reviewing
    ? run?.steps.flatMap((s) => s.answers || []) || []
    : [];
  let lastPartial = 0;
  const onPartial = (text: string) => {
    signal.throwIfAborted();
    const step = run?.steps.find(
      (s) => s.status === "working" && s.agentId === agent?.id,
    );
    if (step) {
      step.output = this.pool.secrets.redact(text).slice(0, 200000);
      if (Date.now() - lastPartial >= 250) {
        lastPartial = Date.now();
        this.touch(run!);
      }
    }
  };
  let answer;
  if (this.complete) {
    // Legacy injected local completion retained for deterministic engine tests.
    let text = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        text = await this.complete(
          messages,
          {
            ...this.store.settings,
            model:
              agent?.model?.provider === "ollama"
                ? agent.model.model
                : this.store.settings.model,
          },
          signal,
          json,
          onPartial,
        );
        break;
      } catch (e: any) {
        signal.throwIfAborted();
        if (
          attempt ||
          !(e.retryable || e.name === "TypeError" || e.name === "TimeoutError")
        )
          throw e;
      }
    }
    const model =
      agent?.model?.provider === "ollama"
        ? agent.model.model
        : this.store.settings.model;
    answer = {
      text,
      provider: "ollama" as const,
      model,
      family: family(model),
      warning: undefined,
    };
  } else {
    answer = await this.pool.complete(
      this.normalizeChain(agent?.fallbackChain || []),
      {
        messages,
        signal,
        json: !!json,
        schema: typeof json === "object" ? json : undefined,
        onPartial,
      },
      run?.localOnly === true,
      authors,
      reviewing,
    );
  }
  signal.throwIfAborted();
  const step = run?.steps.find(
    (s) => s.status === "working" && s.agentId === agent?.id,
  );
  const trace: Trace = {
    provider: answer.provider,
    model: answer.model,
    family: answer.family,
    agentId: agent?.id || "momo",
    stage: run?.status || "unknown",
    stepId: step?.id,
    at: new Date().toISOString(),
  };
  if (run) {
    (run.answers ||= []).push(trace);
    if (step) (step.answers ||= []).push(trace);
    if (answer.warning && !run.warnings?.includes(answer.warning))
      (run.warnings ||= []).push(answer.warning);
    this.touch(run);
  }
  return this.pool.secrets.redact(answer.text);
}
