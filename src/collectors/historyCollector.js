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

    // 1. Keyword Filtering for Interests
    const interests = config.interests || [
      'aerospace', 'space', 'orbit', 'nasa', 'rocket', 'satellite', 'shuttle', 'apollo', 'voyager', 'hubble', 'launch', 'aviation', 'aircraft', 'pilot',
      'engineering', 'bridge', 'tunnel', 'dam', 'engine', 'patent', 'invention', 'scientific',
      'software', 'computer', 'programming', 'algorithm', 'linux', 'unix', 'microsoft', 'apple', 'google', 'amazon', 'semiconductor', 'microprocessor', 'chip', 'transistor', 'mainframe',
      'photography', 'camera', 'daguerreotype', 'kodak', 'leica', 'film', 'photograph', 'lens',
      'seattle', 'portland', 'oregon', 'washington', 'cascadia', 'puget', 'vancouver', 'boeing',
      'physics', 'electron', 'supernova', 'astronomy', 'telescope', 'web', 'internet', 'technology'
    ];
    const interestRegex = new RegExp(`\\b(${interests.join('|')})\\b`, 'i');

    let filteredEvents = data.events.filter(event => interestRegex.test(event.text));

    // Fallback: If no interest matches, take the first 3 globally significant events
    if (filteredEvents.length === 0) {
      filteredEvents = data.events.slice(0, 3);
    }

    // Return a consolidated raw string of events for the LLM to process
    const rawEvents = filteredEvents.map(event => {
      return `[Year ${event.year}] ${event.text}`;
    }).join("\n");

    // 2. Dynamic Source URL Generation
    const monthName = now.toLocaleString('en-US', { month: 'long' });
    const sourceUrl = `https://en.wikipedia.org/wiki/${monthName}_${now.getDate()}`;

    return {
      site: SITE_NAME,
      rawData: rawEvents,
      source_url: sourceUrl,
      source_name: "wikipedia.org"
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
