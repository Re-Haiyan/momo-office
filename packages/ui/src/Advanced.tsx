import React, { useState } from "react";
import { providerApi } from "./Providers";
export function Advanced({
  settings,
  onSaved,
}: {
  settings: any;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({ ...settings });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const field = (key: string, value: any) =>
    setDraft({ ...draft, [key]: value });
  return (
    <form
      className="editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
          await providerApi("/settings", "PUT", draft);
          await onSaved();
          setNotice("Advanced settings saved.");
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3>Advanced local inference</h3>
      <p>
        Applied between runs. Defaults: 4-minute total timeout, 90-second idle
        timeout, temperature 0.35, 2,048 output tokens and 8,192 context tokens.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {[
        ["timeoutMs", "Total timeout (ms)", 240000, 1000, 3600000],
        ["idleTimeoutMs", "Stream idle timeout (ms)", 90000, 1000, 600000],
        ["temperature", "Temperature", 0.35, 0, 2],
        ["numPredict", "Output token reserve (num_predict)", 2048, 128, 32768],
        ["numCtx", "Context tokens (num_ctx)", 8192, 2048, 1048576],
      ].map(([key, label, initial, min, max]) => (
        <label key={String(key)}>
          {label}
          <input
            type="number"
            required
            step={key === "temperature" ? "0.05" : "1"}
            min={Number(min)}
            max={Number(max)}
            value={draft[String(key)] ?? initial}
            onChange={(e) => field(String(key), Number(e.target.value))}
          />
        </label>
      ))}
      <label>
        Model keep-alive
        <input
          value={draft.keepAlive ?? "10m"}
          pattern="(0|[1-9][0-9]{0,3}[smh])"
          onChange={(e) => field("keepAlive", e.target.value)}
        />
      </label>
      <label>
        Final answer mode
        <select
          value={draft.finalMode ?? "assemble"}
          onChange={(e) => field("finalMode", e.target.value)}
        >
          <option value="assemble">
            Assemble · keep specialist work verbatim
          </option>
          <option value="rewrite">Rewrite · Momo synthesizes the answer</option>
        </select>
      </label>
      <label>
        Search provider
        <select
          value={draft.search?.provider ?? "duckduckgo"}
          onChange={(e) =>
            field("search", { ...draft.search, provider: e.target.value })
          }
        >
          {["duckduckgo", "searxng", "brave", "tavily"].map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
      </label>
      {draft.search?.provider === "searxng" && (
        <label>
          Local SearXNG URL
          <input
            required
            placeholder="http://127.0.0.1:8888"
            value={draft.search?.url || ""}
            onChange={(e) =>
              field("search", { ...draft.search, url: e.target.value })
            }
          />
        </label>
      )}
      <p className="muted">
        Search requires each agent’s web permission and is always blocked by
        Local only. Optional Brave/Tavily keys come from server environment
        variables.
      </p>
      <button className="primary" disabled={saving}>
        Save advanced settings
      </button>
    </form>
  );
}
