import {sound} from "./sound";
import {AgentDialogue} from "./AgentDialogue";
import {ClockPanel} from "./ClockPanel";
import {useDisplay} from "./display";
import {DisplaySettings} from "./DisplaySettings";
import { sessionHeaders } from "./session";
import { Advanced } from "./Advanced";
import { Providers, ChainEditor, AutoAssign, ModelRef } from "./Providers";
import React, { useEffect, useRef, useState } from "react";
import "./momo.css";

type Skill = { id: string; name: string; instructions: string };
type Agent = {
  model?: ModelRef;
  fallbackChain?: ModelRef[];
  id: string;
  name: string;
  role: string;
  instructions: string;
  skills: string[];
  webSearch: boolean;
  color: string;
};
type Step = {
  id: string;
  agentId: string;
  title: string;
  status: string;
  output: string;
  sources: string[];
};
type Run = {
  id: string;
  prompt: string;
  status: string;
  plan: string;
  steps: Step[];
  notice?: string;
  resumable?: boolean;
  localOnly?: boolean;
  warnings?: string[];
  answers?: (ModelRef & { agentId: string; stage: string })[];
  review?: {
    by: string;
    feedback: string;
    approved: boolean;
    revisions: number;
  };
  result: string;
  error: string;
  createdAt: string;
  updatedAt?:string;
};
type Store = {
  notice?: string;
  agents: Agent[];
  skills: Skill[];
  runs: Run[];
  settings: { model: string; ollamaUrl: string; [key: string]: any };
};
type Connection = { connected: boolean; ready: boolean; models: string[] };
const done = (run: Run) =>
  [
    "completed",
    "completed_with_warnings",
    "failed",
    "cancelled",
    "needs_input",
  ].includes(run.status);
