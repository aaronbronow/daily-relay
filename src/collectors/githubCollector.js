const Parser = require('rss-parser');
const parser = new Parser();

/**
 * GitHub Release Collector (RSS/Atom).
 * Fetches recent releases for a list of repositories via public feeds.
 * 
 * @param {Object} config - The source configuration from sources.yaml
 */
async function collect(config) {
  const SITE_NAME = config.name || "GitHub Releases";
  const repos = config.repos || [];

  // Calculate start of current calendar week (Monday)
  const now = new Date();
  const day = now.getDay(); // 0 is Sunday, 1 is Monday
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);

  const results = [];

  for (const repo of repos) {
    try {
      console.log(`[githubCollector] Checking ${repo} via RSS...`);
      const feed = await parser.parseURL(`https://github.com/${repo}/releases.atom`);
      
      for (const item of feed.items) {
        const publishedDate = new Date(item.isoDate || item.pubDate);
        if (publishedDate >= monday) {
          // Extracts tag from URL
          // URL is like https://github.com/oven-sh/bun/releases/tag/bun-v1.0.0
          const versionMatch = item.link.match(/\/tag\/(.+)$/);
          const version = versionMatch ? versionMatch[1] : item.title;

          // Clean up description (strip HTML tags and extra whitespace)
          let description = (item.contentSnippet || item.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          if (description.length > 1000) description = description.substring(0, 1000) + '...';

          results.push({
            site: repo,
            version: version,
            title: `${repo} ${version}`,
            description: description,
            url: item.link,
            timestamp: publishedDate.toISOString()
          });
        }
      }
    } catch (error) {
      console.error(`[githubCollector] Error fetching ${repo}:`, error.message);
    }
  }

  return {
    site: SITE_NAME,
    items: results
  };
}

module.exports = { collect };
