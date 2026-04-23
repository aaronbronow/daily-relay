/**
 * Mock Collector for Hello World phase.
 * Returns a simple JSON object with a timestamp.
 */
async function collect() {
  return {
    source: "Mock Collector",
    title: "Daily Briefing",
    content: "Hello World. This is your first briefing.",
    timestamp: new Date().toISOString(),
  };
}

module.exports = { collect };
