## 1. Project Philosophy
- **Identity:** A minimalist, self-hosted conduit — not a knowledge base.
- **Goal:** Collate technical noise (logs, newsletters, chat) into a single, semantic HTML page optimized for "Listen to this page" (TTS) and AI Agents.
- **Architecture:** Containerized Collector -> Aggregator -> Publisher.

## 2. Technical Stack
- **Runtime:** Node.js (LTS)
- **Containerization:** Docker + Docker Compose (Node:20-Alpine)
- **Networking:** Access via Tailscale / host networking (`network_mode: host`)
- **Templating:** EJS (Embedded JavaScript templates)
- **Libraries:** `express`, `ejs`, `marked`, `js-yaml`, `rss-parser`, `imap-simple`, `mailparser`, `googleapis`

## 3. Component Architecture

### Stage 1: Collectors (Ingestion)
- `src/collectors/hnCollector.js`: Fetches Hacker News top stories via API (Complete).
- `src/collectors/rssCollector.js`: Fetches standard feeds and extracts `description` fields (Complete).
- `src/collectors/imapCollector.js`: Robust IMAP fetcher with full-body decoding and sender identification (Complete).
- `src/collectors/logCollector.js`: Tail-based log parser for local Unraid job outputs.
- `src/collectors/seasonCollector.js`: Local YAML parser for the "Holidays of Health" cycle.
- `src/collectors/motdCollector.js`: Directory-watcher for incoming Ubuntu system health reports.
- `src/collectors/historyCollector.js`: Wikimedia API client with interest-based LLM filtering (Complete).
- `src/collectors/tasksCollector.js`: Google Tasks API client with multi-list support and timezone-aware grouping (Complete).
- `src/collectors/githubCollector.js`: GitHub Releases aggregator for high-signal repo updates (Complete).

### Stage 2: The Collator (Processing)
- **Aggregator:** Orchestrates sequential collector execution and manages resilient fallbacks (Complete).
- **Narrator:** Per-item individual prose summarization via local Ollama. Uses XML-tag prompting and anti-hallucination rules (Complete).
- **Task Briefing:** Deterministic code-level natural language formatting for tasks (Today vs Week) to ensure 100% accuracy (Complete).
- **Generator:** Uses `EJS` to inject data into `src/templates/briefing.ejs` (Complete).

### Stage 3: The Publisher (Delivery)
- **Web Server:** Node.js (Express) serves `public/index.html` on port 3000 (Complete).
- **Auto-Refresh:** Server-Sent Events (SSE) triggered by `fs.watch` (Complete).

## 4. Implementation Roadmap

### Phase 1: Dockerized Foundation (Complete)
- [x] Initialize `package.json` and Dockerfile.
- [x] Set up `docker-compose.yml` with host networking and volume mounts.
- [x] Create basic EJS template with semantic HTML5 for TTS.
- [x] Implement initial aggregation/server/scheduling.
- [x] **Refinement**: Optimize Dockerfile with layer caching and anonymous volume for `node_modules` isolation.

### Phase 2: State Management & Real Scrapers (Complete)
- [x] Implement state management via `YYYYMMDD.HHMM` versioning.
- [x] Update cron schedule to run hourly.
- [x] Implement Hacker News scraper and dynamic RSS source support.

### Phase 3: Email, Per-Item AI & Fallbacks (Complete)
- [x] Build `imapCollector.js` using raw `imap` and `mailparser` for stability.
- [x] Implement item-level Ollama calls for maximum focus and quality.
- [x] Build state preservation to carry forward cached data on collector failure.
- [x] Optimize IMAP fetch for cleaner AI snippets and sender info ("From [Sender]:").

