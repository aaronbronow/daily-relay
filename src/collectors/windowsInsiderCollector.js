const RSSParser = require('rss-parser');
const parser = new RSSParser();

/**
 * Windows Insider Collector.
 * Fetches the official Windows Insider blog feed and filters for Beta Channel releases.
 * Prioritizes releases from the current calendar week (starting Monday).
 * Falls back to the single most recent Beta release if none found this week.
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

    const results = selectedItems.map(item => ({
      title: item.title,
      url: item.link,
      description: item.contentSnippet || item.content || '',
      timestamp: item.isoDate || item.pubDate || new Date().toISOString()
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
