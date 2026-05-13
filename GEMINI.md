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
- **Docker Dependency Isolation:** Using an anonymous volume (`- /app/node_modules`) in `docker-compose.yml` ensures that the container uses its own OS-specific dependencies (e.g., native C++ addons) even when the source code is mounted from a different host OS.
- **Google OAuth Loopback:** For desktop apps in a remote-dev environment (like VS Code SSH), using `http://127.0.0.1` and binding the local server to `0.0.0.0` is the most robust way to capture authorization codes through an automatic tunnel.
- **Task-Level Independence:** Explicitly forbidding possessive pronouns (e.g., "their", "his") in LLM prompts is critical when summarizing multiple tasks that share a date, preventing the model from hallucinating relationships between unrelated items.
- **Cache vs. Status:** Distinguishing between a "Failed Collection" (fallback to cache) and a "Successful Empty Run" (clear cache and report status) ensures the briefing remains accuracy and doesn't stale out.
- **CLI Flag Collisions:** `npm run` intercepts several flags (like `--only` and `--include`) for its own configuration. Using the `--` separator or alternative aliases like `--source` or `--force` is necessary to pass these flags to the underlying script.
- **Structured Summaries:** Prepending summaries with metadata (e.g., "Repo, Version, Relative Date:" or "From [Sender], Relative Date:") provides immediate context for the user and maintains a consistent structure across different data sources.
- **AI Health Checks:** Implementing a pre-flight ping (with timeout) to the Ollama server prevents multiple `fetch` failures from cluttering logs and slowing down the aggregator when the AI is offline.
- **UI Error Visibility:** Providing a dedicated `systemWarning` banner in the UI ensures the user is aware of AI/source connectivity issues without needing to check container logs.
- **Upstream Resilience:** Persistent `ECONNRESET` errors on specific domains (like `ubuntu.com`) often indicate infrastructure-level outages or IP filtering; graceful fallbacks to cache are essential to keep the dashboard functional during major external downtime.
- **Gmail Search Scope:** Searching `INBOX` alone misses emails that skip the inbox via labels/filters. Searching `[Gmail]/All Mail` is more comprehensive for category-based briefings, especially when using `category:updates`.
- **IMAP Content Fallback:** Some emails provide a whitespace-only `text` part (e.g., just a newline). Robust snippet extraction must check `trim().length > 0` before deciding to skip the HTML-to-text fallback.
- **Prompt Neutrality:** Using specific examples (like "acupuncture") in system prompts can cause "anchor bias" where the AI hallucinates the nature of vague events. Use neutral examples (e.g., "X sent Y") to maintain accuracy.
- **Decentralized Prompts:** Moving LLM prompts to `sources.yaml` allows for surgical tuning of summaries per source (e.g., active voice for emails vs. verbatim for news) without modifying core orchestration logic.
- **Code-Level Filtering:** For high-volume data (like historical events), using code-based regex filtering BEFORE the LLM significantly reduces context window usage and prevents local models from hallucinating due to information overload. This is more resilient than relying on human-curated small lists which may miss relevant niche items.
- **Dynamic Source Metadata:** Generating source URLs and labels in the collector script allows for accurate attribution that matches the dynamic nature of the data (e.g., linking to specific Wikipedia date articles).
- **Env Variable Precedence:** When using `dotenvx` or similar tools, variables already exported in the shell environment take precedence over `.env` files. If a token update in `.env` isn't taking effect, `unset` the variable in the active session.
- **Docker Env Persistence:** `docker-compose.yml` with `env_file` only loads variables when the container process starts. Host-side `.env` updates require `docker-compose up -d` to be picked up by the running container.
- **Bypassing State Cache:** Implementing a `--force` flag to bypass version-matching logic is essential for rapid debugging when data has changed but the timestamp hasn't advanced to a new minute.
- **Google Task List Visibility:** Fetching from all task lists (not just `@default`) is necessary to capture all user tasks.
- **API Granularity (Google Tasks):** The public v1 API currently provides date-level granularity, often stripping specific times even if they exist in the UI (returning them as `00:00:00.000Z`).
- **Deterministic Task Summaries:** Short, high-signal data like task titles are often better summarized using code-level logic rather than an LLM to avoid hallucinated context and improve accuracy.
- **Timezone-Aware All-Day Tasks:** All-day tasks (midnight UTC) require local `YYYY-MM-DD` comparisons to avoid being miscategorized as "Past Due" or "Tomorrow" due to time offsets. Using `toLocaleDateString('en-CA')` provides a reliable YYYY-MM-DD format for comparisons.
- **Task Completion Feedback:** Tracking tasks completed "Today" allows for encouraging status messages like "All tasks for today are completed!", providing a more accurate daily overview.
- **Conversational Conjunctions:** Using natural language logic (e.g., "1 task" vs "2 tasks", and the Oxford comma) in code-based summaries improves readability without the overhead or unpredictability of an LLM.
- **Docker Service Consolidation:** Boot loops can be caused by stale/corrupted anonymous volumes or naming conflicts. Consolidating into a single, consistently named service (e.g., `app`) with explicit `image` tags improves container stability and reliability.
- **Tiered Intelligence Model:** Implementing distinct "One-Liner" and "Full Narrative" modes prevents TTS fatigue. Moving from a one-size-fits-all approach to tiered summarization allows for a more natural rhythm in the daily briefing.
- **Code-Level Structural Inference:** Using cheap code-based metrics (headings > 3, links > 25, length > 5000) is an effective pre-AI filter to determine summarization depth without the latency or cost of a "guessing" AI pass.
- **Deterministic Overrides:** Manual sender-level overrides in `sources.yaml` are essential to correct edge cases where transactional boilerplate (like bank statements) might otherwise trigger long-form "newsletter" inference.
- **Indented Narrative Cards:** Pulling long narratives into distinct, card-like containers with unique styling (indented with left borders) improves visual hierarchy and solves nested list depth issues in the EJS template.
- **Complexity Indexing (Cpx):** Implementing a deterministic 0-8 complexity score (based on length, headings, links, and lists) provides a robust, pre-AI signal to route items between "One-Liner" and "Full Narration" modes, ensuring optimal briefing depth without over-processing simple notifications.
- **Fixed-Width Table Alignment:** In console tools, using `padStart()`/`padEnd()` to enforce fixed character widths for individual metrics within a merged string column allows for perfect vertical alignment of visual meters (like `[●●●○○○○○]`) despite varying numeric values.
- **Cache-Based Analysis:** Implementing a `--cache` flag in diagnostic tools allows for rapid iteration on UI/reporting logic without the latency or connection risk of re-fetching live data from sensitive protocols like IMAP.
- **Markdown Link Enforcement:** Instructing the AI to format all URLs as descriptive Markdown links (`[Label](url)`) significantly improves the Text-to-Speech (TTS) experience by preventing the reader from spelling out long URLs while preserving functionality for visual users.
- **Condensed RSS UI Layout:** Transitioning to a two-column grid layout (Metadata • Date on the left, Summary on the right) with high data density provides a superior scannable interface. Unifying all content types (including newsletters) into this stream improves visual consistency and scan speed.

## Technical Debt & Overrides
- **semver@5.7.2**: Manually overridden in `package.json` to fix a ReDoS vulnerability in `utf7` (a dependency of `imap`). Re-evaluate this override if `imap-simple` or `imap` are updated.
