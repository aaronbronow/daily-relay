const Parser = require('rss-parser');
const parser = new Parser();

/**
 * Generic RSS/Atom Collector.
 * Fetches and parses standard XML feeds using rss-parser.
 * 
 * @param {Object} config - The source configuration from sources.yaml
 */
async function collect(config) {
  const SITE_NAME = config.name;
  const URL = config.url;
  const LIMIT = config.limit || 5;

  try {
    const feed = await parser.parseURL(URL);
    const items = feed.items.slice(0, LIMIT).map(item => ({
      title: item.title,
      url: item.link,
      timestamp: item.isoDate || item.pubDate || new Date().toISOString()
    }));

    return {
      site: SITE_NAME,
      items: items
    };
  } catch (error) {
    console.error(`[rssCollector] Error fetching from ${SITE_NAME}:`, error);
    return {
      site: SITE_NAME,
      items: [],
      error: error.message
    };
  }
}

module.exports = { collect };
