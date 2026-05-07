# daily-relay

A minimalist, self-hosted news aggregator that collates logs, newsletters, and web content into a single, semantic HTML page optimized for "Listen to this page" (TTS) and AI Agents.

## Features

- **Multi-Source Support:** Hacker News API, RSS/Atom feeds, and Gmail (via IMAP).
- **Per-Item AI Summarization:** Individual, focused prose summaries for every single news item and email using a local Ollama instance.
- **AI Health Check:** Automatically pings Ollama and bypasses AI calls if unreachable, with graceful UI fallbacks to cached summaries.
- **Customizable AI Prompts:** System prompts are decentralized in `sources.yaml`, allowing for per-source tuning (e.g., active voice for emails, verbatim mode for news).
- **Complexity-Driven Summarization:** Automatically ranks emails on a 0-8 complexity scale (`Cpx`) to intelligently route items between "One-Liner" and "Full Narration" modes.
- **Context-Aware Briefings:** Utilizes RSS descriptions and email body snippets to provide accurate, high-quality summaries.
- **Resilient State Management:** Automatically carries forward last known good data and summaries if a collector fails or times out.
- **Accessibility Optimized:** Optimized for Chrome's "Reading Mode" and TTS agents (links are hidden from automated readers).
- **Dynamic Configuration:** Manage your sources live via `sources.yaml`.
- **Auto-Refresh:** Browser updates automatically via Server-Sent Events (SSE).

## Quick Start

1.  **Configure Sources:** Edit `sources.yaml` to add your news links and email folders.
2.  **Set Credentials:** Update `.env` with your `OLLAMA_URL` and email credentials.
3.  **Deploy:**
    ```bash
    docker compose up --build -d
    ```
4.  **Access:** Open `http://localhost:3000` in Google Chrome.

## Technical Architecture

-   **Aggregator:** Sequential CLI tool (triggered hourly via cron) that orchestrates individual AI calls per item for maximum focus. Includes pre-flight checks for AI connectivity and true isolation for targeted `--source` runs to minimize AI usage.
-   **Publisher:** Lightweight Node.js server for static delivery and live-reloading.
-   **State:** Persistent cache in `data/cache.json` with fallback logic and system-level warning banners to prevent UI blanking on network errors.
-   **Networking:** Host networking mode for seamless Tailscale and Ollama integration.

## Development

- **Manually Trigger Aggregation:**
    ```bash
    # Run all collectors
    docker exec daily-relay-daily-relay-1 npm run aggregate

    # Run only a specific collector (use --source to avoid npm flag collisions)
    # The -- separator is required to pass arguments safely through npm
    docker exec daily-relay-daily-relay-1 npm run aggregate -- --source "GitHub Releases"

    # Force a re-summarization even if run within the same minute
    docker exec daily-relay-daily-relay-1 npm run aggregate -- --force
    ```
- **Re-authorize Google Tasks:**
    ```bash
    docker exec -it daily-relay-daily-relay-1 node src/utils/getGoogleToken.js
    ```
- **Analyze Email Complexity:**
    ```bash
    # Live analysis (connects to IMAP)
    npm run analyze-emails

    # Cache-based analysis (offline)
    npm run analyze-emails:cache
    ```
- **Test Prompts:**
    ```bash
    docker exec daily-relay-daily-relay-1 node tests/promptTester.js
    ```
