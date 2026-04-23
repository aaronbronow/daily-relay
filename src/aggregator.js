const fs = require('fs').promises;
const path = require('path');
const ejs = require('ejs');
const { marked } = require('marked');
const { collect: mockCollector } = require('./collectors/mockCollector');
const { collect: scraperCollector } = require('./collectors/scraperCollector');
const { formatRelativeDate } = require('./utils/formatters');

const CACHE_FILE = path.join(__dirname, '../data/cache.json');
const TEMPLATE_FILE = path.join(__dirname, './templates/briefing.ejs');
const PUBLIC_INDEX = path.join(__dirname, '../public/index.html');

/**
 * Generates a version string in the format YYYYMMDD.HHMM
 */
function generateVersion() {
  const now = new Date();
  const datePart = now.getFullYear().toString() +
                   (now.getMonth() + 1).toString().padStart(2, '0') +
                   now.getDate().toString().padStart(2, '0');
  const timePart = now.getHours().toString().padStart(2, '0') +
                   now.getMinutes().toString().padStart(2, '0');
  return `${datePart}.${timePart}`;
}

/**
 * Aggregator logic.
 * Orchestrates collectors, updates the cache, optionally calls Ollama, and renders the briefing.
 */
async function aggregate() {
  const runVersion = generateVersion();
  console.log(`[Aggregator] Starting run version: ${runVersion}`);

  // 1. Load existing cache for version comparison
  let cachedData = null;
  try {
    const rawCache = await fs.readFile(CACHE_FILE, 'utf8');
    cachedData = JSON.parse(rawCache);
  } catch (err) {
    // Ignore if file doesn't exist or is invalid
  }

  // 2. Run Collectors
  const [mockData, scraperData] = await Promise.all([
    mockCollector(),
    scraperCollector()
  ]);

  const data = {
    title: "Daily Briefing",
    timestamp: formatRelativeDate(new Date()),
    version: runVersion,
    brief: mockData.content, 
    todaysNews: [scraperData],
    summary: null
  };

  // 3. Conditional Ollama Integration
  const ollamaUrl = process.env.OLLAMA_URL;
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:3b';

  if (ollamaUrl) {
    // Version Check: If this run version matches the cached version, reuse the summary
    if (cachedData && cachedData.version === runVersion && cachedData.summary) {
      console.log(`[Aggregator] Version match (${runVersion}). Reusing cached summary.`);
      data.summary = cachedData.summary;
    } else {
      const sites = data.todaysNews.map(s => s.site).join(", ");
      const newsContext = data.todaysNews
        .map(s => `SITE: ${s.site}\nHEADLINES:\n${s.items.map(i => `- ${i.title}`).join("\n")}`)
        .join("\n\n---\n\n");

      const prompt = `You are a professional briefing assistant. Your task is to summarize news headlines grouped by source site.

      <instructions>
      1. Output ONLY valid Markdown.
      2. DO NOT include any conversational preamble.
      3. Start your output EXACTLY with: ### Today's news from your sites: ${sites}...
      4. For EACH site in the <input_data>, create a section:
      a. Bold site name: **[Site Name]**
      b. Bulleted list of 3-5 concise, one-sentence summaries of the associated headlines.
      5. ONLY use site names provided in <input_data>. DO NOT treat headlines as site names.
      6. DO NOT use any example data in your final output.
      </instructions>

      <input_data>
      ${newsContext}
      </input_data>

      Summary:`;      try {
        console.log(`[Aggregator] Requesting fresh summary from Ollama at ${ollamaUrl}...`);
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
          let markdown = result.response;
          
          // Clean up accidental markdown code blocks
          markdown = markdown.replace(/^```(markdown)?\n/i, '').replace(/\n```$/i, '');
          
          data.summary = await marked.parse(markdown);
          console.log("[Aggregator] Ollama summary generated.");
        } else {
          console.warn(`[Aggregator] Ollama returned status: ${response.status}`);
        }
      } catch (err) {
        console.warn("[Aggregator] Ollama connection failed. Skipping summary.", err.message);
      }
    }
  }

  // 4. Update Cache
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
  console.log(`[Aggregator] Cache updated: ${CACHE_FILE}`);

  // 5. Render Briefing
  try {
    const html = await ejs.renderFile(TEMPLATE_FILE, { briefing: data });
    await fs.writeFile(PUBLIC_INDEX, html);
    console.log(`[Aggregator] Briefing rendered: ${PUBLIC_INDEX}`);
  } catch (err) {
    console.error("[Aggregator] Rendering failed:", err);
  }
}

if (require.main === module) {
  aggregate().catch((err) => {
    console.error("[Aggregator] Execution failed:", err);
    process.exit(1);
  });
}

module.exports = { aggregate };
