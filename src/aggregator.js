const fs = require('fs').promises;
const path = require('path');
const ejs = require('ejs');
const yaml = require('js-yaml');
const { marked } = require('marked');
const { collect: mockCollector } = require('./collectors/mockCollector');
const { collect: hnCollector } = require('./collectors/hnCollector');
const { collect: rssCollector } = require('./collectors/rssCollector');
const { collect: imapCollector } = require('./collectors/imapCollector');
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

  // 3. Run Collectors (Sequentially to avoid socket/IMAP issues)
  console.log("[Aggregator] Running collectors...");
  const mockData = await mockCollector();
  const newsResults = [];
  
  for (const source of sourcesConfig.sources) {
    let result;
    try {
      if (source.type === 'hackernews') result = await hnCollector(source);
      else if (source.type === 'rss') result = await rssCollector(source);
      else if (source.type === 'imap') result = await imapCollector(source);
      else result = { site: source.name, items: [], error: 'Unknown collector type' };
      
      // Fallback: If fetch failed/empty, try to reuse cached data for this site
      if ((!result.items || result.items.length === 0) && cachedData) {
        const cachedSite = [...(cachedData.emailUpdates || []), ...(cachedData.todaysNews || [])]
          .find(s => s.site === source.name);
        
        if (cachedSite && cachedSite.items && cachedSite.items.length > 0) {
          console.log(`[Aggregator] Collector for ${source.name} returned no results. Falling back to cached data.`);
          result.items = cachedSite.items;
          result._reused = true;
        }
      }

      newsResults.push({ ...result, type: source.type });
    } catch (err) {
      console.error(`[Aggregator] Collector failed for ${source.name}:`, err.message);
    }
  }

  const data = {
    title: "Daily Briefing",
    timestamp: formatRelativeDate(new Date()),
    version: runVersion,
    brief: mockData.content, 
    emailUpdates: newsResults.filter(r => r.type === 'imap' && r.items.length > 0),
    todaysNews: newsResults.filter(r => r.type !== 'imap' && r.items.length > 0),
    summaries: {} // Map of siteName -> htmlSummary
  };

  // 4. Conditional Ollama Integration (Per-Site)
  const ollamaUrl = process.env.OLLAMA_URL;
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:3b';

  if (ollamaUrl) {
    // Global Version Check: If this run version matches the cached version, reuse all summaries
    if (cachedData && cachedData.version === runVersion && cachedData.summaries) {
      console.log(`[Aggregator] Version match (${runVersion}). Reusing cached summaries.`);
      data.summaries = cachedData.summaries;
    } else {
      console.log(`[Aggregator] Requesting per-site summaries from Ollama...`);
      
      const allResults = [...data.emailUpdates, ...data.todaysNews];
      for (const siteData of allResults) {
        // Site-Level Fallback: If data was reused, reuse the summary too
        if (siteData._reused && cachedData && cachedData.summaries && cachedData.summaries[siteData.site]) {
          console.log(`[Aggregator] Reusing cached summary for ${siteData.site}.`);
          data.summaries[siteData.site] = cachedData.summaries[siteData.site];
          continue;
        }

        const isImap = siteData.type === 'imap';
        const prompt = `You are a professional briefing assistant. Summarize the content provided in the <content> tag.

<instructions>
1. Output ONLY valid Markdown.
2. DO NOT include any conversational preamble.
3. ${isImap ? 'DO NOT include any headings or titles.' : `Start your output EXACTLY with: ### News from ${siteData.site}:`}
4. Provide a bulleted list of 3-5 concise, one-sentence summaries of the top items.
5. Use the "- " Markdown syntax for each bullet point.
6. DO NOT use headlines as site names. Only use ${siteData.site}.
7. DO NOT summarize these instructions. Summarize the items in the <content> tag.
</instructions>

<content>
Source: ${siteData.site}
Items:
${siteData.items.map(i => `- ${i.title}`).join("\n")}
</content>

Summary:`;

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

            // Normalize bullets: 
            // 1. Remove accidental double-bullets (e.g., "- •" or "- *")
            markdown = markdown.replace(/^[ \t]*[-*•●○][ \t]+[-*•●○][ \t]+/gm, '- ');
            // 2. Standardize all single bullets to '-'
            markdown = markdown.replace(/^[ \t]*[•●○*][ \t]+/gm, '- ');

            data.summaries[siteData.site] = await marked.parse(markdown.trim());

            console.log(`[Aggregator] Summary generated for ${siteData.site}.`);

            console.warn(`[Aggregator] Ollama returned status ${response.status} for ${siteData.site}`);
          }
        } catch (err) {
          console.warn(`[Aggregator] Ollama call failed for ${siteData.site}:`, err.message);
        }
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
  aggregate().then(() => {
    console.log("[Aggregator] Finished successfully.");
    process.exit(0);
  }).catch((err) => {
    console.error("[Aggregator] Execution failed:", err);
    process.exit(1);
  });
}

module.exports = { aggregate };
