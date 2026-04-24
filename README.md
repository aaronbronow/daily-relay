# daily-relay

A minimalist, self-hosted news aggregator that collates logs, newsletters, and web content into a single, semantic HTML page optimized for "Listen to this page" (TTS) and AI Agents.

## Features

- **Multi-Source Support:** Hacker News API, any RSS/Atom feed, and Gmail (via IMAP).
- **AI Summarization:** Individual prose summaries for every source via a local Ollama instance.
- **Resilient State Management:** Automatically carries forward last known good data and summaries if a collector fails or times out.
- **Dynamic Configuration:** Manage your sources on the fly via `sources.yaml`.
- **Accessibility Optimized:** Structured with semantic HTML5 and optimized for Chrome's "Reading Mode" and TTS agents.
- **Auto-Refresh:** Browser updates automatically via Server-Sent Events (SSE) whenever a new briefing is ready.

## Quick Start

1.  **Configure Sources:** Edit `sources.yaml` to add your news links and email folders.
2.  **Set Credentials:** Update `.env` with your `OLLAMA_URL` and email credentials.
3.  **Deploy:**
    ```bash
    docker compose up --build -d
    ```
4.  **Access:** Open `http://localhost:3000` in Google Chrome.

## Technical Architecture

-   **Aggregator:** Runs as a CLI tool (triggered hourly via cron) to fetch data sequentially and hit the Ollama API for summaries.
-   **Publisher:** A lightweight Node.js (Express) server optimized for static delivery and live-reloading.
-   **State:** Persistent cache stored in `data/cache.json` using a `YYYYMMDD.HHMM` versioning scheme to prevent redundant AI calls.
-   **Networking:** Uses `network_mode: host` for seamless integration with Tailscale and local services.

## Development

-   **Manually Trigger Aggregation:**
    ```bash
    docker exec daily-relay-daily-relay-1 npm run aggregate
    ```
-   **View Logs:**
    ```bash
    tail -f /var/log/cron.log
    ```
