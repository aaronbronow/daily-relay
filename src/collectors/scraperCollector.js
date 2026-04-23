/**
 * Hacker News Scraper Collector.
 * Fetches top stories using the official Firebase API with native fetch.
 */
async function collect() {
  const SITE_NAME = "Hacker News";
  const TOP_STORIES_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
  const ITEM_URL_BASE = "https://hacker-news.firebaseio.com/v0/item/";

  try {
    const response = await fetch(TOP_STORIES_URL);
    if (!response.ok) throw new Error(`Failed to fetch top stories: ${response.statusText}`);
    
    const storyIds = await response.json();
    const top10Ids = storyIds.slice(0, 10);

    const storyPromises = top10Ids.map(async (id) => {
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
    console.error(`[scraperCollector] Error fetching from ${SITE_NAME}:`, error);
    return {
      site: SITE_NAME,
      items: [],
      error: error.message
    };
  }
}

module.exports = { collect };
