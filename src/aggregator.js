const fs = require('fs').promises;
const path = require('path');
const ejs = require('ejs');
const yaml = require('js-yaml');
const { marked } = require('marked');
try {
  require('dotenv').config();
} catch (e) {
  // Optional: environment variables might be provided by Docker
}
const { collect: historyCollector } = require('./collectors/historyCollector');
const { collect: tasksCollector } = require('./collectors/tasksCollector');
const { collect: hnCollector } = require('./collectors/hnCollector');
const { collect: rssCollector } = require('./collectors/rssCollector');
const { collect: imapCollector } = require('./collectors/imapCollector');
const { collect: githubCollector } = require('./collectors/githubCollector');
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

  // Parse CLI args for skipping/filtering
  const args = process.argv.slice(2);
  const onlySources = [];
  const skipSources = [];
  let forceSummarize = false;

  for (let i = 0; i < args.length; i++) {
    // Note: --only and --include are npm config collisions. 
    // Use --source, or ensure you use the -- separator: npm run aggregate -- --only "Source"
    if ((args[i] === '--only' || args[i] === '--source') && args[i+1]) { 
      onlySources.push(args[i+1]); 
      i++; 
    }
    else if (args[i] === '--skip' && args[i+1]) { 
      skipSources.push(args[i+1]); 
      i++; 
    }
    else if (args[i] === '--force') {
      forceSummarize = true;
    }
  }

  // 3. Run Collectors (Sequentially to avoid socket/IMAP issues)
  console.log("[Aggregator] Running collectors...");
  const newsResults = [];
  const staleSources = [];
  
  for (const source of sourcesConfig.sources) {
    let result;
    
    const isOnly = onlySources.length > 0 && !onlySources.includes(source.name);
    const isSkip = skipSources.includes(source.name) || source.skip === true;
    
    try {
      if (isOnly || isSkip) {
        console.log(`[Aggregator] Skipping collector for ${source.name} (using cache if available).`);
        result = { site: source.name, items: [], error: 'Skipped by config/CLI' };
      } else {
        if (source.type === 'hackernews') result = await hnCollector(source);
        else if (source.type === 'rss') result = await rssCollector(source);
        else if (source.type === 'imap') result = await imapCollector(source);
        else if (source.type === 'github') result = await githubCollector(source);
        else if (source.type === 'history') result = await historyCollector(source);
        else if (source.type === 'tasks') result = await tasksCollector(source);
        else result = { site: source.name, items: [], error: 'Unknown collector type' };
      }
      
      // Fallback: If fetch failed or was skipped, try to reuse cached data for this site
      if (result.error && cachedData) {
        const allCached = [...(cachedData.emailUpdates || []), ...(cachedData.todaysNews || []), ...(cachedData.githubUpdates || [])];
        if (cachedData.history) allCached.push(cachedData.history);
        if (cachedData.tasks) allCached.push(cachedData.tasks);
        
        const cachedSite = allCached.find(s => s.site === source.name);
        
        if (cachedSite && (cachedSite.items || cachedSite.rawData)) {
          if (isOnly || isSkip) {
            console.log(`[Aggregator] Loaded skipped source ${source.name} from cache.`);
          } else {
            console.log(`[Aggregator] Collector for ${source.name} failed. Falling back to cached data.`);
            staleSources.push(source.name);
          }
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

      newsResults.push({ ...source, ...result });
    } catch (err) {
      console.error(`[Aggregator] Collector failed for ${source.name}:`, err.message);
    }
  }

  const historyResult = newsResults.find(r => r.type === 'history');
  const tasksResult = newsResults.find(r => r.type === 'tasks');

  const data = {
    title: "Daily Briefing",
    timestamp: formatRelativeDate(new Date()),
    version: runVersion,
    brief: "Fetching your overview...", 
    emailUpdates: newsResults.filter(r => r.type === 'imap'),
    githubUpdates: newsResults.filter(r => r.type === 'github'),
    todaysNews: newsResults.filter(r => r.type !== 'imap' && r.type !== 'github' && r.type !== 'history' && r.type !== 'tasks'),
    history: historyResult,
    tasks: tasksResult,
    summaries: {}, // Map of siteName -> htmlSummary
    systemWarning: null
  };

  // 4. Conditional Ollama Integration (Per-Site)
  const ollamaUrl = process.env.OLLAMA_URL;
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:3b';

  if (ollamaUrl) {
    // 4.0 Pre-flight check for Ollama
    let ollamaOffline = false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const ping = await fetch(`${ollamaUrl.replace(/\/$/, '')}/`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!ping.ok) ollamaOffline = true;
    } catch (err) {
      ollamaOffline = true;
    }

    if (ollamaOffline) {
      console.warn(`[Aggregator] Ollama server is unreachable at ${ollamaUrl}. Skipping AI summaries.`);
      data.systemWarning = "AI server is unreachable. Summaries may be missing or outdated.";
    } else if (staleSources.length > 0) {
      data.systemWarning = `Connection failed for: ${staleSources.join(', ')}. Showing cached data.`;
    }

    if (forceSummarize) {
      console.log(`[Aggregator] Force flag detected. Bypassing version check.`);
    }

    // Global Version Check: If this run version matches the cached version, reuse all summaries
    if (!forceSummarize && cachedData && cachedData.version === runVersion && cachedData.summaries) {
      console.log(`[Aggregator] Version match (${runVersion}). Reusing cached summaries.`);
      data.summaries = cachedData.summaries;
      data.brief = cachedData.brief;
    } else {
      if (!ollamaOffline) {
        console.log(`[Aggregator] Requesting summaries from Ollama...`);
      } else {
        console.log(`[Aggregator] Reusing cached summaries/brief due to AI offline.`);
      }

      // 4a. Process Prose Intro (History & Tasks)
      let historyPart = "";
      if (data.history && data.history.rawData) {
        const promptChanged = cachedData && cachedData.history && cachedData.history.system_prompt !== data.history.system_prompt;
        if ((data.history._reused || ollamaOffline) && cachedData && cachedData._historyBrief && !promptChanged) {
          historyPart = cachedData._historyBrief;
        } else if (!ollamaOffline) {
          console.log(`[Aggregator] Generating history brief...`);
          const historyPrompt = `${data.history.system_prompt || 'Summarize these historical events into a conversational paragraph.'}\n\n<content>\n${data.history.rawData}\n</content>\n\nSummary:`;
          try {
            const response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: ollamaModel, prompt: historyPrompt, stream: false })
            });
            if (response.ok) {
              const result = await response.json();
              historyPart = result.response.trim();
              
              // Add a small source link like Google AI summaries
              const historyUrl = data.history.source_url;
              const historyLabel = data.history.source_name || "Source";
              if (historyUrl) {
                historyPart += ` <a href="${historyUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 0.7rem; vertical-align: super; text-decoration: none; background: #eee; padding: 1px 6px; border-radius: 10px; color: #555; margin-left: 4px;">Source: ${historyLabel}</a>`;
              }
              
              data._historyBrief = historyPart; // Store raw text for potential reuse
            }
          } catch (err) { console.warn(`[Aggregator] History brief failed:`, err.message); }
        }
      }

      let tasksPart = "";
      if (data.tasks && data.tasks.rawData) {
        const promptChanged = cachedData && cachedData.tasks && cachedData.tasks.system_prompt !== data.tasks.system_prompt;
        if ((data.tasks._reused || ollamaOffline) && cachedData && cachedData._tasksBrief && !promptChanged) {
          tasksPart = cachedData._tasksBrief;
        } else if (!ollamaOffline) {
          console.log(`[Aggregator] Generating tasks brief...`);
          const tasksPrompt = `${data.tasks.system_prompt || 'Summarize these tasks.'}\n\n<content>\n${data.tasks.rawData}\n</content>\n\nSummary:`;
          try {
            const response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: ollamaModel, prompt: tasksPrompt, stream: false })
            });
            if (response.ok) {
              const result = await response.json();
              tasksPart = result.response.trim();
              data._tasksBrief = tasksPart;
            }
          } catch (err) { console.warn(`[Aggregator] Tasks brief failed:`, err.message); }
        }
      }

      // Combine parts into final Markdown/HTML brief
      const combinedProse = [];
      if (historyPart) combinedProse.push(historyPart);
      if (tasksPart) combinedProse.push(tasksPart);
      
      if (combinedProse.length > 0) {
        data.brief = await marked.parse(combinedProse.join("\n\n"));
      } else {
        data.brief = ollamaOffline ? "<p>Summaries unavailable (AI offline).</p>" : "<p>No updates available for your morning overview.</p>";
      }
      
      const allResults = [...data.emailUpdates, ...data.githubUpdates, ...data.todaysNews];
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

        if (ollamaOffline || siteData._reused) {
          if (cachedData && cachedData.summaries && cachedData.summaries[siteData.site]) {
            if (siteData._reused && !ollamaOffline) console.log(`[Aggregator] Reusing cached summary for ${siteData.site}.`);
            data.summaries[siteData.site] = cachedData.summaries[siteData.site];
          } else {
            data.summaries[siteData.site] = isImap ? '' : await marked.parse(`### News from ${siteData.site}\n- Summaries unavailable${ollamaOffline ? ' (AI offline)' : ''}.`);
          }
          continue;
        }

        console.log(`[Aggregator] Processing summaries for ${siteData.site}...`);
        
        // Summarize each item individually
        const itemSummaryPromises = siteData.items.map(async (item) => {
          const isEmail = siteData.type === 'imap';
          const isGithub = siteData.type === 'github';
          
          let prompt = "";
          if (siteData.system_prompt) {
            prompt = `${siteData.system_prompt}\n\n<content>\n${isEmail ? `From: ${item.from}\nSubject: ${item.title}` : `Title: ${item.title}`}\nDescription: ${item.description || 'N/A'}\n</content>\n\nSummary:`;
          } else {
            let typeLabel = 'news item';
            if (isEmail) typeLabel = 'email';
            if (isGithub) typeLabel = 'GitHub release';

            prompt = `You are a professional briefing assistant. Summarize the following ${typeLabel} into ${isGithub ? 'exactly 2-3 concise prose sentences' : 'exactly ONE concise sentence'}.

<instructions>
1. Output ONLY the raw text of the summary.
2. DO NOT use markdown lists, bullets, bolding, or headings.
3. DO NOT include any conversational preamble or introductory text.
${isEmail ? '4. Summarize the main point of the email clearly and professionally.' : ''}
${isGithub ? '4. Summarize the key features or changes in this release. Focus on what is new or improved.' : ''}
${(!isEmail && !isGithub) ? '4. VERBATIM MODE: Use the provided title verbatim if it is clear. DO NOT add names of authors, creators, or additional historical context.' : ''}
5. NOISE REDUCTION: For security notices, DO NOT include tracking numbers (e.g., USN-XXXX, CVE-XXXX). Focus on the software and the vulnerability.
6. If the item is not interesting or relevant, output "No significant update."
</instructions>

<content>
${isEmail ? `From: ${item.from}\nSubject: ${item.title}` : `Title: ${item.title}`}
Description: ${item.description || 'N/A'}
</content>

Summary:`;
          }

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
              if (isGithub) {
                const relativeDate = getBriefingRelativeDate(item.timestamp);
                return `${item.site}, ${item.version}, ${relativeDate}: ${summary}`;
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
          const isGithub = siteData.type === 'github';
          const siteHeading = (isImap || isGithub) ? '' : `### News from ${siteData.site}\n`;
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
