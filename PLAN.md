## 1. Project Philosophy
- **Identity:** A minimalist, self-hosted conduit — not a knowledge base.
- **Goal:** Collate technical noise (logs, newsletters, chat) into a single, semantic HTML page optimized for "Listen to this page" (TTS) and AI Agents.
- **Architecture:** Containerized Collector -> Aggregator -> Publisher.

## 2. Technical Stack
- **Runtime:** Node.js (LTS)
- **Containerization:** Docker + Docker Compose (Node:20-Alpine)
- **Networking:** Access via Tailscale / host networking (`network_mode: host`)
- **Templating:** EJS (Embedded JavaScript templates)
- **Libraries:** `express`, `ejs`, `fs-promises`, `node-cron` (replaced by OS-level `crontab`), `marked` (Markdown parsing)

## 3. Component Architecture

### Stage 1: Collectors (Ingestion)
- `src/collectors/mockCollector.js`: Returns Hello World data (Complete).
- `src/collectors/scraperCollector.js`: Fetches Hacker News top stories via API (Complete).
- `src/collectors/logCollector.js`: Watches local volumes for job output files.

### Stage 2: The Collator (Processing)
- **Aggregator:** Orchestrates collector execution, caches data in `data/cache.json`, and renders the briefing (Complete).
- **Narrator (Optional):** Sends text to a local Ollama container via host networking for prose summarization. Includes state management via versioning (`YYYYMMDD.HHMM`) to avoid redundant API calls (Complete).
- **Generator:** Uses `EJS` to inject data into `src/templates/briefing.ejs` (Complete).

### Stage 3: The Publisher (Delivery)
- **Web Server:** Node.js (Express) serves `public/index.html` on port 3000 (Complete).
- **Auto-Refresh:** Server-Sent Events (SSE) triggered by `fs.watch` to reload the page on new content (Complete).
- **Sync:** Optional `rclone` sidecar container to push the brief to Google Drive.

## 4. Implementation Roadmap

### Phase 1: Dockerized Foundation (Complete)
- [x] Initialize `package.json` and Dockerfile.
- [x] Set up `docker-compose.yml` with host networking.
- [x] Create basic EJS template with semantic HTML5 for TTS.
- [x] Implement initial aggregation/server/scheduling.

### Phase 2: State Management & Real Scrapers (Complete)
- [x] Implement state management via `YYYYMMDD.HHMM` versioning.
- [x] Update cron schedule to run hourly.
- [x] Implement Hacker News scraper using native `fetch`.

### Phase 3: Accessibility & Collectors
- [ ] Build `logCollector.js` using `fs.readFile`.
- [ ] Build `emailCollector.js` using `imap-simple`.
- [ ] Create volume mappings for Unraid logs (`/mnt/user/logs`).

### Phase 4: Refinement
- [ ] Optimize CSS for mobile "Reader Mode."
- [ ] Ensure Tailscale visibility for the Docker container's port.
- [ ] Test "Listen to this page" on mobile Chrome.

## 5. Metadata & Constraints
- **Privacy:** No external phoning home; data stays within the Tailnet.
- **Networking Learning:** Use `network_mode: host` in `docker-compose.yml` and `network: host` in the `build` block to bypass bridge network constraints (e.g., for `npm install` and accessing host-bound Ollama).
- **Scheduling Learning:** Prefer OS-level `crontab` in Alpine for robust background tasks instead of relying solely on `node-cron` within the long-running Express process.
