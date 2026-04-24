## 1. Project Philosophy
- **Identity:** A minimalist, self-hosted conduit — not a knowledge base.
- **Goal:** Collate technical noise (logs, newsletters, chat) into a single, semantic HTML page optimized for "Listen to this page" (TTS) and AI Agents.
- **Architecture:** Containerized Collector -> Aggregator -> Publisher.

## 2. Technical Stack
- **Runtime:** Node.js (LTS)
- **Containerization:** Docker + Docker Compose (Node:20-Alpine)
- **Networking:** Access via Tailscale / host networking (`network_mode: host`)
- **Templating:** EJS (Embedded JavaScript templates)
- **Libraries:** `express`, `ejs`, `marked`, `js-yaml`, `rss-parser`, `imap`

## 3. Component Architecture

### Stage 1: Collectors (Ingestion)
- `src/collectors/mockCollector.js`: Returns Hello World data (Complete).
- `src/collectors/hnCollector.js`: Fetches Hacker News top stories via API (Complete).
- `src/collectors/rssCollector.js`: Fetches and parses any standard RSS/XML feed (Complete).
- `src/collectors/imapCollector.js`: Connects via IMAP to fetch/parse recent emails (Complete).

### Stage 2: The Collator (Processing)
- **Aggregator:** Orchestrates sequential collector execution, caches data, and manages fallbacks for failed runs (Complete).
- **Narrator:** Per-site prose summarization via local Ollama. Includes XML-tag prompting for high compliance (Complete).
- **Generator:** Uses `EJS` to inject data into `src/templates/briefing.ejs` (Complete).

### Stage 3: The Publisher (Delivery)
- **Web Server:** Node.js (Express) serves `public/index.html` on port 3000 (Complete).
- **Auto-Refresh:** Server-Sent Events (SSE) triggered by `fs.watch` to reload the page on new content (Complete).

## 4. Implementation Roadmap

### Phase 1: Dockerized Foundation (Complete)
- [x] Initialize `package.json` and Dockerfile.
- [x] Set up `docker-compose.yml` with host networking.
- [x] Create basic EJS template with semantic HTML5 for TTS.
- [x] Implement initial aggregation/server/scheduling.

### Phase 2: State Management & Real Scrapers (Complete)
- [x] Implement state management via `YYYYMMDD.HHMM` versioning.
- [x] Update cron schedule to run hourly.
- [x] Implement Hacker News scraper and RSS feed support.

### Phase 3: Email & Fallbacks (Complete)
- [x] Build `imapCollector.js` using raw `imap` library for stability.
- [x] Implement state preservation (carry forward cached data on collector failure).
- [x] Optimize IMAP fetch for headers and snippets only.

### Phase 4: Refinement & Accessibility (Current Focus)
- [x] Optimize layout for Chrome "Reading Mode" (using `<aside>` and `<details>`).
- [ ] Build `logCollector.js` for watching local job output files.
- [ ] Optimize CSS for mobile "Reader Mode."
- [ ] Test "Listen to this page" on mobile Chrome across different network speeds.

## 5. Metadata & Constraints
- **Privacy:** No external phoning home; data stays within the Tailnet.
- **IMAP Learning:** Sequential execution and explicit process exit are required to prevent socket hangs in containerized environments.
- **Reading Mode Learning:** Placing secondary links in an `<aside>` block outside the `<main>` tag is the most effective way to prevent them from being read by TTS agents.
