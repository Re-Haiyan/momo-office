## Momo Office 0.5.0 for Windows

Download **Momo-Office-0.5.0-Setup.exe**, close the old app, and run Setup. Existing office data is migrated automatically; cloud remains off until enabled. The installer keeps the dedicated app folder, shortcuts, uninstaller and mascot loading screen.

- Optional Gemini (Google AI Studio), Groq and OpenRouter zero-price `:free` model support. Local Ollama remains the default and final fallback.
- Providers settings: explicit opt-in and data-policy consent, write-only OS-encrypted keys, connection/catalog checks, model pickers, daily/RPM caps, usage and cooldown status.
- Per-request **Local only** blocks cloud models and web lookup. Local/Cloud agent badges, editable fallback chains and role-based **Auto-assign** preview before saving.
- Per-provider quota tracking across restarts, Retry-After cooldowns, bounded retries, cancellation and model-context budgets. Actual model provenance in run details and exports.
- Echo selects a different known reviewer family when available; warnings identify unverified/same-family review.

Use unbilled/free-tier Gemini and Groq accounts; the app cannot determine your billing tier. Free availability and data policies can change. Cloud opt-in transmits prompts and prior team work; free tiers may log or train on data. Read README before enabling a provider. All cloud tests use mocks, not real API calls. Streaming protocol support is documented; completions remain non-streaming.

The app is unsigned. Windows may show an unknown-publisher prompt. Verify `SHA256SUMS.txt` before installing. Ollama remains a separate prerequisite; CPU/GPU performance depends on your setup.


This release also adds protected context budgeting, corrupt-store backups and migration, review warnings, validated plan/review schemas, task dependencies, verbatim answer assembly, configurable search, streaming local output, explicit Resume, Advanced settings, per-launch sessions/CSP, atomic asynchronous saves and a lighter SSE office transport. Update checks are manual, bounded and link-only. See README for all defaults and limitations.
