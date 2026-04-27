const fs = require('fs').promises;
const path = require('path');
const ejs = require('ejs');
const yaml = require('js-yaml');
const { marked } = require('marked');
const { collect: historyCollector } = require('./collectors/historyCollector');
const { collect: hnCollector } = require('./collectors/hnCollector');
const { collect: rssCollector } = require('./collectors/rssCollector');
const { collect: imapCollector } = require('./collectors/imapCollector');
const { formatRelativeDate, getBriefingRelativeDate } = require('./utils/formatters');

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
  const newsResults = [];
  
  for (const source of sourcesConfig.sources) {
    let result;
    try {
      if (source.type === 'hackernews') result = await hnCollector(source);
      else if (source.type === 'rss') result = await rssCollector(source);
      else if (source.type === 'imap') result = await imapCollector(source);
      else if (source.type === 'history') result = await historyCollector(source);
      else result = { site: source.name, items: [], error: 'Unknown collector type' };
      
      // Fallback: If fetch failed, try to reuse cached data for this site
      if (result.error && cachedData) {
        const allCached = [...(cachedData.emailUpdates || []), ...(cachedData.todaysNews || [])];
        if (cachedData.history) allCached.push(cachedData.history);
        
        const cachedSite = allCached.find(s => s.site === source.name);
        
        if (cachedSite && (cachedSite.items || cachedSite.rawData)) {
          console.log(`[Aggregator] Collector for ${source.name} failed. Falling back to cached data.`);
          if (cachedSite.items) result.items = cachedSite.items;
          if (cachedSite.rawData) result.rawData = cachedSite.rawData;
          result._reused = true;
        }
      }

      if (result.error && !result._reused) {
        result.failedNoCache = true;
      }

      if (!result.error && (!result.items || result.items.length === 0) && !result.rawData) {
        result.empty = true;
      }

      newsResults.push({ ...result, type: source.type, system_prompt: source.system_prompt });
    } catch (err) {
      console.error(`[Aggregator] Collector failed for ${source.name}:`, err.message);
    }
  }

  const historyResult = newsResults.find(r => r.type === 'history');

  const data = {
    title: "Daily Briefing",
    timestamp: formatRelativeDate(new Date()),
    version: runVersion,
    brief: "Fetching your historical overview...", 
    emailUpdates: newsResults.filter(r => r.type === 'imap'),
    todaysNews: newsResults.filter(r => r.type !== 'imap' && r.type !== 'history'),
    history: historyResult,
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
      data.brief = cachedData.brief;
    } else {
      console.log(`[Aggregator] Requesting summaries from Ollama...`);

      // 4a. Process History / Prose Intro
      if (data.history && data.history.rawData) {
        const promptChanged = cachedData && cachedData.history && cachedData.history.system_prompt !== data.history.system_prompt;
        
        if (data.history._reused && cachedData && cachedData.brief && !promptChanged) {
          console.log(`[Aggregator] Reusing cached history brief.`);
          data.brief = cachedData.brief;
        } else {
          if (promptChanged) {
            console.log(`[Aggregator] System prompt changed for history. Re-generating brief...`);
          } else {
            console.log(`[Aggregator] Generating conversational history brief...`);
          }
          const historyPrompt = `${data.history.system_prompt || 'Summarize these historical events into a conversational paragraph.'}\n\n<content>\n${data.history.rawData}\n</content>\n\nSummary:`;
          
          try {
            const response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: ollamaModel,
                prompt: historyPrompt,
                stream: false
              })
            });

            if (response.ok) {
              const result = await response.json();
              data.brief = await marked.parse(result.response.trim());
            }
          } catch (err) {
            console.warn(`[Aggregator] History brief generation failed:`, err.message);
            data.brief = "Historical overview unavailable today.";
          }
        }
      } else {
        data.brief = "No historical events found for today.";
      }
      
      const allResults = [...data.emailUpdates, ...data.todaysNews];
      for (const siteData of allResults) {
        const isImap = siteData.type === 'imap';

        if (siteData.empty) {
          console.log(`[Aggregator] Site ${siteData.site} is empty. Setting 'no updates' summary.`);
          data.summaries[siteData.site] = isImap ? await marked.parse(`- Email checked, no updates.`) : await marked.parse(`### News from ${siteData.site}\n- No significant updates.`);
          continue;
        }

        if (siteData.failedNoCache) {
          console.log(`[Aggregator] Site ${siteData.site} failed and no cache found. Setting 'no updates' summary.`);
          data.summaries[siteData.site] = isImap ? await marked.parse(`- No updates.`) : await marked.parse(`### News from ${siteData.site}\n- Connection failed, no updates available.`);
          continue;
        }

        console.log(`[Aggregator] Processing summaries for ${siteData.site}...`);
        
        // Summarize each item individually
        const itemSummaryPromises = siteData.items.map(async (item) => {
          const isEmail = siteData.type === 'imap';
          const prompt = `You are a professional briefing assistant. Summarize the following ${isEmail ? 'email' : 'news item'} into exactly ONE concise sentence.

<instructions>
1. Output ONLY the raw text of the summary.
2. DO NOT use markdown lists, bullets, bolding, or headings.
3. DO NOT include any conversational preamble or introductory text.
${isEmail ? '4. Summarize the main point of the email clearly and professionally.' : '4. VERBATIM MODE: Use the provided title verbatim if it is clear. DO NOT add names of authors, creators, or additional historical context.'}
5. NOISE REDUCTION: For security notices, DO NOT include tracking numbers (e.g., USN-XXXX, CVE-XXXX). Focus on the software and the vulnerability.
6. If the item is not interesting or relevant, output "No significant update."
</instructions>

<content>
${isEmail ? `From: ${item.from}\nSubject: ${item.title}` : `Title: ${item.title}`}
Description: ${item.description || 'N/A'}
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
              let summary = result.response.trim();
              // Clean up any accidental markdown or quotes the AI might include
              summary = summary.replace(/^["']|["']$/g, '').replace(/^[-*•●○][ \t]+/, '');
              
              if (summary.toLowerCase().includes('no significant update')) {
                return null;
              }

              if (isEmail) {
                const relativeDate = getBriefingRelativeDate(item.timestamp);
                return `From ${item.from}, ${relativeDate}: ${summary}`;
              }
              return summary;
            }
          } catch (err) {
            console.warn(`[Aggregator] Item summary failed for ${siteData.site}:`, err.message);
          }
          return null;
        });

        const itemSummaries = await Promise.all(itemSummaryPromises);
        const validSummaries = itemSummaries.filter(s => s !== null);

        if (validSummaries.length > 0) {
          const siteHeading = isImap ? '' : `### News from ${siteData.site}\n`;
          const markdownList = siteHeading + validSummaries.map(s => `- ${s}`).join("\n");
          data.summaries[siteData.site] = await marked.parse(markdownList);
          console.log(`[Aggregator] Summary generated for ${siteData.site} (${validSummaries.length} items).`);
        } else {
          // Fallback to old summary if we have it
          if (cachedData && cachedData.summaries && cachedData.summaries[siteData.site]) {
            console.log(`[Aggregator] No new summaries for ${siteData.site}. Reusing old summary.`);
            data.summaries[siteData.site] = cachedData.summaries[siteData.site];
          } else {
            data.summaries[siteData.site] = isImap ? '' : await marked.parse(`### News from ${siteData.site}\n- No significant updates.`);
          }
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