### Phase 4: Refinement & Accessibility (Complete)
- [x] Optimize layout for Chrome "Reading Mode" by moving links to `<aside>`.
- [x] Refine AI prompt to strip technical noise (USN/CVE) and prevent hallucinations.
- [x] Implement relative date bucketing for emails (today, yesterday, this week, earlier).
- [x] Implement server-side IMAP `SORT` with client-side fallback for chronological briefings.
- [x] Implement explicit "Checked, no updates" (success) vs. "No updates" (failed no cache) status.
- [x] Implement Ollama pre-flight check and graceful UI bypass for AI server failures.
- [x] Decentralize Ollama prompts to `sources.yaml` for per-source tuning.
- [x] Optimize Gmail IMAP search by utilizing `[Gmail]/All Mail` and extending the window.
- [x] Implement true isolation for targeted runs (skipping AI calls for cached sources).
- [x] Implement `--force` flag to bypass version-matching logic and force re-summarization.
- [x] **Tiered Email Summarization**: Implement structural inference and sender overrides for one-liner vs. full-narrative modes.
- [x] **Complexity Index (Cpx)**: Implement a standardized 0-8 complexity score in the collector and aggregator to drive summarization depth (Complete).
- [x] **Enhanced Analyzer**: Upgrade `tests/emailAnalyzer.js` with a 90-column visual table, a `--cache` flag for offline analysis, and a complexity meter (Complete).
- [x] **Markdown Link Enforcement**: Implement global prompt rules to force Markdown formatting for URLs and parse them in the UI for TTS optimization (Complete).

### Phase 5: Seasonal Context & Curated History (Complete)
- [x] **Static Season Logic**: Created `config/seasons.yaml` defining the 8 archetypal seasons with dynamic Easter/Lent/Wands boundaries.
- [x] **Season Collector**: Built `seasonCollector.js` using Meeus/Jones/Butcher algorithm for exact seasonal date math, including progress % and remaining days.
- [x] **Curated History**: Exhaustive Wikimedia fetcher with code-level interest filtering and dynamic source links.
- [x] **Google Tasks**: Multi-list fetcher with code-based natural language briefing and task completion tracking.
- [x] **Briefing Intro**: Seasonal Mindset card added to the top-right of the briefing grid with archetype quote, progress bar, and status chip.
- [x] **GitHub Releases**: Aggregator for software updates via public RSS/Atom feeds (Complete).
- [x] **Home Health Checklist**: Weekly home maintenance collector from `data/homeChecklist.yaml` with week progress bar, next-week preview, and status chip UI.

### Phase 6: System Infrastructure (Logs & MOTD)
- [ ] **Log Tailer**: Implement `logCollector.js` to extract status from Unraid job output files.
- [ ] **MOTD Ingestion**: Add Express endpoint `/api/motd/:hostname` to receive remote Ubuntu health reports.
- [ ] **MOTD Collector**: Build `motdCollector.js` to summarize multi-node update statuses concisely.
- [x] **Auth Utilities**: Created `src/utils/getGoogleToken.js` for OAuth2 flow management.
- [x] **UI Error Reporting**: Implement visible warning banners in `briefing.ejs` for connection failures and stale cache fallback.

### Phase 7: Mobile & Agent Refinement
- [x] **Condensed RSS UI**: Transitioned to a grid-based, high-density layout with metadata columns for superior scan speed (Complete).
- [ ] **Mobile CSS**: Finalize "Reader Mode" CSS specifically for mobile Chrome and Safari.
- [ ] **Gemini Sync**: (Optional) Add `rclone` script to push `index.html` to Google Drive for @Workspace chat access.

## 5. Metadata & Constraints
- **Complexity Index (Cpx):** A 0-8 scale based on length (3pt), headings (2pt), links (2pt), and lists (1pt). Scores >= 3 trigger "Full Narration."
- **IMAP Stability:** Sequential execution and explicit process exit are mandatory to prevent socket hangs in containers.
- **AI Focus:** Providing descriptions to Ollama at an item-level produces significantly better briefings than site-level concatenation.
- **Reading Mode:** Content outside `<main>` wrapped in `<details>` or simply placed in `<aside>` is the most effective way to optimize for agent-driven consumption.
- **Cache Policy:** Failures (e.g., timeouts, ECONNRESET) should fallback to cache; successful empty runs should clear the cache and report "No updates" to maintain accuracy.
- **Date Agnostic:** Seasonal dates must use `MM-DD` formats to remain valid year-over-year.
- **Curation First:** History events are limited to 1-2 items per day based on explicit interest tags (Photography, Engineering, PNW).
- **Non-Interruptive:** Remote MOTD updates trigger the watcher but should not force a full AI rewrite until the next scheduled hourly run unless critical.
