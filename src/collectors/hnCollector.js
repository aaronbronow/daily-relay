/**
 * Hacker News Scraper Collector.
 * Fetches top stories using the official Firebase API with native fetch.
 * 
 * @param {Object} config - The source configuration from sources.yaml
 */
async function collect(config) {
  const SITE_NAME = config.name || "Hacker News";
  const TOP_STORIES_URL = config.url || "https://hacker-news.firebaseio.com/v0/topstories.json";
  const ITEM_URL_BASE = "https://hacker-news.firebaseio.com/v0/item/";
  const LIMIT = config.limit || 10;

  try {
    const response = await fetch(TOP_STORIES_URL);
    if (!response.ok) throw new Error(`Failed to fetch top stories: ${response.statusText}`);
    
    const storyIds = await response.json();
    const topIds = storyIds.slice(0, LIMIT);

    const storyPromises = topIds.map(async (id) => {
      const itemResponse = await fetch(`${ITEM_URL_BASE}${id}.json`);
      if (!itemResponse.ok) return null;
      return itemResponse.json();
    });

    const stories = await Promise.all(storyPromises);
    const items = stories
      .filter(s => s !== null && s.title)
      .map(s => ({
        title: s.title,
        url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        timestamp: new Date(s.time * 1000).toISOString()
      }));

    return {
      site: SITE_NAME,
      items: items
    };
  } catch (error) {
    console.error(`[hnCollector] Error fetching from ${SITE_NAME}:`, error);
    return {
      site: SITE_NAME,
      items: [],
      error: error.message
    };
  }
}

module.exports = { collect };
