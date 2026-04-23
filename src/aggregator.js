const fs = require('fs').promises;
const path = require('path');
const ejs = require('ejs');
const { collect: mockCollector } = require('./collectors/mockCollector');

const CACHE_FILE = path.join(__dirname, '../data/cache.json');
const TEMPLATE_FILE = path.join(__dirname, './templates/briefing.ejs');
const PUBLIC_INDEX = path.join(__dirname, '../public/index.html');

/**
 * Aggregator logic.
 * Orchestrates collectors, updates the cache, optionally calls Ollama, and renders the briefing.
 */
async function aggregate() {
  console.log(`[Aggregator] Starting at ${new Date().toISOString()}`);

  // 1. Run Collectors
  const data = await mockCollector();

  // 2. Update Cache
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
  console.log(`[Aggregator] Cache updated: ${CACHE_FILE}`);

  // 3. Ollama Integration Hook (Optional Summarization)
  /*
  // Example of calling an Ollama instance on the host machine:
  const prompt = `Summarize the following for a daily briefing: ${data.content}`;
  try {
      // Use 'host.docker.internal' for Docker Desktop on Mac/Windows, or the host's Tailscale/LAN IP for Linux.
      const response = await fetch('http://host.docker.internal:11434/api/generate', {
          method: 'POST',
          body: JSON.stringify({
              model: 'llama3', // or your preferred model
              prompt: prompt,
              stream: false
          })
      });
      const result = await response.json();
      data.content = result.response;
      console.log("[Aggregator] Prose summarization complete via Ollama.");
  } catch (err) {
      console.warn("[Aggregator] Ollama connection failed. Falling back to raw content.");
  }
  */

  // 4. Render Briefing
  try {
    const html = await ejs.renderFile(TEMPLATE_FILE, { briefing: data });
    await fs.writeFile(PUBLIC_INDEX, html);
    console.log(`[Aggregator] Briefing rendered: ${PUBLIC_INDEX}`);
  } catch (err) {
    console.error("[Aggregator] Rendering failed:", err);
  }
}

// Allow running this script directly (via CLI/Crontab)
if (require.main === module) {
  aggregate().catch((err) => {
    console.error("[Aggregator] Execution failed:", err);
    process.exit(1);
  });
}

module.exports = { aggregate };
