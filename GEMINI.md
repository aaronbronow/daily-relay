# GEMINI.md - daily-relay

## Project Identity & Philosophy
- **Identity:** A minimalist, self-hosted conduit for collating technical noise (logs, newsletters, chat).
- **Goal:** Transform diverse inputs into a single, semantic HTML page optimized for "Listen to this page" (TTS) and AI Agents.
- **Privacy:** Data must remain within the local Docker network or Tailscale network (Tailnet).

## Technical Stack & Constraints
- **Runtime:** Node.js (20-Alpine)
- **Networking:** Utilizes `network_mode: host` to allow the container direct access to the host machine's network (essential for Tailscale, local Ollama connectivity, and internet access during build).
- **Templating:** EJS for semantic HTML5 output.
- **Markdown Parsing:** Uses `marked` to convert LLM Markdown output into semantic HTML.
- **Publisher:** Express.js server on port 3000.
- **Scheduling:** Alpine OS-level `crontab` triggers collection/aggregation hourly.
- **Auto-Refresh:** Uses Server-Sent Events (SSE) to notify the browser when `public/index.html` is updated.
- **Source Control:** NEVER stage or commit changes unless specifically requested by the user.

## Architectural Patterns
- **CLI-First Aggregator:** `src/aggregator.js` is designed to be run as a standalone CLI script (via `npm run aggregate`) and triggered by cron.
- **Multi-Collector Orchestration:** The aggregator uses `Promise.all` to execute multiple collectors concurrently, grouping results by site into a `todaysNews` structure.
- **State Management:** Uses a version string (`YYYYMMDD.HHMM`) to track aggregation runs. If the version in the cache matches the current minute, re-summarization via Ollama is skipped.
- **Separation of Concerns:** 
  - `collectors/`: Data ingestion.
  - `aggregator.js`: Logic, caching, and rendering.
  - `server.js`: Static file delivery and live-reloading.

## Development Mandates
- **Host Networking:** Always ensure `docker-compose.yml` uses `network_mode: host` and the `build` block uses `network: host`.
- **Semantic HTML:** The briefing template MUST use standard HTML5 semantic tags (`<main>`, `<article>`) to ensure compatibility with mobile "Listen to this page" features.
- **Persistence:** Use the `data/` volume for caching collected data (`cache.json`).
- **Scheduling:** When adding new collectors or tasks, prefer adding them to the `aggregator.js` orchestration or the `crontab`.

## Session Learnings
- **Bridge Network Issues:** Alpine containers may have DNS/Connectivity issues on some host bridge networks; switching to `network_mode: host` resolved `npm install` and server accessibility problems.
- **Aggregator as CLI:** Decoupling the aggregator from the server lifecycle allows for more reliable scheduling via the OS.
- **Markdown for LLMs:** Requesting Markdown from LLMs and parsing it to HTML locally is more reliable and token-efficient than requesting raw HTML.
