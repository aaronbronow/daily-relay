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
- **Sequential Collector Execution:** The aggregator executes collectors sequentially (rather than in parallel) to ensure stability and avoid socket/concurrency issues, especially with sensitive protocols like IMAP.
- **Dynamic Configuration:** Sources are managed via `sources.yaml`, mounted as a volume for live host-side updates. Supported types: `hackernews`, `rss`, `imap`.
- **Item-Level Summarization:** The aggregator makes a separate Ollama API call for every individual news or email item. This maximizes AI focus on the specific content (including descriptions/snippets) and results in higher-quality, more accurate summaries.
- **State Management & Fallbacks:** Uses a version string (`YYYYMMDD.HHMM`) to skip redundant AI calls within the same minute. If a collector fails (timeout/error), the aggregator carries forward the last successful data and summary from `cache.json` to ensure UI stability.
- **Separation of Concerns:** 
  - `collectors/`: Data ingestion modules.
  - `aggregator.js`: Orchestration, fallback logic, and LLM interfacing.
  - `server.js`: Static file delivery and live-reloading.

## Development Mandates
- **Host Networking:** Always ensure `docker-compose.yml` uses `network_mode: host` and the `build` block uses `network: host`.
- **Semantic HTML:** The briefing template MUST use standard HTML5 semantic tags (`<main>`, `<article>`) to ensure compatibility with mobile "Listen to this page" features.
- **Accessibility:** Secondary content (like raw source links) should be placed outside the `<main>` tag (e.g., in `<aside>`) and wrapped in `<details>` to prevent TTS agents from reading them aloud.
- **Persistence:** Use the `data/` volume for caching collected data (`cache.json`).

## Session Learnings
- **Item-Level vs. Site-Level:** Making separate LLM calls for every item is slower but significantly more accurate. It prevents the model from getting confused by multiple different topics and allows it to utilize long item descriptions without context drift.
- **RSS Context:** Including the `description` field from RSS feeds provides the AI with the necessary context to summarize accurately, rather than just repeating or guessing based on the title.
- **IMAP Resilience:** IMAP connections are prone to hanging or socket resets (ECONNRESET). Implementing hard safety timeouts, sequential execution, and fetching only headers/full-bodies with clean `mailparser` decoding is essential for stability.
- **LLM Prompt Compliance:** Using XML-style tags (e.g., `<instructions>`, `<content>`) and explicit "VERBATIM MODE" rules significantly reduces hallucination and improves structural compliance in Ollama.
- **Reading Mode Optimization:** Reader Mode and TTS agents primarily focus on the `<main>` tag. Moving links to a trailing `<aside>` block and wrapping them in `<details>` successfully prevents them from being read aloud.
- **Timezone Synchronization:** Correct Node.js timezone handling in Alpine requires both mounting `/etc/localtime` AND installing the `tzdata` package.
