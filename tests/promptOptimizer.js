/**
 * Ollama System Prompt Optimizer for Windows Insider
 * 
 * Conducts local-first testing of prompt variants, measures generation latency,
 * and performs multi-criteria scoring (1-10 confidence index) using deterministic checks
 * and LLM-as-a-judge self-evaluation.
 * 
 * Usage:
 *   node tests/promptOptimizer.js [--live] [--model llama3.2:3b]
 */

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

// Load environment variables
try {
  require('dotenv').config();
} catch (e) {
  // Silent fallback
}

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://100.106.38.68:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';
const CACHE_FILE = path.join(__dirname, '../data/cache.json');
const SCRATCH_DIR = '/home/aaron/.gemini/antigravity-cli/brain/46ac38d5-867c-4d26-a532-c33e1110659b/scratch';
const OUTPUT_FILE = path.join(SCRATCH_DIR, 'prompt_optimizer_results.json');

// Extremely realistic, full-length Windows Insider Beta build announcement for high-signal testing
const RICH_MOCK_CONTENT = {
  title: "Announcing Windows 11 Insider Preview Build 22635.3570 (KB5037000) to the Beta Channel",
  url: "https://blogs.windows.com/windows-insider/2026/05/15/announcing-windows-11-insider-preview-build-22635-3570-kb5037000-to-the-beta-channel/",
  description: `Hello Windows Insiders, today we are releasing Windows 11 Insider Preview Build 22635.3570 (KB5037000) to the Beta Channel.
This update includes the following new features, improvements, and fixes for Insiders who have opted to get the latest updates as they are available:

[Start Menu Recommendations]
* New! We are beginning to trial a new feature in the Start menu that recommends high-quality apps from the Microsoft Store. This recommendation box will appear under the 'Recommended' section. This feature will only roll out to a small subset of Insiders in the United States at first, and can be completely disabled under Settings > Personalization > Start by toggling off 'Show recommendations for tips, shortcuts, new apps, and more'.

[File Explorer Enhancements]
* We have significantly upgraded the built-in file sharing capabilities. You can now share files directly to Gmail, WhatsApp, and Telegram interfaces directly from the Windows share window, bypassing the need to open separate web pages or apps.
* Fixed a persistent issue where the File Explorer search box would occasionally freeze or become completely unresponsive to keyboard inputs after waking the system from sleep mode.

[Settings Page Updates]
* A dedicated 'Linked Devices' page has been added under Settings > Accounts. This new dashboard allows you to manage all PCs, Xbox consoles, and mobile devices currently logged in with your Microsoft Account (MSA), showing warranty status and subscription details directly in Windows.

[General Fixes]
* Fixed an underlying memory leak in the Windows Search service (SearchIndexer.exe) that could degrade system responsiveness and cause CPU usage to spike after several days of continuous operation.
* Fixed an issue where system taskbar icons would temporarily disappear or flash when switching between virtual desktops.

As a reminder, Beta Channel builds are based on Windows 11, version 23H2. They provide a stable environment for testing new capabilities before they are shipped to all customers. Thanks for your continued feedback!`,
  timestamp: "2026-05-15T19:50:25.000Z"
};