const phase: Record<string, string> = {
  queued: "Waiting for the team",
  planning: "Momo is planning",
  working: "Your team is working",
  reviewing: "The team is reviewing the work",
  revising: "A specialist is making corrections",
  needs_input: "Momo needs your input",
  completed: "Ready for you",
  completed_with_warnings: "Ready with warnings",
  failed: "Needs attention",
  cancelled: "Cancelled",
};
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/momo${path}`, {
    method,
    headers: {
      ...sessionHeaders(),
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method !== "GET"
      ? {
          body: JSON.stringify(body || {}),
        }
      : {}),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return response.json();
}
function Cat({ small = false }: { small?: boolean }) {
  return (
    <img
      className={small ? "mascot small" : "mascot"}
      src="/art/momo-portrait.png"
      alt="Momo the cat office manager"
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}
export function App() {
  const {prefs}=useDisplay();
  const [dialogueId,setDialogueId]=useState('');
  const [roster,setRoster]=useState(false);
  const [liveAgents,setLiveAgents]=useState<Record<string,any>>({});
  const [settingsAgent,setSettingsAgent]=useState<string>();
  const [focusedOutput,setFocusedOutput]=useState('');
  const [state, setState] = useState<Store>();
  const [connection, setConnection] = useState<Connection>();
  const [networkError, setNetworkError] = useState("");
  const [error, setError] = useState("");
  const [localOnly, setLocalOnly] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [settings, setSettings] = useState(false);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const completeSounds=useRef<Set<string>>();
  useEffect(()=>sound.install(),[]);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const load = async () => {
    try {
      setState(await api("/state"));
      setNetworkError("");
    } catch (e: any) {
      setNetworkError(e.message);
    }
  };
  useEffect(() => {
    if (state) window.dispatchEvent(new Event("momo:controls-ready"));
  }, [Boolean(state)]);
  const check = async () => {
    try {
      setConnection(await api("/connection"));
    } catch {
      setConnection(undefined);
    }
  };
  useEffect(() => {
    let live = true;
    const update = async () => {
      if (live) await load();
    };
    void update();
    void check();
    const poll = window.setInterval(update, 1500);
    const status = window.setInterval(check, 15000);
    return () => {
      live = false;
      clearInterval(poll);
      clearInterval(status);
    };
  }, []);
  useEffect(()=>{
    const select=(e:Event)=>{setDialogueId((e as CustomEvent).detail.id);setRoster(false);};
    const status=(e:Event)=>setLiveAgents(Object.fromEntries((e as CustomEvent).detail.map((a:any)=>[a.id,a])));
    window.addEventListener('momo:agent-select',select);window.addEventListener('momo:agents',status);
    return()=>{window.removeEventListener('momo:agent-select',select);window.removeEventListener('momo:agents',status);};
  },[]);
  useEffect(()=>{document.documentElement.dataset.pixelCursor=String(prefs.pixelCursor);},[prefs.pixelCursor]);
  const run = state?.runs.find((r) => r.id === selected);
  const active = state?.runs.filter((r) => !done(r)) || [];
  const perform = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const send = async (text = prompt) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const result: Run = await api("/runs", "POST", {
        prompt: text,
        localOnly,
        parentId:
          run?.status === "needs_input" && text === prompt ? run.id : undefined,
      });
      setSelected(result.id);
      setPrompt("");
      setCollapsed(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(()=>{
    if(!state)return;
    const completed=state.runs.filter(r=>['completed','completed_with_warnings'].includes(r.status)).map(r=>r.id);
    if(completeSounds.current){if(completed.some(id=>!completeSounds.current!.has(id)))sound.complete();}
    completeSounds.current=new Set(completed);
  },[state]);
  const currentStep = run?.steps.find((s) => s.status === "working");
  const worker = state?.agents.find((a) => a.id === currentStep?.agentId);
  const dialogueAgent=state?.agents.find(a=>a.id===dialogueId);
  const outputRun=[...(state?.runs||[])].reverse().find(r=>r.steps.some(s=>s.agentId===dialogueId&&s.output));
  const lastOutput=outputRun?.steps.filter(s=>s.agentId===dialogueId&&s.output).at(-1)?.output;
  const message=liveAgents[dialogueId]?.currentTask || (lastOutput?lastOutput.replace(/```[\s\S]*?```/g,'[Code proposal]').slice(0,240):liveAgents[dialogueId]?.thought||'Ready for the next idea.');
  const today=new Date().toDateString();const completedToday=(state?.runs||[]).filter(r=>['completed','completed_with_warnings'].includes(r.status)&&new Date(r.updatedAt||r.createdAt).toDateString()===today).length;
  return (
    <div className="momo-app" data-high-contrast={prefs.highContrast}>
      <header className="topbar">
        <div className="brand">
          <Cat small />
          <div>
            <strong>Momo Office</strong>
            <span>A little team for your big ideas</span>
          </div>
        </div>
        <div className="top-actions">
          <span
            className={`connection ${connection?.ready ? "online" : ""}`}
            title={
              connection?.connected
                ? connection.ready
                  ? "Ollama is connected"
                  : "Selected model is not installed"
                : "Open Ollama to connect"
            }
          >
            <i />
            {connection?.ready
              ? "Local AI"
              : connection?.connected
                ? "Model needed"
                : "Connecting to Ollama"}
          </span>
        </div>
      </header>
      <ClockPanel completed={completedToday}/>
      {networkError && (
        <div className="network-banner" role="alert">
          Office connection lost. {networkError}{" "}
          <button onClick={load}>Reconnect</button>
        </div>
      )}
      <div className="office-caption">
        <span className="live-dot" />
        {active.length
          ? `${active.length} request${active.length === 1 ? "" : "s"} in progress`
          : "Everyone’s ready when you are"}
      </div>
      <section className="conversation" aria-label="Talk to Momo">
        {run && (
          <article className={`answer-card ${collapsed ? "is-collapsed" : ""}`}>
            <button
              className="answer-heading"
              onClick={() => setCollapsed(!collapsed)}
              aria-expanded={!collapsed}
            >
              <div className="momo-avatar">🐈</div>
              <div>
                <strong>{phase[run.status]}</strong>
                <span>
                  {worker
                    ? `${worker.name} · ${currentStep?.title}`
                    : run.prompt}
                </span>
              </div>
              <span className={!done(run) ? "spinner" : "chevron"}>
                {done(run) ? (collapsed ? "⌃" : "⌄") : ""}
              </span>
            </button>
            {!collapsed && (
              <div className="answer-body">
                <p className="your-request">You: {run.prompt}</p>
                {run.plan && !run.result && <p>{run.plan}</p>}
                {run.steps.length > 0 && (
                  <details className="team-progress quest-log" aria-label="Quest log" open>
                    <summary>
                      {run.steps.filter((s) => s.status === "completed").length}{" "}
                      of {run.steps.length} assignments finished · Quest log · Team progress
                    </summary>
                    {run.steps.map((s) => (
                      <details className="step" key={s.id} open={s.id===focusedOutput||undefined}>
                        <summary>
                          <span className={`step-dot ${s.status}`} aria-label={s.status}>{s.status==='completed'?'✓':s.status==='failed'?'×':s.status==='working'?'>':'·'}</span>
                          {state?.agents.find((a) => a.id === s.agentId)
                            ?.name || "Teammate"}{" "}
                          · {s.title}
                        </summary>
                        {s.output && <pre>{s.output}</pre>}
                        {s.sources.length > 0 && (
                          <div className="sources">
                            {s.sources.map((url) => (
                              <a
                                href={url}
                                key={url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {url}
                              </a>
                            ))}
                          </div>
                        )}
                      </details>
                    ))}
                  </details>
                )}
                {run.notice && (
                  <p className="muted" role="status">
                    {run.notice}
                  </p>
                )}
                {run.review && (
                  <details className="team-progress">
                    <summary>
                      {run.review.by}'s quality check ·{" "}
                      {run.review.approved ? "Reviewed" : "Needs attention"}
                    </summary>
                    <p>{run.review.feedback}</p>
                    {run.review.revisions > 0 && (
                      <p>A specialist revised the work after feedback.</p>
                    )}
                  </details>
                )}
                {run.result && <section className="reward-panel"><h3>Your reward · the team’s answer</h3><pre className="result">{run.result}</pre></section>}
                {run.error && (
                  <p className="error" role="alert">
                    {run.error}
                  </p>
                )}
                {run.status === "cancelled" && (
                  <p>
                    This request was cancelled. Finished specialist work is
                    available above.
                  </p>
                )}
                <div className="answer-actions">
                  {!done(run) ? (
                    <button
                      onClick={() =>
                        perform(() => api(`/runs/${run.id}/cancel`, "POST"))
                      }
                    >
                      Cancel request
                    </button>
                  ) : (
                    <>
                      {run.result && (
                        <>
                          <button
                            onClick={() =>
                              perform(async () => {
                                await navigator.clipboard.writeText(run.result);
                              })
                            }
                          >
                            Copy answer
                          </button>
                          <a
                            className="button"
                            href={`/api/momo/runs/${run.id}/export`}
                          >
                            Save as Markdown
                          </a>
                        </>
                      )}
                      {run.status === "failed" && (
                        <button
                          disabled={busy}
                          onClick={async () => {
                            try {
                              await api(`/runs/${run.id}/resume`, "POST");
                              await load();
                            } catch (e: any) {
                              setError(e.message);
                            }
                          }}
                        >
                          Resume
                        </button>
                      )}
                      <button disabled={busy} onClick={() => send(run.prompt)}>
                        Try again
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </article>
        )}
        {state?.notice && (
          <p className="error" role="status">
            {state.notice}
          </p>
        )}
        {run?.warnings?.map((w) => (
          <p key={w} className="error" role="status">
            {w}
          </p>
        ))}
        {run?.answers?.length ? (
          <details className="provenance">
            <summary>
              Models used ·{" "}
              {run.localOnly ? "Local only" : "Configured fallback chain"}
            </summary>
            {run.answers.map((a, i) => (
              <p key={i}>
                {a.stage} · {a.agentId}: {a.provider} / {a.model}
              </p>
            ))}
          </details>
        ) : null}
        {error && (
          <div className="error-toast" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <nav className="inventory-bar" aria-label="Office toolbar">
            <button type="button" className="icon-button" data-tooltip="Settings" title="Settings" aria-label="Open settings" onClick={()=>{setSettingsAgent(undefined);setSettings(true);}}><span className="slot-icon gear-icon" aria-hidden="true"/></button>
            <button type="button" className="icon-button" data-tooltip="Journal" title="Journal" aria-label="Past requests" onClick={()=>setHistory(!history)}><span className="slot-icon journal-icon" aria-hidden="true"/></button>
            <button type="button" className="icon-button" data-tooltip="Quest log" title="Quest log" aria-label="Open quest log" disabled={!state?.runs.length} onClick={()=>{setSelected(state!.runs.at(-1)!.id);setCollapsed(false);}}><span className="slot-icon quest-icon" aria-hidden="true"/></button>
            <button type="button" className="icon-button" data-tooltip="Teammates" title="Talk to a teammate" aria-label="Talk to a teammate" aria-expanded={roster} onClick={()=>setRoster(!roster)}><span className="slot-icon team-icon" aria-hidden="true"/></button>
            <span className="toolbar-wordmark">MOMO OFFICE <small>small team, big ideas</small></span>
          </nav>
          <label htmlFor="momo-prompt">
            <span>Ask Momo</span>
            <span className="composer-hint">
              One prompt. Your team takes it from here.
            </span>
          </label>
          <div className="composer-input">
            <textarea
              id="momo-prompt"
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                run?.status === "needs_input"
                  ? "Add the missing details for Momo…"
                  : "What would you like us to work on?"
              }
              maxLength={12000}
              rows={2}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              className="send-button"
              type="submit"
              aria-label="Send prompt to Momo"
              disabled={!state || !prompt.trim() || busy}
            >
              {busy ? "…" : "↑"}
            </button>
          </div>
          <label className="checkbox local-only">
            <input
              type="checkbox"
              checked={localOnly}
              onChange={(e) => setLocalOnly(e.target.checked)}
            />
            Local only · block cloud models and web lookup for this request
          </label>
          <div className="composer-footer">
            <span>Momo delegates · Specialists work · One answer for you</span>
            <span>Enter to send · Shift + Enter for a new line</span>
          </div>
        </form>
      </section>
      {history && (
        <aside className="history-panel">
          <div className="panel-title">
            <h2>Journal</h2>
            <button
              aria-label="Close past requests"
              onClick={() => setHistory(false)}
            >
              ×
            </button>
          </div>
          {!state?.runs.length && <p>Your first idea starts a new story.</p>}
          {[...(state?.runs || [])].reverse().map((r) => (
            <button
              className={`history-item ${r.id === selected ? "selected" : ""}`}
              key={r.id}
              onClick={() => {
                setSelected(r.id);
                setCollapsed(false);
                setHistory(false);
              }}
            >
              <strong>{r.prompt}</strong>
              <span>
                {phase[r.status]} · {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </aside>
      )}
      {roster&&<aside className="agent-roster wood-panel" aria-label="Office teammates"><div className="panel-title"><h2>Say hello</h2><button aria-label="Close teammates" onClick={()=>setRoster(false)}>×</button></div>{state?.agents.map(a=><button key={a.id} onClick={()=>{setDialogueId(a.id);setRoster(false);}} aria-label={`Talk to ${a.name}`}>{a.name}<small>{a.role}</small></button>)}</aside>}
      {dialogueAgent&&<AgentDialogue agent={dialogueAgent} message={message} hasOutput={!!outputRun} onClose={()=>setDialogueId('')} onOutput={()=>{if(outputRun){setSelected(outputRun.id);setFocusedOutput(outputRun.steps.filter(s=>s.agentId===dialogueId&&s.output).at(-1)!.id);setCollapsed(false);setDialogueId('');}}} onModel={()=>{setSettingsAgent(dialogueId);setDialogueId('');setSettings(true);}}/>}
      {settings && state && (
        <Settings
          state={state}
          initialAgentId={settingsAgent}
          connection={connection}
          onClose={() => setSettings(false)}
          onRefresh={async () => {
            await load();
            await check();
          }}
        />
      )}
    </div>
  );
}

function Settings({
  state,
  initialAgentId,
  connection,
  onClose,
  onRefresh,
}: {
  state: Store;
  initialAgentId?:string;
  connection?: Connection;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState("team");
  const [agent, setAgent] = useState<Agent|undefined>(()=>{const a=state.agents.find(a=>a.id===initialAgentId);return a?structuredClone(a):undefined;});
  const [skill, setSkill] = useState<Skill>();
  const [model, setModel] = useState(state.settings.model);
  const [url, setUrl] = useState(state.settings.ollamaUrl);
  const [error, setError] = useState("");
  const [update, setUpdate] = useState<any>();
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const focusable = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input, textarea, select, a[href]",
          ) || [],
        ).filter((el) => el.offsetParent !== null);
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, []);
  const save = async (fn: () => Promise<unknown>, next?: () => void) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await onRefresh();
      next?.();
      setNotice("Saved.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Office settings"
        tabIndex={-1}
        ref={ref}
      >
        <div className="panel-title">
          <div>
            <h2>Your little office</h2>
            <p>Make the team your own.</p>
          </div>
          <button aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </div>
        <nav className="tabs">
          {["team", "skills", "providers", "advanced", "model", "display"].map((t) => (
            <button
              key={t}
              className={t === tab ? "active" : ""}
              onClick={() => {
                setTab(t);
                setAgent(undefined);
                setSkill(undefined);
                setNotice("");
                setError("");
              }}
            >
              {t === "display" ? "Display" : t === "advanced"
                ? "Advanced"
                : t === "providers"
                  ? "Providers"
                  : t === "model"
                    ? "Models"
                    : t === "team"
                      ? "Teammates"
                      : "Skills"}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          {tab === "display" && <DisplaySettings/>}
          {tab === "providers" && <Providers />}
          {tab === "advanced" && (
            <Advanced settings={state.settings} onSaved={onRefresh} />
          )}
          {tab === "team" && !agent && (
            <>
              <div className="section-heading">
                <p>
                  {state.agents.length} teammates · AI requests run one at a
                  time
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    setAgent({
                      id: "",
                      name: "",
                      role: "",
                      instructions: "",
                      skills: [],
                      webSearch: false,
                      color: "#a4b6ef",
                    })
                  }
                >
                  + Add agent
                </button>
              </div>
              {new Set(
                state.agents.flatMap((a) =>
                  (a.fallbackChain || [])
                    .filter((r) => r.provider === "ollama")
                    .map((r) => r.model),
                ),
              ).size > 2 && (
                <p className="error">
                  More than two local models are assigned. Switching models can
                  use extra RAM and slow the queue.
                </p>
              )}
              <AutoAssign onSaved={onRefresh} />
              <div className="agent-grid">
                {state.agents.map((a) => (
                  <button
                    className="agent-card"
                    key={a.id}
                    onClick={() => setAgent(structuredClone(a))}
                  >
                    <span
                      className="agent-portrait"
                      style={{ background: a.color }}
                    >
                      {a.id === "momo" ? "🐈" : a.name.charAt(0)}
                    </span>
                    <strong>{a.name}</strong>
                    <span>{a.role}</span>
                    <small className="model-badge">
                      {a.model?.provider && a.model.provider !== "ollama"
                        ? "Cloud"
                        : "Local"}{" "}
                      · {a.model?.model || "Office default model"}
                    </small>
                    <small>
                      {a.skills
                        .map(
                          (id) => state.skills.find((s) => s.id === id)?.name,
                        )
                        .join(" · ") || "No skills attached"}
                    </small>
                  </button>
                ))}
              </div>
              <p className="muted">
                Momo receives your prompts and delegates to specialists. Add up
                to ten teammates. Each can use an ordered model fallback chain.
                Cloud providers require opt-in in Providers. Requests run one at
                a time.
              </p>
            </>
          )}
          {tab === "team" && agent && (
            <form
              className="editor"
              onSubmit={(e) => {
                e.preventDefault();
                void save(
                  () =>
                    api(
                      agent.id ? `/agents/${agent.id}` : "/agents",
                      agent.id ? "PUT" : "POST",
                      agent,
                    ),
                  () => setAgent(undefined),
                );
              }}
            >
              <button
                type="button"
                className="back"
                onClick={() => setAgent(undefined)}
              >
                ← All teammates
              </button>
              <div className="form-row">
                <label>
                  Name
                  <input
                    required
                    maxLength={32}
                    value={agent.name}
                    onChange={(e) =>
                      setAgent({ ...agent, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Role
                  <input
                    required
                    maxLength={80}
                    disabled={agent.id === "momo"}
                    value={agent.role}
                    onChange={(e) =>
                      setAgent({ ...agent, role: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Ollama model (optional)
                <input
                  list="agent-models"
                  value={
                    agent.fallbackChain?.find((r) => r.provider === "ollama")
                      ?.model ||
                    (agent.model?.provider === "ollama"
                      ? agent.model.model
                      : "")
                  }
                  maxLength={100}
                  placeholder={`Office default: ${state.settings.model}`}
                  onChange={(e) => {
                    const local = {
                      provider: "ollama" as const,
                      model: e.target.value || state.settings.model,
                    };
                    setAgent({
                      ...agent,
                      model:
                        agent.model?.provider === "ollama"
                          ? local
                          : agent.model,
                      fallbackChain: [
                        ...(agent.fallbackChain || []).filter(
                          (r) => r.provider !== "ollama",
                        ),
                        local,
                      ],
                    });
                  }}
                />
                <datalist id="agent-models">
                  {connection?.models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
              <ChainEditor
                chain={agent.fallbackChain || []}
                localModel={state.settings.model}
                onChange={(chain) =>
                  setAgent({ ...agent, fallbackChain: chain, model: chain[0] })
                }
              />
              <label>
                Instructions
                <textarea
                  rows={4}
                  maxLength={6000}
                  value={agent.instructions}
                  onChange={(e) =>
                    setAgent({ ...agent, instructions: e.target.value })
                  }
                  placeholder="What should this teammate focus on?"
                />
              </label>
              <fieldset>
                <legend>Skills</legend>
                {state.skills.map((s) => (
                  <label className="checkbox" key={s.id}>
                    <input
                      type="checkbox"
                      checked={agent.skills.includes(s.id)}
                      onChange={(e) =>
                        setAgent({
                          ...agent,
                          skills: e.target.checked
                            ? [...agent.skills, s.id]
                            : agent.skills.filter((id) => id !== s.id),
                        })
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </fieldset>
              {agent.id !== "momo" && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={agent.webSearch}
                    onChange={(e) =>
                      setAgent({ ...agent, webSearch: e.target.checked })
                    }
                  />
                  Allow web lookup (search queries leave this PC)
                </label>
              )}
              <label>
                Badge color
                <input
                  type="color"
                  value={agent.color}
                  onChange={(e) =>
                    setAgent({ ...agent, color: e.target.value })
                  }
                />
              </label>
              <div className="form-actions">
                <button className="primary" disabled={saving}>
                  Save teammate
                </button>
                {agent.id && agent.id !== "momo" && (
                  <button
                    className="danger"
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      if (window.confirm(`Remove ${agent.name} from the team?`))
                        void save(
                          () => api(`/agents/${agent.id}`, "DELETE"),
                          () => setAgent(undefined),
                        );
                    }}
                  >
                    Remove agent
                  </button>
                )}
              </div>
            </form>
          )}
          {tab === "skills" && !skill && (
            <>
              <div className="section-heading">
                <p>Reusable instructions for your teammates</p>
                <button
                  className="primary"
                  onClick={() =>
                    setSkill({ id: "", name: "", instructions: "" })
                  }
                >
                  + Add skill
                </button>
              </div>
              {state.skills.map((s) => (
                <button
                  className="skill-card"
                  key={s.id}
                  onClick={() => setSkill({ ...s })}
                >
                  <strong>✧ {s.name}</strong>
                  <span>{s.instructions}</span>
                </button>
              ))}
              <p className="muted">
                Skills guide the model. They do not install software, execute
                code, or grant access to your files. Attach them under
                Teammates.
              </p>
            </>
          )}
          {tab === "skills" && skill && (
            <form
              className="editor"
              onSubmit={(e) => {
                e.preventDefault();
                void save(
                  () =>
                    api(
                      skill.id ? `/skills/${skill.id}` : "/skills",
                      skill.id ? "PUT" : "POST",
                      skill,
                    ),
                  () => setSkill(undefined),
                );
              }}
            >
              <button
                type="button"
                className="back"
                onClick={() => setSkill(undefined)}
              >
                ← Skill library
              </button>
              <label>
                Skill name
                <input
                  required
                  maxLength={60}
                  value={skill.name}
                  onChange={(e) => setSkill({ ...skill, name: e.target.value })}
                />
              </label>
              <label>
                Instructions
                <textarea
                  required
                  rows={9}
                  maxLength={6000}
                  value={skill.instructions}
                  onChange={(e) =>
                    setSkill({ ...skill, instructions: e.target.value })
                  }
                  placeholder="Describe the method, standards, examples and expected output."
                />
              </label>
              <button className="primary" disabled={saving}>
                Save skill
              </button>
            </form>
          )}
          {tab === "model" && (
            <section className="update-check">
              <button
                type="button"
                onClick={async () => {
                  setUpdate({ loading: true });
                  try {
                    setUpdate(await api("/updates"));
                  } catch {
                    setUpdate({ error: "Update check unavailable." });
                  }
                }}
              >
                Check for updates
              </button>
              {update?.loading && (
                <p role="status">Checking GitHub Releases…</p>
              )}
              {update && !update.loading && (
                <p role="status">
                  {update.error ||
                    (update.available
                      ? `Version ${update.latest} is available.`
                      : `You’re using ${update.current}; no newer stable release was found.`)}{" "}
                  {update.url && (
                    <a href={update.url} target="_blank" rel="noreferrer">
                      View release ↗
                    </a>
                  )}
                </p>
              )}
            </section>
          )}
          {tab === "model" && (
            <form
              className="editor"
              onSubmit={(e) => {
                e.preventDefault();
                void save(() =>
                  api("/settings", "PUT", { model, ollamaUrl: url }),
                );
              }}
            >
              <div
                className={`status-card ${connection?.ready ? "ready" : ""}`}
              >
                <strong>
                  {connection?.ready
                    ? "● Ollama is ready"
                    : connection?.connected
                      ? "● Selected model not installed"
                      : "○ Ollama is not connected"}
                </strong>
                <p>
                  Uses your existing Ollama installation. Open Ollama from the
                  Windows Start menu if needed.
                </p>
                <button type="button" onClick={onRefresh}>
                  Check connection
                </button>
              </div>
              <label>
                Ollama model
                <input
                  list="models"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
                <datalist id="models">
                  {connection?.models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
              <p className="muted">
                Start with llama3.2:latest on your PC. For a missing model, run{" "}
                <code>ollama pull {model || "llama3.2"}</code> in PowerShell.
              </p>
              <div className="status-card">
                <strong>Free local model starting points</strong>
                <p>
                  Use the model selectors under Teammates. These are suggestions
                  to try, not a guarantee of best performance.
                </p>
                <p>
                  <code>qwen2.5-coder:7b</code> — coding proposals for Pip.
                  <br />
                  <code>qwen2.5:7b</code> — general reasoning and review for
                  Momo, Atlas or Echo.
                  <br />
                  <code>gemma3:4b</code> — writing and general-purpose drafts.
                  <br />
                  <code>llama3.2:latest</code> — the smaller model already on
                  your PC.
                </p>
                <p>
                  Download only the models you want with{" "}
                  <code>ollama pull MODEL_NAME</code>. Larger models take more
                  memory and can respond more slowly. There are no cloud AI
                  providers or paid-provider fallbacks.
                </p>
              </div>
              <label>
                Local Ollama address
                <input
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <button className="primary" disabled={saving}>
                Save AI settings
              </button>
              <div className="about">
                <Cat />
                <div>
                  <strong>Momo Office</strong>
                  <p>A cozy home for your AI team.</p>
                  <p>Local inference · Saved history · One request queue</p>
                  <p>
                    Outputs are drafts. Code is shown for review, never
                    executed. Web lookup uses limited DuckDuckGo Instant
                    Answers.
                  </p>
                  <p>Based on AgentOffice, licensed under MIT.</p>
                  <button
                    type="button"
                    onClick={() =>
                      (window as any).momoDesktop?.openDataFolder?.()
                    }
                  >
                    Open saved data folder (desktop app)
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
