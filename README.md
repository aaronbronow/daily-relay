# daily-relay

A minimalist, self-hosted conduit for collating technical noise (logs, newsletters, chat) into a single, semantic HTML page optimized for "Listen to this page" (TTS) and AI Agents.

## Quick Start

To build and start the aggregator in the background:

```bash
docker compose up --build -d
```

- **Access the Briefing:** Open `http://localhost:3000` in Google Chrome.
- **Listen:** Use Chrome's "Listen to this page" feature.
- **Auto-Refresh:** The page automatically reloads whenever a new briefing is generated.

## Technical Architecture

- **Collectors:** Ingest data from various sources (currently using `mockCollector`).
- **Aggregator:** Orchestrates collection, caches data in `data/cache.json`, and renders the HTML briefing.
- **Publisher:** A Node.js (Express) server that serves the briefing and manages Server-Sent Events (SSE) for auto-refresh.
- **Scheduling:** Uses OS-level `crontab` inside the Alpine container for periodic updates.
- **Networking:** Utilizes `network_mode: host` for seamless integration with Tailscale and local services like Ollama.

## Development

- **Scripts:**
  - `npm start`: Starts the Express server.
  - `npm run aggregate`: Manually triggers the collection and rendering process.
- **Ollama Integration:** The `src/aggregator.js` contains hooks to connect to a host-based Ollama instance via `host.docker.internal`.
