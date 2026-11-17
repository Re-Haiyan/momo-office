import { sessionHeaders } from "./session";
import React, { useEffect, useState } from "react";
export type ModelRef = {
  provider: "ollama" | "gemini" | "groq" | "openrouter";
  model: string;
};
export async function providerApi(
  path: string,
  method = "GET",
  body?: unknown,
) {
  const r = await fetch("/api/momo" + path, {
    method,
    headers: {
      ...sessionHeaders(),
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "GET"
      ? {}
      : {
          body: JSON.stringify(body || {}),
        }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Provider request failed.");
  return data;
}
export function Providers() {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => setData(await providerApi("/providers"));
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    const t = setInterval(() => void load().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, []);
  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <h3>Optional cloud providers</h3>
      <p>
        Off by default. Local Ollama always stays the last fallback. Free
        availability depends on your account; use unbilled/free-tier accounts.
        No cloud prompt is sent by Test connection.
      </p>
      <p className="muted">
        Official docs last verified: {data?.lastVerified}. Request meters count
        this installation’s inference attempts, including failures, across
        restarts. They do not include other apps using your account.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {data?.providers.map((p: any) => (
        <ProviderCard
          key={p.id}
          provider={p}
          desktop={data.desktop}
          busy={busy}
          act={act}
          notice={setNotice}
        />
      ))}
    </div>
  );
}
function ProviderCard({
  provider: p,
  desktop,
  busy,
  act,
  notice,
}: {
  provider: any;
  desktop: boolean;
  busy: boolean;
  act: (fn: () => Promise<any>) => Promise<void>;
  notice: (s: string) => void;
}) {
  const [draft, setDraft] = useState(p);
  const [key, setKey] = useState("");
  useEffect(() => {
    setDraft(p);
  }, [p.enabled, p.consented, p.dailyCap, p.selectedModel, p.codeModel, p.rpm]);
  const save = async () => {
    let consented = p.consented;
    if (draft.enabled && !consented) {
      consented = window.confirm(
        `Enable ${p.id}? Your prompts, prior team work and responses will be sent to this provider. Free tiers may log prompts or use them for training. ${p.privacy} Continue?`,
      );
      if (!consented) return;
    }
    await providerApi(`/providers/${p.id}`, "PUT", { ...draft, consented });
    notice(
      "Provider settings saved. Use Test connection to load its verified free models.",
    );
  };
  return (
    <section className="provider-card editor">
      <h3>
        {p.id === "gemini"
          ? "Gemini · Google AI Studio"
          : p.id === "groq"
            ? "Groq"
            : "OpenRouter · free models only"}
      </h3>
      <p>{p.privacy}</p>
      <a href={p.keyURL} target="_blank" rel="noreferrer">
        Get a free-tier API key ↗
      </a>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
        />
        Enable this cloud provider
      </label>
      <div className="form-row">
        <label>
          Daily request cap
          <input
            type="number"
            min="0"
            max="1000000"
            value={draft.dailyCap}
            onChange={(e) =>
              setDraft({ ...draft, dailyCap: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Optional requests/minute cap
          <input
            type="number"
            min="1"
            placeholder="Account/model limit"
            value={draft.rpm ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                rpm: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
      </div>
      <p className="muted">
        {p.quotaNote} Set a positive daily cap before enabling.
      </p>
      <label>
        API key (write-only)
        <input
          type="password"
          autoComplete="off"
          disabled={!desktop || busy}
          value={key}
          placeholder={
            p.hasKey ? "Key stored — enter to replace" : "No key stored"
          }
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      {desktop ? (
        <div className="form-actions">
          <button
            type="button"
            disabled={busy || !key}
            onClick={() => {
              const value = key;
              setKey("");
              void act(async () => {
                await (window as any).momoDesktop.setProviderKey(p.id, value);
                notice("Key encrypted with OS safeStorage.");
              });
            }}
          >
            Save key securely
          </button>
          <button
            type="button"
            disabled={busy || !p.hasKey}
            onClick={() =>
              void act(async () => {
                await (window as any).momoDesktop.setProviderKey(p.id, "");
                notice("Key removed.");
              })
            }
          >
            Remove key
          </button>
        </div>
      ) : (
        <p className="muted">
          Plain-server mode: set {p.id.toUpperCase()}_API_KEY in the server
          environment and restart. Keys cannot be entered through HTTP.
        </p>
      )}
      <div className="form-row">
        <label>
          Preferred model
          <select
            value={draft.selectedModel}
            onChange={(e) =>
              setDraft({ ...draft, selectedModel: e.target.value })
            }
          >
            <option value="">First verified model</option>
            {p.models.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.id} · {m.contextWindow.toLocaleString()} context
              </option>
            ))}
          </select>
        </label>
        {p.id === "groq" && (
          <label>
            Code model for Pip
            <select
              value={draft.codeModel}
              onChange={(e) =>
                setDraft({ ...draft, codeModel: e.target.value })
              }
            >
              <option value="">First verified code-capable model</option>
              {p.models
                .filter((m: any) => m.code)
                .map((m: any) => (
                  <option key={m.id}>{m.id}</option>
                ))}
            </select>
          </label>
        )}
      </div>
      <div className="form-actions">
        <button
          className="primary"
          type="button"
          disabled={busy}
          onClick={() => void act(save)}
        >
          Save provider
        </button>
        <button
          type="button"
          disabled={busy || !p.enabled || !p.hasKey}
          onClick={() =>
            void act(async () => {
              const r = await providerApi(`/providers/${p.id}/test`, "POST");
              notice(
                r.ok
                  ? `Connection verified; ${r.models.length} eligible models.`
                  : "Connected, but no verified free models available.",
              );
            })
          }
        >
          Test connection
        </button>
        <button
          type="button"
          disabled={busy || !p.enabled || !p.hasKey}
          onClick={() =>
            void act(async () => {
              await providerApi(`/providers/${p.id}/models`, "POST");
              notice("Model list refreshed.");
            })
          }
        >
          Refresh models
        </button>
      </div>
      <label>
        Usage today: {p.usage.daily} / {p.dailyCap || "cloud blocked"}
        <meter min="0" max={p.dailyCap || 1} value={p.usage.daily} />
      </label>
      <p>
        {p.usage.rpm} requests in the last minute ·{" "}
        {p.usage.cooldownUntil > Date.now()
          ? `Cooling down until ${new Date(p.usage.cooldownUntil).toLocaleTimeString()}`
          : "No cooldown"}
      </p>
      <details>
        <summary>Official documentation</summary>
        {p.docs.map((url: string) => (
          <p key={url}>
            <a href={url} target="_blank" rel="noreferrer">
              {url}
            </a>
          </p>
        ))}
      </details>
    </section>
  );
}
export function ChainEditor({
  chain,
  onChange,
  localModel,
}: {
  chain: ModelRef[];
  onChange: (chain: ModelRef[]) => void;
  localModel: string;
}) {
  const [catalog, setCatalog] = useState<Record<string, any[]>>({});
  useEffect(() => {
    void providerApi("/providers")
      .then((d) =>
        setCatalog(
          Object.fromEntries(d.providers.map((p: any) => [p.id, p.models])),
        ),
      )
      .catch(() => {});
  }, []);
  const local = chain.find((r) => r.provider === "ollama") || {
    provider: "ollama" as const,
    model: localModel,
  };
  const cloud = chain.filter((r) => r.provider !== "ollama");
  const update = (rows: ModelRef[]) => onChange([...rows, local]);
  return (
    <fieldset>
      <legend>Ordered fallback chain</legend>
      {cloud.map((ref, i) => (
        <div className="chain-row" key={i}>
          <label>
            Provider {i + 1}
            <select
              value={ref.provider}
              onChange={(e) => {
                const rows = [...cloud];
                rows[i] = {
                  provider: e.target.value as ModelRef["provider"],
                  model: "",
                };
                update(rows);
              }}
            >
              {["gemini", "groq", "openrouter"].map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
          <label>
            Model {i + 1}
            <select
              required
              value={ref.model}
              onChange={(e) => {
                const rows = [...cloud];
                rows[i] = { ...ref, model: e.target.value };
                update(rows);
              }}
            >
              <option value="">Select verified model</option>
              {ref.model &&
                !catalog[ref.provider]?.some((m) => m.id === ref.model) && (
                  <option>{ref.model}</option>
                )}
              {catalog[ref.provider]?.map((m) => (
                <option key={m.id}>{m.id}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            aria-label={`Move fallback ${i + 1} up`}
            disabled={i === 0}
            onClick={() => {
              const rows = [...cloud];
              [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
              update(rows);
            }}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => update(cloud.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={cloud.length >= 7}
        onClick={() => update([...cloud, { provider: "gemini", model: "" }])}
      >
        + Add cloud fallback
      </button>
      <p className="muted">
        Last fallback: Local Ollama · {local.model}. Disabled, capped or
        unavailable cloud providers are skipped.
      </p>
    </fieldset>
  );
}
export function AutoAssign({ onSaved }: { onSaved: () => Promise<void> }) {
  const [preview, setPreview] = useState<any>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="assignment-preview">
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void act(async () =>
            setPreview(await providerApi("/auto-assign/preview", "POST")),
          )
        }
      >
        Auto-assign models
      </button>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div>
          <h3>Review model assignments</h3>
          {preview.agents.map((a: any) => (
            <p key={a.id}>
              <strong>{a.name}</strong>:{" "}
              {a.fallbackChain
                .map((r: ModelRef) => `${r.provider} / ${r.model}`)
                .join(" → ")}
            </p>
          ))}
          {preview.warnings.map((w: string) => (
            <p className="muted" key={w}>
              {w}
            </p>
          ))}
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await providerApi("/auto-assign/apply", "POST", {
                  agents: preview.agents,
                });
                await onSaved();
                setPreview(undefined);
              })
            }
          >
            Save these assignments
          </button>
          <button type="button" onClick={() => setPreview(undefined)}>
            Discard preview
          </button>
        </div>
      )}
    </div>
  );
}