// System Prompt Variants
const VARIANTS = [
  {
    id: "variant-1-current",
    name: "Variant 1: Current Prompt",
    systemPrompt: `You are a professional briefing assistant. Summarize the key changes in this Windows Insider Beta build into 2-3 concise, conversational sentences.

<instructions>
1. Output ONLY the raw text of the summary.
2. Focus on the most significant user-facing features, improvements, or fixes.
3. Summarize the changes clearly so they are easy to understand when read aloud.
4. DO NOT include build numbers or technical version strings.
5. DO NOT include any conversational preamble.
6. If the build contains many changes, group them by category (e.g., "UI improvements include X and Y, while the Settings app added Z").
</instructions>`
  },
  {
    id: "variant-2-structured",
    name: "Variant 2: Structured & High-Signal (Scanner)",
    systemPrompt: `You are a technical product analyst. Summarize the user-facing changes in this Windows Insider Beta build into exactly 3 structured, high-signal points.

<instructions>
1. Output ONLY the summaries, one per line. Use exactly three points.
2. DO NOT include any conversational preamble, introductory text, or concluding remarks.
3. Format each point starting with a clear category descriptor in bold: "**[Feature]**", "**[Improvement]**", or "**[Fix]**".
4. Focus strictly on user-facing impact. Filter out internal bug IDs, developer telemetry, build numbers, or code names.
5. Summarize changes in active, direct voice.
6. LINK FORMATTING: If you include a URL, format it as a markdown link with descriptive text (e.g., [View Release Details](url)). Never output a raw URL.
</instructions>`
  },
  {
    id: "variant-3-audio-tts",
    name: "Variant 3: Audio/TTS-Optimized (Spoken Narrative)",
    systemPrompt: `You are a radio host and professional news anchor. Summarize the key changes in this Windows Insider Beta build into a warm, engaging narrative of exactly 2 to 3 conversational sentences, optimized for text-to-speech reading.

<instructions>
1. Output ONLY plain, conversational text in a single paragraph.
2. DO NOT use markdown formatting, bold text, italics, bullet points, numbered lists, or brackets.
3. DO NOT include build numbers, version strings, raw URLs, or bracketed text.
4. Ensure the summary flows smoothly when read aloud. Use natural, narrative transition words (like "first up," "additionally," or "finally") between sentences.
5. Keep sentences short to medium in length to allow natural breathing pauses for a reader.
6. Speak directly and in active voice (e.g., "Microsoft is introducing X" rather than "X is being introduced").
</instructions>`
  }
];

/**
 * Perform deterministic syntax checks on a summary
 */
function deterministicEvaluation(summary, variantId) {
  const result = {
    hasBuildNumber: /22635|\d{5}\.\d{4}|KB\d{7}/i.test(summary),
    hasBoilerplate: /here is/i.test(summary) || /sure, /i.test(summary) || /this build/i.test(summary.substring(0, 30)),
    hasMarkdown: /[\*\#\_\[\]]/.test(summary),
    hasRawUrl: /https?:\/\/[^\s]+/i.test(summary),
    sentenceCount: summary.split(/[.!?]+\s/).filter(s => s.trim().length > 0).length,
    score: 10,
    deductions: []
  };

  // Build numbers are strictly forbidden in all variants
  if (result.hasBuildNumber) {
    result.score -= 2.5;
    result.deductions.push("Contains build numbers or KB numbers (-2.5)");
  }

  // Boilerplate preamble check
  if (result.hasBoilerplate) {
    result.score -= 2.0;
    result.deductions.push("Contains introductory boilerplate/preamble (-2.0)");
  }

  // Raw URL check
  if (result.hasRawUrl) {
    result.score -= 2.0;
    result.deductions.push("Contains raw unformatted URLs (-2.0)");
  }

  // Variant specific checks
  if (variantId === "variant-3-audio-tts") {
    // TTS should NOT have any markdown whatsoever
    if (result.hasMarkdown) {
      result.score -= 2.5;
      result.deductions.push("TTS summary contains markdown formatting (stars, brackets, etc.) which degrades audio flow (-2.5)");
    }
    // Sentence count should be exactly 2 or 3
    if (result.sentenceCount < 2 || result.sentenceCount > 3) {
      result.score -= 1.0;
      result.deductions.push(`TTS summary sentence count is ${result.sentenceCount}, expected 2 or 3 (-1.0)`);
    }
  } else if (variantId === "variant-2-structured") {
    // Structured MUST have category headings and markdown formatting
    const hasCategoryHeaders = /\*\*\[(Feature|Improvement|Fix)\]\*\*/i.test(summary) || /\*\*(Feature|Improvement|Fix):\*\*/i.test(summary);
    if (!hasCategoryHeaders) {
      result.score -= 2.0;
      result.deductions.push("Structured variant lacks standard bold category indicators (**[Feature]**, etc.) (-2.0)");
    }
    const lines = summary.split('\n').filter(l => l.trim().length > 0);
    if (lines.length !== 3) {
      result.score -= 1.5;
      result.deductions.push(`Structured variant has ${lines.length} lines instead of exactly 3 (-1.5)`);
    }
  } else {
    // General sentence count constraint
    if (result.sentenceCount < 2 || result.sentenceCount > 4) {
      result.score -= 1.0;
      result.deductions.push(`General summary sentence count is ${result.sentenceCount}, expected 2-3 (-1.0)`);
    }
  }

  result.score = Math.max(1, Math.min(10, result.score));
  return result;
}

/**
 * Query Ollama to evaluate the summary (LLM-as-a-judge)
 */
async function llmEvaluation(originalText, summary, variantName) {
  const judgePrompt = `You are a strict, skeptical Quality Assurance judge. Evaluate the quality of a summary generated from a Windows Insider blog post.
The summary was generated using the target goals of: ${variantName}.

Here is the original source text:
<original_content>
${originalText}
</original_content>

Here is the generated summary to evaluate:
<generated_summary>
${summary}
</generated_summary>

Evaluate the summary against the following criteria, giving each a score from 1 to 10:
1. Conciseness (1-10): Is it short and high-signal, containing only key details without wordiness?
2. Lack of Boilerplate (1-10): Is it completely free of preamble (e.g. "This build...", "Here is...") or conversational noise? Starts directly with high-value facts.
3. Formatting & Readability (1-10): Does it adhere to its structural goals? (e.g., if structured, is it clean bullets? If audio, is it smooth, plain narrative text without markdown elements like asterisks, links, or brackets?)

Return ONLY a valid JSON object. Do not include markdown code fence wrappers, conversational text, or introductions. The response MUST be exactly parseable as JSON matching this structure:
{
  "conciseness": <integer_1_to_10>,
  "no_boilerplate": <integer_1_to_10>,
  "formatting_readability": <integer_1_to_10>,
  "justification": "<brief explanation of the scores>"
}`;

  try {
    const response = await fetch(`${OLLAMA_URL.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: judgePrompt,
        stream: false,
        options: {
          temperature: 0.1 // Low temperature for consistent judging
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP Error ${response.status}`);
    }

    const result = await response.json();
    const cleanResponse = result.response.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(cleanResponse);
  } catch (err) {
    // Fallback if LLM evaluation fails or returns invalid JSON
    return {
      conciseness: 7,
      no_boilerplate: 7,
      formatting_readability: 7,
      justification: `LLM-as-a-judge parsing failed: ${err.message}`
    };
  }
}

