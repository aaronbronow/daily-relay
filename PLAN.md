## 1. Project Philosophy
- **Identity:** A minimalist, self-hosted conduit — not a knowledge base.
- **Goal:** Collate technical noise (logs, newsletters, chat) into a single, semantic HTML page optimized for "Listen to this page" (TTS) and AI Agents.
- **Architecture:** Containerized Collector -> Aggregator -> Publisher.

## 2. Technical Stack
- **Runtime:** Node.js (LTS)
- **Containerization:** Docker + Docker Compose (Node:20-Alpine)
- **Networking:** Access via Tailscale / host networking (`network_mode: host`)
- **Templating:** EJS (Embedded JavaScript templates)
- **Libraries:** `express`, `ejs`, `marked`, `js-yaml`, `rss-parser`, `imap`, `mailparser`, `dayjs`

## 3. Component Architecture

### Stage 1: Collectors (Ingestion)
- `src/collectors/hnCollector.js`: Fetches Hacker News top stories via API (Complete).
- `src/collectors/rssCollector.js`: Fetches standard feeds and extracts `description` fields (Complete).
- `src/collectors/imapCollector.js`: Robust IMAP fetcher with full-body decoding and sender identification (Complete).
- `src/collectors/logCollector.js`: Tail-based log parser for local Unraid job outputs.
- `src/collectors/seasonCollector.js`: Local YAML parser for the "Holidays of Health" cycle.
- `src/collectors/motdCollector.js`: Directory-watcher for incoming Ubuntu system health reports.
- `src/collectors/historyCollector.js`: Wikimedia API client with interest-based LLM filtering (Complete).
- `src/collectors/tasksCollector.js`: Google Tasks API client for urgent tasks (Complete).

### Stage 2: The Collator (Processing)
- **Aggregator:** Orchestrates sequential collector execution and manages resilient fallbacks (Complete).
- **Narrator:** Per-item individual prose summarization via local Ollama. Uses XML-tag prompting and anti-hallucination rules (Complete).
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

### Phase 5: Seasonal Context & Curated History
- [ ] **Static Season Logic**: Create `config/seasons.yaml` defining recurring holidays and weekly themes.
- [ ] **Season Collector**: Build `seasonCollector.js` to calculate current week/theme without external APIs.
- [x] **Curated History**: Build `historyCollector.js` to fetch Wikimedia events and use the "Narrator" with source-level `system_prompt` to generate a prose intro.
- [x] **Google Tasks**: Build `tasksCollector.js` to fetch and summarize urgent tasks in the prose intro via OAuth2.
- [ ] **Briefing Intro**: Update `briefing.ejs` to lead with the Seasonal Theme to anchor the day's mindset.

### Phase 6: System Infrastructure (Logs & MOTD)
- [ ] **Log Tailer**: Implement `logCollector.js` to extract status from Unraid job output files.
- [ ] **MOTD Ingestion**: Add Express endpoint `/api/motd/:hostname` to receive remote Ubuntu health reports.
- [ ] **MOTD Collector**: Build `motdCollector.js` to summarize multi-node update statuses concisely.
- [ ] **Agent Tags**: Refine HTML with `aria-hidden` on technical timestamps to prevent the TTS agent from reading raw ISO strings.

### Phase 7: Mobile & Agent Refinement
- [ ] **Mobile CSS**: Finalize "Reader Mode" CSS specifically for mobile Chrome and Safari.
- [ ] **Gemini Sync**: (Optional) Add `rclone` script to push `index.html` to Google Drive for @Workspace chat access.

## 5. Metadata & Constraints
- **IMAP Stability:** Sequential execution and explicit process exit are mandatory to prevent socket hangs in containers.
- **AI Focus:** Providing descriptions to Ollama at an item-level produces significantly better briefings than site-level concatenation.
- **Reading Mode:** Content outside `<main>` wrapped in `<details>` or simply placed in `<aside>` is the most effective way to optimize for agent-driven consumption.
- **Cache Policy:** Failures (e.g., timeouts, ECONNRESET) should fallback to cache; successful empty runs should clear the cache and report "No updates" to maintain accuracy.
- **Date Agnostic:** Seasonal dates must use `MM-DD` formats to remain valid year-over-year.
- **Curation First:** History events are limited to 1-2 items per day based on explicit interest tags (Photography, Engineering, PNW).
- **Non-Interruptive:** Remote MOTD updates trigger the watcher but should not force a full AI rewrite until the next scheduled hourly run unless critical.
