## Momo Office for Windows

Download the **Setup.exe** below, close the old office and run Setup. Choose a dedicated installation folder; the default is `%LOCALAPPDATA%\Programs\Momo Office`. Setup creates shortcuts and `Uninstall Momo Office.exe` inside that folder. You can also uninstall through Windows Installed apps. Saved team settings and results are preserved in `%APPDATA%\momo-office\office`. Keep Ollama installed and the `llama3.2` model available.

- A mascot loading screen with real startup status and Cancel, followed by a ready office.
- One prompt box with Momo coordinating your team.
- Assign different installed Ollama models to different agents, or share the office default. Local models only; no paid cloud APIs or automatic paid fallbacks.
- Eight specialists and teammates: Momo, Sage, Pip, Luna, Nova, Coco, Atlas and Echo. Add or customize agents and skills in the gear menu; the office supports ten agents.
- Specialists pass work to each other; a reviewer can request one correction. Missing essential facts pause the task for your input, preserving partial work. Temporary model failures get one retry.
- A meeting room, work studio, coffee kitchen, lounge and quiet corner, with task-related movement and door-aware paths.
- Centered camera: drag to pan, scroll to zoom, double-click to reset.
- Saved history, Markdown export and a cute cat mascot.

The app uses your local Ollama. These checks reduce mistakes but do not eliminate hallucinations. Code is proposed for review, not executed. Web lookup is a separate permission and uses limited DuckDuckGo Instant Answers. Data is saved under `%APPDATA%\momo-office\office`.

This build is unsigned; Windows may show an unknown-publisher message. `SHA256SUMS.txt` contains its checksum. Automated AI tests use mock responses; local model quality and AMD GPU acceleration depend on your PC's Ollama setup.