/**
 * Core runner
 */
async function run() {
  console.log(`====================================================================`);
  console.log(`           OLLAMA SYSTEM PROMPT OPTIMIZER (TEST/COMMIT)              `);
  console.log(`====================================================================`);
  console.log(`Model:      ${OLLAMA_MODEL}`);
  console.log(`Ollama URL: ${OLLAMA_URL}`);

  // 1. Determine Source Item
  let sourceItem = RICH_MOCK_CONTENT;
  const useLive = process.argv.includes('--live');

  if (useLive) {
    console.log(`\n[Source] Attempting to parse live RSS feed...`);
    try {
      const RSSParser = require('rss-parser');
      const parser = new RSSParser();
      const feed = await parser.parseURL('https://blogs.windows.com/windows-insider/feed/');
      const latestBeta = feed.items.find(item => {
        const title = item.title.toLowerCase();
        const content = (item.content || item.contentSnippet || '').toLowerCase();
        const isBuildAnnouncement = title.includes('announcing') || title.includes('releasing') || title.includes('new builds') || title.includes('preview build');
        const betaKeywords = ['beta channel', 'beta preview', '(beta)', 'to the beta'];
        return isBuildAnnouncement && betaKeywords.some(keyword => title.includes(keyword) || content.includes(keyword));
      });

      if (latestBeta) {
        sourceItem = {
          title: latestBeta.title,
          url: latestBeta.link,
          description: latestBeta.content || latestBeta.contentSnippet || '',
          timestamp: latestBeta.isoDate || latestBeta.pubDate
        };
        console.log(`[Source] SUCCESSFULLY fetched live item: "${sourceItem.title}"`);
      } else {
        console.log(`[Source] No Beta announcement in feed. Using rich local mock instead.`);
      }
    } catch (err) {
      console.log(`[Source] Live fetch failed: ${err.message}. Using rich local mock instead.`);
    }
  } else {
    // Try to load cached item if available, otherwise default to RICH_MOCK_CONTENT
    try {
      const rawCache = await fs.readFile(CACHE_FILE, 'utf8');
      const cache = JSON.parse(rawCache);
      const cachedInsider = cache.todaysNews.find(s => s.type === 'windowsinsider');
      if (cachedInsider && cachedInsider.items && cachedInsider.items.length > 0) {
        console.log(`[Source] Loaded Windows Insider item from cached cache.json`);
        // If cached item description is too brief, merge it with RICH_MOCK_CONTENT details to provide a true signal test
        if (cachedInsider.items[0].description.length < 600) {
          console.log(`[Source] Cached item details are brief. Using enriched mock based on Cached Title: "${cachedInsider.items[0].title}"`);
          sourceItem = {
            ...RICH_MOCK_CONTENT,
            title: cachedInsider.items[0].title,
            url: cachedInsider.items[0].url
          };
        } else {
          sourceItem = cachedInsider.items[0];
        }
      } else {
        console.log(`[Source] No cached items found. Using rich local mock.`);
      }
    } catch (err) {
      console.log(`[Source] No cache file found or readable. Using rich local mock.`);
    }
  }

  console.log(`\nMock Item Title: "${sourceItem.title}"`);
  console.log(`Content Snippet Length: ${sourceItem.description.length} chars`);

  const results = [];

  // 2. Loop through variants
  for (const variant of VARIANTS) {
    console.log(`\n--------------------------------------------------------------------`);
    console.log(`Running: ${variant.name}...`);
    
    const fullPrompt = `${variant.systemPrompt}\n\n<content>\nTitle: ${sourceItem.title}\nDescription: ${sourceItem.description}\n</content>\n\nSummary:`;
    
    const startTime = performance.now();
    let responseText = "";
    let error = null;

    try {
      const response = await fetch(`${OLLAMA_URL.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: fullPrompt,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const resJson = await response.json();
      responseText = resJson.response.trim();
    } catch (err) {
      error = err.message;
      console.error(`Error during generation: ${err.message}`);
    }
    const endTime = performance.now();
    const durationMs = endTime - startTime;
    const durationSec = (durationMs / 1000).toFixed(2);

    if (error) {
      results.push({
        id: variant.id,
        name: variant.name,
        durationMs,
        durationSec,
        output: "FAILED",
        error,
        deterministicScore: 0,
        judgeScore: null,
        finalScore: 0
      });
      continue;
    }

    console.log(`Generated in: ${durationSec}s`);
    console.log(`Output:\n"""\n${responseText}\n"""`);

    // 3. Evaluation
    // A. Deterministic Check
    const deterministic = deterministicEvaluation(responseText, variant.id);

    // B. LLM Judge
    console.log(`Requesting LLM-as-a-judge scoring...`);
    const judge = await llmEvaluation(sourceItem.description, responseText, variant.name);
    
    // Calculate composite score
    // Deterministic counts for 50%, LLM judge average counts for 50%
    const judgeAvg = (judge.conciseness + judge.no_boilerplate + judge.formatting_readability) / 3;
    const compositeScore = ((deterministic.score + judgeAvg) / 2).toFixed(1);

    console.log(`Deterministic Score: ${deterministic.score}/10`);
    console.log(`LLM Judge Score:     ${judgeAvg.toFixed(1)}/10`);
    console.log(`  - Conciseness:     ${judge.conciseness}/10`);
    console.log(`  - Preamble/Noise:  ${judge.no_boilerplate}/10`);
    console.log(`  - Formatting:      ${judge.formatting_readability}/10`);
    console.log(`  - Justification:   ${judge.justification}`);
    console.log(`Composite Score:     ${compositeScore}/10`);

    results.push({
      id: variant.id,
      name: variant.name,
      durationMs,
      durationSec,
      output: responseText,
      deterministic,
      judge,
      finalScore: parseFloat(compositeScore)
    });
  }

  // 4. Save results to scratch folder
  await fs.mkdir(SCRATCH_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify({
    timestamp: new Date().toISOString(),
    model: OLLAMA_MODEL,
    sourceItem,
    results
  }, null, 2), 'utf8');

  console.log(`\n====================================================================`);
  console.log(`                       SUMMARY OF RESULTS                           `);
  console.log(`====================================================================`);
  
  // Find highest scoring variant
  const sorted = [...results].sort((a, b) => b.finalScore - a.finalScore);
  const best = sorted[0];

  results.forEach(r => {
    console.log(`${r.name.padEnd(42)} | Score: ${r.finalScore.toString().padEnd(4)}/10 | Latency: ${r.durationSec}s`);
  });

  console.log(`\n🥇 RECOMMENDED PROMPT: ${best.name}`);
  console.log(`Score: ${best.finalScore}/10`);
  console.log(`Justification: ${best.judge.justification}`);
  console.log(`\nFull results saved to: ${OUTPUT_FILE}`);
}

run().catch(err => {
  console.error("Optimizer script crashed:", err);
  process.exit(1);
});
