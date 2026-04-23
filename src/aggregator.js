const fs = require('fs').promises;
const path = require('path');
const ejs = require('ejs');
const { collect: mockCollector } = require('./collectors/mockCollector');
const { collect: scraperCollector } = require('./collectors/scraperCollector');

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
  const [mockData, scraperData] = await Promise.all([
    mockCollector(),
    scraperCollector()
  ]);

  const data = {
    title: "Daily Briefing",
    timestamp: new Date().toISOString(),
    brief: mockData.content, // From the mock collector
    todaysNews: [scraperData], // Array of scraper results
    summary: null // Placeholder for Ollama summary
  };

  // 2. Ollama Integration for "Today's News" Summary
  const ollamaUrl = process.env.OLLAMA_URL;
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3';

  if (ollamaUrl) {
    const sites = data.todaysNews.map(s => s.site).join(", ");
    const newsContext = data.todaysNews
      .map(s => `${s.site}:\n${s.items.map(i => `- ${i.title}`).join("\n")}`)
      .join("\n\n");

    const prompt = `Here is the scraped content from today's news sites (${sites}). 
Please summarize it by recency. Start with "Today's news from your sites: ${sites}...". 
Then summarize bullet point highlights for each site in that section.
Output the summary as HTML (use <p>, <ul>, <li> tags).

Content:
${newsContext}`;

    try {
      console.log(`[Aggregator] Requesting summary from Ollama at ${ollamaUrl}...`);
      const response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: prompt,
          stream: false
        })
      });

      if (response.ok) {
        const result = await response.json();
        data.summary = result.response;
        console.log("[Aggregator] Ollama summary generated.");
      } else {
        console.warn(`[Aggregator] Ollama returned status: ${response.status}`);
      }
    } catch (err) {
      console.warn("[Aggregator] Ollama connection failed. Skipping summary.", err.message);
    }
  }

  // 3. Update Cache
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
  console.log(`[Aggregator] Cache updated: ${CACHE_FILE}`);

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
