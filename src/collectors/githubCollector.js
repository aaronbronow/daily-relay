/**
 * GitHub Release Collector.
 * Fetches recent releases for a list of repositories.
 * 
 * @param {Object} config - The source configuration from sources.yaml
 */
async function collect(config) {
  const SITE_NAME = config.name || "GitHub Releases";
  const GITHUB_TOKEN = process.env[config.token_env];
  const repos = config.repos || [];

  if (!GITHUB_TOKEN) {
    console.warn(`[githubCollector] Missing GITHUB_TOKEN for ${SITE_NAME}`);
  }

  // Calculate start of current calendar week (Monday)
  const now = new Date();
  const day = now.getDay(); // 0 is Sunday, 1 is Monday
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);

  const results = [];

  for (const repo of repos) {
    try {
      console.log(`[githubCollector] Checking ${repo}...`);
      const response = await fetch(`https://api.github.com/repos/${repo}/releases`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'DailyRelayBriefing',
          ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[githubCollector] Repo not found: ${repo}`);
          continue;
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const releases = await response.json();
      
      for (const release of releases) {
        const publishedDate = new Date(release.published_at);
        if (publishedDate >= monday) {
          results.push({
            site: repo,
            version: release.tag_name,
            title: `${repo} ${release.tag_name}`,
            description: release.body || '',
            url: release.html_url,
            timestamp: release.published_at
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
