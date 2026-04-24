const fs = require('fs').promises;
const path = require('path');
const ejs = require('ejs');
const yaml = require('js-yaml');
const { marked } = require('marked');
const { collect: mockCollector } = require('./collectors/mockCollector');
const { collect: hnCollector } = require('./collectors/hnCollector');
const { collect: rssCollector } = require('./collectors/rssCollector');
const { formatRelativeDate } = require('./utils/formatters');

const CACHE_FILE = path.join(__dirname, '../data/cache.json');
const SOURCES_FILE = path.join(__dirname, '../sources.yaml');
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

  // 2. Load Sources from YAML
  let sourcesConfig = { sources: [] };
  try {
    const yamlContent = await fs.readFile(SOURCES_FILE, 'utf8');
    sourcesConfig = yaml.load(yamlContent);
  } catch (err) {
    console.warn("[Aggregator] sources.yaml not found or invalid. Using defaults.", err.message);
  }

  // 3. Run Collectors
  const [mockData, ...newsResults] = await Promise.all([
    mockCollector(),
    ...sourcesConfig.sources.map(source => {
      if (source.type === 'hackernews') return hnCollector(source);
      if (source.type === 'rss') return rssCollector(source);
      return Promise.resolve({ site: source.name, items: [], error: 'Unknown collector type' });
    })
  ]);

  const data = {
    title: "Daily Briefing",
    timestamp: formatRelativeDate(new Date()),
    version: runVersion,
    brief: mockData.content, 
    todaysNews: newsResults.filter(r => r.items.length > 0),
    summary: null
  };

  // 4. Conditional Ollama Integration (Per-Site)
  const ollamaUrl = process.env.OLLAMA_URL;
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:3b';

  if (ollamaUrl) {
    // Version Check: If this run version matches the cached version, reuse the summary
    if (cachedData && cachedData.version === runVersion && cachedData.summary) {
      console.log(`[Aggregator] Version match (${runVersion}). Reusing cached summary.`);
      data.summary = cachedData.summary;
    } else {
      console.log(`[Aggregator] Requesting per-site summaries from Ollama...`);
      
      const summaries = [];
      for (const siteData of data.todaysNews) {
        const prompt = `You are a professional briefing assistant. Summarize the following news headlines from ${siteData.site}.

CRITICAL INSTRUCTIONS:
1. Output ONLY valid Markdown.
2. DO NOT include any conversational preamble.
3. Start your output EXACTLY with an h3 heading: ### Today's News from ${siteData.site}:
4. Provide a bulleted list of 3-5 concise, one-sentence summaries of the top stories.
5. DO NOT use headlines as site names. Only use ${siteData.site}.

Content:
${siteData.items.map(i => `- ${i.title}`).join("\n")}`;

        try {
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
            summaries.push(markdown);
            console.log(`[Aggregator] Summary generated for ${siteData.site}.`);
          } else {
            console.warn(`[Aggregator] Ollama returned status ${response.status} for ${siteData.site}`);
          }
        } catch (err) {
          console.warn(`[Aggregator] Ollama call failed for ${siteData.site}:`, err.message);
        }
      }

      if (summaries.length > 0) {
        data.summary = await marked.parse(summaries.join("\n\n"));
      }
    }
  }

  // 5. Update Cache
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
  console.log(`[Aggregator] Cache updated: ${CACHE_FILE}`);

  // 6. Render Briefing
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
