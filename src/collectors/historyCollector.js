/**
 * Wikimedia History Collector.
 * Fetches "On This Day" events for the current date.
 * 
 * @param {Object} config - The source configuration from sources.yaml
 */
async function collect(config) {
  const SITE_NAME = config.name || "Wikimedia History";
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  
  const url = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${month}/${day}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Api-User-Agent': 'DailyRelayBriefing (https://github.com/aaronbronow/daily-relay)'
      }
    });

    if (!response.ok) {
      throw new Error(`Wikimedia API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.events || data.events.length === 0) {
      return { site: SITE_NAME, rawData: "No historical events found for today." };
    }

    // Return a consolidated raw string of events for the LLM to process
    const rawEvents = data.events.map(event => {
      return `[Year ${event.year}] ${event.text}`;
    }).join("\n");

    return {
      site: SITE_NAME,
      rawData: rawEvents
    };
  } catch (error) {
    console.error(`[historyCollector] Error:`, error.message);
    return {
      site: SITE_NAME,
      rawData: "",
      error: error.message
    };
  }
}

module.exports = { collect };
