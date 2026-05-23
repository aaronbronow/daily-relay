const { getSeasonForDate } = require('../utils/seasonCalculator');

/**
 * Seasonal Mindset Collector.
 * Computes active season, remaining days, progress percent and returns metadata.
 * 
 * @param {Object} config - The source configuration from sources.yaml
 * @returns {Promise<Object>}
 */
async function collect(config) {
  const SITE_NAME = config.name || "Seasonal Mindset";

  try {
    const now = new Date();
    const currentSeason = getSeasonForDate(now);

    return {
      site: SITE_NAME,
      current: currentSeason
    };
  } catch (error) {
    console.error(`[seasonCollector] Error:`, error.message);
    return {
      site: SITE_NAME,
      error: error.message
    };
  }
}

module.exports = { collect };
