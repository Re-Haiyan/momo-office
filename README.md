# Momo Office 🐈

A small local AI team in a cozy pixel-art office. Give Momo one prompt; Momo plans the work, assigns specialists, passes their results between teammates, and brings you one reviewed answer.

The main screen is intentionally quiet: the office and one prompt box. Teammates, skills and model settings are behind the gear button. Past requests are behind the clock button.

## Windows app

Download **Momo-Office-0.2.0-Windows.exe** from this repository's Releases page and open it. This is a portable app, so no Node.js, terminal windows or application installation is needed. It extracts its runtime temporarily while running.

Ollama is a separate prerequisite and is reused if already installed:

1. Install or open [Ollama for Windows](https://ollama.com/download/windows).
2. If needed, run `ollama pull llama3.2` once in PowerShell.
3. Open Momo Office. The status at the top right shows whether Ollama and the selected model are ready.

The first release is unsigned. Windows may show an unknown-publisher prompt. Check the repository release and its SHA256 checksum before deciding whether to run it.

Your existing AgentOffice folder is not needed to run this app. Keep it as a backup until you have verified the new app. This app uses its own data directory and does not migrate or delete the old office's database.

## Your team

- **Momo** — coordinator: plans, delegates and reviews.
- **Sage** — research and evidence.
- **Pip** — code proposals and debugging.
- **Luna** — writing and editing.
- **Nova** — project planning and dependencies.
- **Coco** — design and accessibility.
- **Atlas** — data analysis and assumptions.
- **Echo** — testing proposals and independent quality review.

Add, rename, edit or remove specialists under **Settings → Teammates**. Up to ten teammates can share the office. Momo stays as the coordinator. Each agent can select its own installed Ollama model or share the office default. One AI call runs at a time, including across multiple queued requests. Models are local and may be loaded/unloaded by Ollama as the queue switches between them; larger models use more RAM and can respond more slowly. Up to five requests may be queued.

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

Inference uses your local Ollama. Web-enabled agents can send search queries to DuckDuckGo Instant Answers; this service has limited coverage and is not a full browser. Search results are cited when actually returned. No cloud AI account is required. The application server binds to `127.0.0.1` on a dynamically assigned port.

Code output is a proposal for review: agents do not execute generated code, control your PC or read arbitrary files. AI outputs and completion claims still need human review. The quality of delegation depends on the model; invalid plans are shown as errors rather than assigned to invented teammates.

## Performance

The default is `llama3.2:latest` (the local 3B model). It is a practical starting point for a Ryzen 5 5600G and 32 GB RAM. AMD RX 6600 acceleration depends on Ollama's current supported backends; CPU inference can take longer. Settings accepts any installed Ollama model by its exact name. Under Teammates, leave the model field empty for the office default or choose a different model for that agent. Starting points include `qwen2.5-coder:7b` for code, `qwen2.5:7b` for general reasoning/review, and `gemma3:4b` for writing. These are candidates to evaluate on your own tasks, not measured winners. Pull only the models you want using `ollama pull MODEL_NAME`. No paid cloud APIs or paid fallbacks are included. A model request times out after four minutes, with the failure visible in the request history.

## Development

Node.js 22.12+ is required to build from source. The downloadable app bundles its runtime.

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

Build the Windows application on Windows for native executable resource editing. The first build downloads Electron and packaging tools. `output/` contains the release file. Nothing under `node_modules`, `dist`, `output`, test results or local user data belongs in Git.

Release executables are built on Windows CI. Engine and browser integration tests use mock AI responses. The pipeline checks desktop startup/shutdown both before and after packaging; local verification also uses Linux with a display server. Actual AMD GPU inference, model quality and live search availability still need verification on your PC.

## Credits and license

Based on [AgentOffice by Harish Kotra](https://github.com/harishkotra/agent-office), with its MIT license and character sprites retained. Momo's mascot was generated for this project. Momo Office replaces the autonomous demo engine, old floating panels, SQLite tooling and unused packages with a coordinator, serial task queue and compact desktop app. See [LICENSE](LICENSE).
