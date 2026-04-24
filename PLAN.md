## 1. Project Philosophy
- **Identity:** A minimalist, self-hosted conduit — not a knowledge base.
- **Goal:** Collate technical noise (logs, newsletters, chat) into a single, semantic HTML page optimized for "Listen to this page" (TTS) and AI Agents.
- **Architecture:** Containerized Collector -> Aggregator -> Publisher.

## 2. Technical Stack
- **Runtime:** Node.js (LTS)
- **Containerization:** Docker + Docker Compose (Node:20-Alpine)
- **Networking:** Access via Tailscale / host networking (`network_mode: host`)
- **Templating:** EJS (Embedded JavaScript templates)
- **Libraries:** `express`, `ejs`, `marked`, `js-yaml`, `rss-parser`, `imap`, `mailparser`

## 3. Component Architecture

### Stage 1: Collectors (Ingestion)
- `src/collectors/mockCollector.js`: Returns Hello World data (Complete).
- `src/collectors/hnCollector.js`: Fetches Hacker News top stories via API (Complete).
- `src/collectors/rssCollector.js`: Fetches standard feeds and extracts `description` fields (Complete).
- `src/collectors/imapCollector.js`: Robust IMAP fetcher with full-body decoding and sender identification (Complete).

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
- [ ] Build `logCollector.js` for watching local job output files.
- [ ] Optimize CSS for mobile "Reader Mode" and agent-specific tags.

## 5. Metadata & Constraints
- **IMAP Stability:** Sequential execution and explicit process exit are mandatory to prevent socket hangs in containers.
- **AI Focus:** Providing descriptions to Ollama at an item-level produces significantly better briefings than site-level concatenation.
- **Reading Mode:** Content outside `<main>` wrapped in `<details>` is the most effective way to optimize for agent-driven consumption.
