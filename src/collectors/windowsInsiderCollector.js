const RSSParser = require('rss-parser');
const parser = new RSSParser();

/**
 * Clean HTML tags and entities from a string
 */
function cleanText(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, '') // Strip tags
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#038;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract Notable New Features from Windows Insider Blog HTML
 */
function extractSemanticContent(html) {
  // 1. Look for the "Notable new features" section
  const headingRegex = /<h2[^>]*>(?:<strong>)?(?:Notable\s+)?new\s+features:?(?:<\/strong>)?<\/h2>/i;
  const match = html.match(headingRegex);
  
  if (!match) {
    // Generic fallback: slice main article content and grab substantial paragraphs
    return fallbackExtraction(html);
  }
  
  const startIndex = match.index;
  // Slice from the start of the heading to the end of the HTML (or next H2 section like Changes/Fixes)
  let sectionContent = html.substring(startIndex);
  const nextH2Match = sectionContent.substring(match[0].length).match(/<h2[^>]*>/i);
  if (nextH2Match) {
    sectionContent = sectionContent.substring(0, match[0].length + nextH2Match.index);
  }
  
  // Parse <h3> feature headings and their subsequent <p> descriptions
  const featureRegex = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|<h2|$)/gi;
  let featureMatch;
  const features = [];
  
  while ((featureMatch = featureRegex.exec(sectionContent))) {
    const heading = cleanText(featureMatch[1]);
    const bodyHtml = featureMatch[2];
    
    // Extract first few paragraphs
    const paragraphs = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pRegex.exec(bodyHtml)) && paragraphs.length < 2) {
      const cleanedP = cleanText(pMatch[1]);
      if (cleanedP.length > 20 && !cleanedP.toLowerCase().includes("release channel:")) {
        paragraphs.push(cleanedP);
      }
    }
    
    if (heading && paragraphs.length > 0) {
      features.push(`- **${heading}**: ${paragraphs.join(' ')}`);
    }
  }
  
  if (features.length > 0) {
    return `Notable New Features:\n${features.join('\n')}`;
  }
  
  return fallbackExtraction(html);
}

/**
 * Fallback paragraph extraction if "Notable new features" section not found
 */
function fallbackExtraction(html) {
  let mainContent = html;
  const articleStart = html.indexOf('<article');
  const articleEnd = html.indexOf('</article>');
  if (articleStart !== -1 && articleEnd !== -1) {
    mainContent = html.substring(articleStart, articleEnd);
  }
  
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  const paragraphs = [];
  while ((pMatch = pRegex.exec(mainContent)) && paragraphs.length < 15) {
    const cleaned = cleanText(pMatch[1]);
    if (cleaned.length > 50 && !cleaned.toLowerCase().includes("post") && !cleaned.toLowerCase().includes("insiders")) {
      paragraphs.push(cleaned);
    }
  }
  
  return paragraphs.join('\n\n');
}

/**
 * Windows Insider Collector.
 * Fetches the official Windows Insider blog feed and filters for Beta Channel releases.
 * Prioritizes releases from the current calendar week (starting Monday).
 * Falls back to the single most recent Beta release if none found this week.
 * Pre-parses the full HTML article body to extract detailed "Notable New Features".
 * 
 * @param {Object} config - The source configuration from sources.yaml
 */
async function collect(config) {
  const SITE_NAME = config.name || 'Windows Insider Beta';
  const FEED_URL = config.url || 'https://blogs.windows.com/windows-insider/feed/';

  // Calculate start of current calendar week (Monday)
  const now = new Date();
  const day = now.getDay(); // 0 is Sunday, 1 is Monday
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);

  try {
    const feed = await parser.parseURL(FEED_URL);
    
    // Improved matching logic to handle channel naming variations
    const isBetaItem = (item) => {
      const title = item.title.toLowerCase();
      const content = (item.content || item.contentSnippet || '').toLowerCase();
      
      const isBuildAnnouncement = title.includes('announcing') || title.includes('releasing') || title.includes('new builds') || title.includes('preview build');
      
      // Look for variations like "Beta Channel", "Beta Preview", "(Beta)", or "Builds [number] to the Beta"
      const betaKeywords = ['beta channel', 'beta preview', '(beta)', 'to the beta'];
      const mentionsBeta = betaKeywords.some(keyword => title.includes(keyword) || content.includes(keyword));
      
      return isBuildAnnouncement && mentionsBeta;
    };

    // 1. First, look for all Beta items from this week
    const weeklyBetaItems = feed.items.filter(item => {
      const publishedDate = new Date(item.isoDate || item.pubDate);
      return isBetaItem(item) && publishedDate >= monday;
    });

    let selectedItems = [];

    if (weeklyBetaItems.length > 0) {
      selectedItems = weeklyBetaItems;
    } else {
      // 2. Fallback: Find the single most recent Beta release from the entire feed
      const latestBeta = feed.items.find(item => isBetaItem(item));

      if (latestBeta) {
        selectedItems = [latestBeta];
      }
    }

    if (selectedItems.length === 0) {
      return {
        site: SITE_NAME,
        items: []
      };
    }

    // 3. Pre-parse full HTML for selected items to extract substantive notable features
    const results = await Promise.all(selectedItems.map(async (item) => {
      let description = item.contentSnippet || item.content || '';
      
      if (item.link) {
        try {
          const response = await fetch(item.link);
          if (response.ok) {
            const html = await response.text();
            const semanticDescription = extractSemanticContent(html);
            if (semanticDescription && semanticDescription.length > 100) {
              description = semanticDescription;
            }
          }
        } catch (fetchErr) {
          console.warn(`[windowsInsiderCollector] Failed to fetch full blog body for ${item.link}:`, fetchErr.message);
        }
      }

      return {
        title: item.title,
        url: item.link,
        description: description,
        timestamp: item.isoDate || item.pubDate || new Date().toISOString()
      };
    }));

    return {
      site: SITE_NAME,
      items: results
    };
  } catch (error) {
    console.error(`[windowsInsiderCollector] Error fetching from ${SITE_NAME}:`, error);
    return {
      site: SITE_NAME,
      items: [],
      error: error.message
    };
  }
}

module.exports = { collect };
