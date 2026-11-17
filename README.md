# Momo Office 🐈

A small local AI team in a cozy pixel-art office. Give Momo one prompt; Momo plans the work, assigns specialists, passes their results between teammates, and brings you one reviewed answer.

The main screen is intentionally quiet: the office and one prompt box. Teammates, skills and model settings are behind the gear button. Past requests are behind the clock button.

## Windows app

Download **Momo-Office-0.6.0-Setup.exe** from this repository's Releases page. Close any older Momo Office window, run Setup and choose your installation folder. The default is `%LOCALAPPDATA%\Programs\Momo Office`. Setup creates Desktop and Start menu shortcuts, an `Uninstall Momo Office.exe` file inside the application folder, and a Windows Installed apps entry. The app bundles its own runtime; no Node.js or build commands are needed.

Ollama is a separate prerequisite and is reused if already installed:

1. Install or open [Ollama for Windows](https://ollama.com/download/windows).
2. If needed, run `ollama pull llama3.2` once in PowerShell.
3. Open Momo Office from its shortcut. A mascot loading screen shows startup status until both the interface and office room are ready. You can cancel startup. Ollama connection/model status is shown inside the office; an unavailable model does not trap you in the loading screen.

The first release is unsigned. Windows may show an unknown-publisher prompt. Check the repository release and its SHA256 checksum before deciding whether to run it.

Your existing AgentOffice folder is not needed to run this app. Keep it as a backup until you have verified the new app. This app uses its own data directory and does not migrate or delete the old office's database.

## Uninstall

Close Momo Office, then run `Uninstall Momo Office.exe` inside its installation folder, or select Momo Office in **Windows Settings → Apps → Installed apps → Uninstall**. Uninstall removes the application files and shortcuts. Your team settings, prompts and results remain under `%APPDATA%\momo-office\office` for a later reinstall. Ollama and its downloaded models are managed separately.

## Your team

- **Momo** — coordinator: plans, delegates and reviews.
- **Sage** — research and evidence.
- **Pip** — code proposals and debugging.
- **Luna** — writing and editing.
- **Nova** — project planning and dependencies.
- **Coco** — design and accessibility.
- **Atlas** — data analysis and assumptions.
- **Echo** — testing proposals and independent quality review.

Add, rename, edit or remove specialists under **Settings → Teammates**. Up to ten teammates can share the office. Momo stays as the coordinator. Each agent has an editable ordered provider/model fallback chain, ending in local Ollama. Cloud stays disabled until you opt in. Use **Auto-assign models** to preview role assignments, then explicitly save them. One AI call runs at a time, including across multiple queued requests. Models are local and may be loaded/unloaded by Ollama as the queue switches between them; larger models use more RAM and can respond more slowly. Up to five requests may be queued.

Skills are reusable instructions, methods and output standards. Create a skill in **Skill library**, then attach it to a teammate. Skills do not install programs, execute code or grant filesystem access. Web lookup is a separate per-agent permission. Team, skill and model edits wait until queued work finishes or is cancelled, so an assignment cannot change midway through a run.

Example prompt:

> Research the essentials for a portfolio site, write the page copy, and propose a simple implementation plan.

Momo selects one to five assignments in dependency order. Specialists receive earlier teammates’ results. Echo independently reviews the work and can request one correction; unresolved issues or missing essential data are marked as needing your input, preserving partial work. Your reply to that request carries the prior context forward. Temporary connection/server failures are retried once, and all model calls have a timeout. These checks reduce errors but do not guarantee factual correctness. Specialist work is visible under **Team progress**. Cancel stops an in-flight request. Retry starts a new run, preserving the earlier run. Final answers can be copied or saved as Markdown.

## The office and camera

The office has a meeting room, work studio, coordinator desk, lounge, reading corner and coffee kitchen. During planning and final review, the team heads to the meeting room. Specialists work at desks while others take breaks. These movements reflect queue state; they do not run extra AI conversations in the background. Agents follow paths through real doors and avoid desks, walls and tables.

The default camera fits the entire office above the prompt box. Drag the office to pan, scroll to zoom, and double-click to reset. Resize the window to automatically fit the room again.

## Local data and privacy

Windows data is stored under `%APPDATA%\momo-office\office` (the Electron user-data directory). The desktop settings screen includes an **Open saved data folder** button.

- `momo-office.json`: team, skills, model settings and up to 50 requests with their results.
- `results/`: final Markdown deliverables, saved under app-generated IDs.
- `desktop.log`: local server startup and diagnostic output.

Back up that folder while the app is closed. Requests interrupted by an unexpected app exit are marked as failed on restart and can be retried. No half-finished request silently resumes. History is retained for review; each new prompt is a separate request rather than a conversation with automatically injected past answers.

Inference defaults to your local Ollama. Optional cloud providers receive prompts and earlier teammate outputs only after explicit opt-in and per-provider consent. **Local only** on a request blocks all cloud model calls and web lookup, and carries forward to replies on that request. Web-enabled agents can send search queries to DuckDuckGo Instant Answers; this service has limited coverage and is not a full browser. Search results are cited when actually returned. No cloud AI account is required. The application server binds to `127.0.0.1` on a dynamically assigned port.

Code output is a proposal for review: agents do not execute generated code, control your PC or read arbitrary files. AI outputs and completion claims still need human review. The quality of delegation depends on the model; invalid plans are shown as errors rather than assigned to invented teammates.

## Optional free-tier cloud providers

**Cloud is optional and off by default.** No key is required for local use. In **Settings → Providers**, for each provider you want:

1. Get a key from [Google AI Studio](https://aistudio.google.com/api-keys), [Groq Console](https://console.groq.com/keys), or [OpenRouter](https://openrouter.ai/settings/keys). Choose an unbilled/free-tier project or Free Plan account; do not enable billing if you want no charges. Free access, regional eligibility, quotas and available models can change.
2. In the Windows app, enter the key in the write-only field and **Save key securely**. Keys use Electron `safeStorage` (Windows OS account encryption) in `%APPDATA%\momo-office\provider-keys.encrypted.json`, outside `momo-office.json`. The renderer cannot read a stored key. Saving fails if OS encryption is unavailable. Key removal deletes the encrypted entry. Uninstall preserves user data, including this encrypted vault; remove keys in Settings before uninstall if desired.
3. Set your daily request cap, enable the provider, read and accept its one-time transmission/data-policy confirmation, then **Save provider**. A zero cap blocks cloud. **Test connection** and **Refresh models** use metadata endpoints without sending a user prompt. The picker lists only eligible models with verified context sizes. A successful test verifies authentication/catalog access, not inference quota or answer quality.
4. Under **Teammates**, select **Auto-assign models**, review the proposed chains, then **Save these assignments**. Enabling a provider alone never changes agent assignments. You can edit and reorder each chain. Unavailable/unconfigured providers are omitted from the preview.

| Role | Preferred chain (available, enabled providers only) |
| --- | --- |
| Momo, planning/final | Gemini → OpenRouter free → Ollama |
| Pip, code | Groq code-capable → Gemini → Ollama |
| Luna, writing | Groq general → Gemini → Ollama |
| Sage, research | Gemini → Groq → Ollama |
| Echo, review | OpenRouter free from a different known author model family → Gemini → Ollama |
| Nova, Coco, Atlas, extra teammates | Groq → Gemini → Ollama |

For Pip you can choose Groq’s code model separately from its general model. These are capability-based candidates, not benchmarked “best” models. Echo compares the models that actually produced the work, not just the requested assignments. When an independent family is unavailable it falls back and records a run warning; unknown families are never represented as verified independence. This reduces correlated mistakes but cannot prevent hallucinations. Actual provider/model provenance is recorded for planning, each step and correction, review, and final answer, visible under **Models used** and included in Markdown exports.

Request meters count this installation’s inference attempts (including failures and retries) across restarts in `office/provider-usage.json`. The pool enforces minute/day limits when verified and your daily cap, reserves before a call, honors 429 `Retry-After` (seconds or HTTP date), skips cooling-down providers immediately, and always finishes the chain with Ollama. Gemini’s day resets in Pacific time; other local counters use UTC. Other apps’ requests are not included. Token-based quotas may still cause provider 429s. Unknown account-specific quotas remain unset rather than fabricated; use your provider dashboard and optional local RPM cap. Limits are not a guarantee of free billing.

**Data caveat:** cloud opt-in sends the full model request, including prior team outputs and any supplied context, to that provider. Free tiers may log or train on submitted data. Google’s free tier may use content to improve products; Groq’s retention/logging depends on its controls and policy; OpenRouter forwards to hosts with their own policies. Read the official [Google terms](https://ai.google.dev/gemini-api/terms), [Groq data policy](https://console.groq.com/docs/your-data), and [OpenRouter data policy](https://openrouter.ai/docs/guides/privacy/data-collection). Keep sensitive work local. **Local only** prevents cloud inference and web searches for that request; it does not disable explicit provider metadata tests in Settings.

In plain-server mode, keys are accepted **only** through `GEMINI_API_KEY`, `GROQ_API_KEY`, and `OPENROUTER_API_KEY` environment variables, set before starting the server. The browser key field is disabled; there is no HTTP key-write endpoint. Desktop ignores these environment keys and uses encrypted storage. Do not put keys in JSON settings, prompts, screenshots or committed files. Known keys are redacted from saved state, exports and errors, and never returned by `GET /state` or provider metadata. This redaction is a guard against accidental reflection, not a general secret scanner.

Protocol endpoints, auth, JSON/streaming notes, source links, free-model eligibility, documented quotas and **last verified date (2026-11-17)** are editable in [`providers.config.ts`](packages/server/src/momo/providers/providers.config.ts). Model catalogs supply live context limits; Gemini/Groq entries are intersected with the documented free-tier allowlist. Retired models are omitted rather than silently replaced. OpenRouter requires an explicit `:free` ID and zero advertised prices, caps prompt/completion/request routing prices at zero, and disables upstream provider fallbacks. Cloud providers currently use non-streaming completions; streaming protocols are documented in the config for a future UI. All provider behavior tests use mocks; no real key or cloud quota is consumed by CI.

## Performance

The default is `llama3.2:latest` (the local 3B model). It is a practical starting point for a Ryzen 5 5600G and 32 GB RAM. AMD RX 6600 acceleration depends on Ollama's current supported backends; CPU inference can take longer. Settings accepts any installed Ollama model by its exact name. Under Teammates, choose each agent’s local last fallback and optional cloud chain. Clearing its local model field uses the current office default. Starting points include `qwen2.5-coder:7b` for code, `qwen2.5:7b` for general reasoning/review, and `gemma3:4b` for writing. These are candidates to evaluate on your own tasks, not measured winners. Pull only the models you want using `ollama pull MODEL_NAME`. OpenRouter is restricted to zero-price `:free` catalog entries and zero-price routing. Gemini and Groq require free/unbilled accounts; the app cannot determine your billing plan. No paid fallback models are selected. A model request times out after four minutes, with the failure visible in the request history.

## Development

Node.js 22.12+ is required to build from source. The installer bundles the app runtime.

```sh
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:3000`. For the desktop shell, run `npm run desktop` after building.

```sh
npm test
npx playwright install chromium
npm run test:ui
node tests/desktop.cjs
npm run dist:win
```

Build the Windows application on Windows for native executable resource editing. The first build downloads Electron and packaging tools. `output/` contains the Setup executable. Nothing under `node_modules`, `dist`, `output`, test results or local user data belongs in Git.

Release executables are built on Windows CI. Engine and browser integration tests use mock AI responses. The pipeline checks desktop startup/shutdown both before and after packaging; local verification also uses Linux with a display server. Actual AMD GPU inference, model quality and live search availability still need verification on your PC.

## Credits and license

Based on [AgentOffice by Harish Kotra](https://github.com/harishkotra/agent-office), with its MIT license and CC0-based character sprites (with MIT adaptations) retained. Momo's mascot was generated for this project. Momo Office replaces the autonomous demo engine, old floating panels, SQLite tooling and unused packages with a coordinator, serial task queue and compact desktop app. See [LICENSE](LICENSE).

## Reliability upgrades — phase 1

The context budget defaults to `numCtx: 8192`, estimates tokens as characters / 3.5, and reserves completion space. Every model request trims older specialist evidence before older follow-up context; system instructions and the current assignment are protected. Trimming is shown on the run. If protected text alone cannot fit, the request fails with guidance rather than silently losing instructions.

Corrupt saved JSON is copied to `momo-office.corrupt-<timestamp>.json` before a fresh office is created, with a notice in the UI. Stores migrate by version; a newer-version store is never overwritten. Pruning history also removes its Markdown result; startup removes orphan Markdown results. A reviewer can request one revision. Only explicit `needsInput: true` pauses for input; remaining review concerns finish as `completed_with_warnings` and appear in the UI and export.

## Quality upgrades — phase 2

Planning and review use Ollama JSON schemas, validate their contents, and retry once with the validation error. Plans can specify `dependsOn` as unique earlier task indexes; omission means all earlier outputs. Long prose is compressed extractively after about 3,000 characters; fenced code is retained intact. The default `finalMode: "assemble"` asks Momo only for an introduction and caveats, then appends specialist work and sources verbatim. `"rewrite"` opts into the previous synthesis behavior.

Search is a `SearchProvider`: DuckDuckGo Instant Answers remains the default; optional local SearXNG uses a loopback URL, and Brave/Tavily use server environment variables `BRAVE_API_KEY` / `TAVILY_API_KEY`. No keys go in settings. Non-DDG search fetches up to three returned public pages with bounded size/time and redirect checks; failed pages are omitted, and only successfully returned page URLs are supplied as citations. Source text is explicitly untrusted. Local-only requests disable every search provider. Search services may charge separately; the optional search adapters are not cloud AI dependencies.

## Robustness upgrades — phase 3

Ollama streams partial specialist text, with throttled persistence and cancellation while streaming. The idle timeout is 90 seconds; the existing four-minute total cap remains the default and can be increased up to one hour. A length-limited response gets at most one automatic continuation. **Resume** on failed/interrupted work keeps completed steps and restarts at the failed step; **Try again** starts a fresh run. Partial failed-step text remains visible until resume restarts that step.

**Settings → Advanced** validates total/idle timeouts, temperature, output reserve, context size, final mode and search configuration. Defaults remain temperature 0.35, `num_predict: 2048`, `num_ctx: 8192`. `keepAlive` defaults to `10m` (or use `0` to unload). Teammates warns when more than two distinct local models are assigned; loading many models can increase RAM use and model switching latency.

## Local server security — phase 4

Every API request, including GET and office live connections, checks the exact loopback Host and any supplied Origin. Non-health endpoints require a per-launch session token. Electron generates it and passes it privately to its server and preload; browser mode bootstraps it in same-origin HTML and an HttpOnly, SameSite=Strict session cookie. Tokens are not stored in office data. State changes without Origin require a valid token. Vite’s development Origin is allowed only with `NODE_ENV=development`; production does not allow it. External websites cannot read the token or frame the app.

Helmet applies a strict script CSP (same-origin scripts, no inline scripts/eval), blocks objects/frames, and limits connections to the app/loopback live transport. Inline style attributes are allowed for React/Phaser positioning, not scripts. Opening a saved page directly or calling the API without the current session token is unsupported. Health is read-only and still requires a loopback Host.


## Architecture and release verification — phase 5

`MomoEngine` keeps its public API as a small facade over focused modules: `store.ts` (versioned data and settings), `queue.ts` (serial workflow), `ollama.ts` (budgeted inference), `search.ts`, `planner.ts`, `reviewer.ts`, and `prompts.ts`. The store format stays at version 3. Saves debounce for about 250 ms through one asynchronous atomic writer; terminal results and shutdown flush pending writes. An abrupt power loss can lose the last fraction of a second of intermediate progress, not overwrite an existing file with partial JSON.

The office simulation is a plain module delivered over authenticated SSE, with the same desks, door-aware routing, meetings and breaks. Colyseus and its schema/client dependencies are removed. Workspace names are now `@momo-office/server` and `@momo-office/ui`.

**Settings → AI & app → Check for updates** makes a bounded, optional metadata request to the public GitHub Releases API. It compares stable versions and shows a release link; it never downloads or installs anything. This request contains no prompts. Startup and local inference do not wait for it.

Every Windows build publishes `SHA256SUMS.txt` and an installer `.sha256` file with the release. Before running an unsigned installer, download its checksum from the same trusted repository release and compare in PowerShell:

```powershell
Get-FileHash .\Momo-Office-0.6.0-Setup.exe -Algorithm SHA256
Get-Content .\Momo-Office-0.6.0-Setup.exe.sha256
```

The hash must match exactly. A matching hash verifies download integrity against that release, not publisher identity or the safety of generated AI output. Windows may still show an unknown-publisher warning because the build is unsigned.

## Original pixel-art restyle — rendering

The scene uses a fixed 960×640 internal canvas, nearest-neighbor rendering, integer CSS scale and integer camera zoom (1–4). Dark letterboxing absorbs unused space; smaller windows crop the world rather than blur it, and drag-to-pan remains available. Double-click resets the camera. Scene labels use a bitmap atlas generated from Silkscreen; the React overlay uses the same font. Silkscreen is SIL OFL 1.1, not a Stardew Valley font. Full asset sources and redistribution licenses are listed in [CREDITS.md](CREDITS.md).

The office is now a real Phaser tilemap with an original 16×16 canvas tileset. `tileset.ts` is the single swappable atlas definition. Art placement comes from the same `OfficeLayout.ts` wall/furniture rectangles used by pathfinding, including the existing door gaps. Furniture and agents sort by their foot/bottom Y position. Monitors, plants and coffee steam animate; Momo uses an original four-direction pixel cat. Human sheets retain their existing walk rows, with the available typing frames used at work.

**Settings → Display** controls optional window rain/leaves and a seasonal palette. Weather starts off. The clock and interpolated morning/noon/dusk/night tint follow the PC’s local time; night adds warm lamp/window glows. Auto season follows the calendar month and can be overridden. Weather and ambient decor animation respect `prefers-reduced-motion`. Display preferences contain no prompts or credentials and are saved locally in browser storage.

The React HUD uses original wooden 9-slice frames and inventory-style icon slots. The top-right clock includes a sun/moon arc, local date/season and a cosmetic count of today’s completed requests. Team progress appears as a **Quest log**; completed answers have a reward panel with the existing Copy and Save actions. Past requests appear in the **Journal**. Click an agent, or use **Talk to a teammate**, to open a portrait dialogue with status, View output and Change model actions. Hover thoughts, keyboard controls and all task behavior remain available. Display also provides an optional pixel cursor and high-contrast panels.

Sound is optional and muted by default. **Display → Optional sound** provides a master switch and separate master, music, room-tone, effect and dialogue volumes. All audio is synthesized in code: a quiet click, dialogue blips, completion notes, filtered room noise and an original short melody. No audio context starts before a genuine user gesture, including when sound preferences were previously enabled. Turning sound off stops the loops.

## Display, accessibility and performance

- UI scale offers integer **1×, 2× and 3×** independently of the world camera. At larger scales, panels scroll to keep controls accessible at the 760×640 minimum window size. The pixel cursor can be disabled; high-contrast panels use darker text on lighter parchment.
- Every HUD action is a native keyboard control. Settings tabs support Left/Right/Home/End. Escape closes dialogues and Journal/teammate panels; focus returns to the preceding control. The canvas can be focused: arrow keys pan, +/− zoom, and 0 resets. A keyboard-accessible teammate roster provides the same dialogues as clicking sprites.
- Reduced motion stops weather, ambient sprites, cat/typing animations and typewriter text, and snaps server movement instead of tweening it. No screen shake is used. These are contrast/accessibility measures, not a claim of a completed WCAG audit.
- The real tilemap is built once and cached; furniture is cached per depth-sorted object. The native Canvas 2D renderer avoids software WebGL overhead for this small pixel scene. Animation/timing work reuses scene objects; React only receives changed status text rather than every position update.
- The target is 60 fps at 1080p with ten agents. The shared headless Linux environment measured roughly **27–31 fps** with Canvas 2D (software WebGL was about 16 fps); an empty-page baseline was about 59 fps. This does **not** verify the 60 fps target on a Windows/RX 6600 desktop. Actual hardware performance still needs measurement; it is not represented as a passed requirement.

`npm run test:ui` checks pixel rendering, integer zoom, real sprite-click dialogue, quest steps, keyboard tabs, UI scaling, muted/gesture-gated audio, and reduced-motion weather. It captures screenshots at 1920×1080, 1280×800 and 760×640, plus the mobile layout. `MOMO_PROFILE_VISUALS=1` adds optional renderer/compositor diagnostics to that test. Tests use mock AI completions.

All new tiles, cat animation, HUD frames, cursor art and sounds are original MIT project assets. The only third-party art/font assets are **Silkscreen (SIL OFL 1.1)** and **MetroCity characters (CC0 1.0), with Pixel Agents adaptations (MIT)**. Full sources and bundled license locations are in [CREDITS.md](CREDITS.md). No Stardew Valley art, fonts, audio or music are included.
