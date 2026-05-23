const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

const CHECKLIST_FILE = path.join(__dirname, '../../data/homeChecklist.yaml');

/**
 * Home Health Weekly Maintenance Collector.
 * Resolves the active week's home care checklist task.
 * 
 * @param {Object} config - The source configuration from sources.yaml
 * @returns {Promise<Object>}
 */
async function collect(config) {
  const SITE_NAME = config.name || "Home Health";

  try {
    const fileContent = await fs.readFile(CHECKLIST_FILE, 'utf8');
    const { tasks } = yaml.load(fileContent);

    if (!tasks || tasks.length === 0) {
      throw new Error("No tasks found in checklist configuration.");
    }

    const now = new Date();
    // Project current system date onto the 2026 calendar baseline
    const currentYearDate = new Date(2026, now.getMonth(), now.getDate(), 0, 0, 0, 0);

    // Find the first week ending on or after the projected date
    const activeTask = tasks.find(t => {
      const taskDate = new Date(t.lastDayOfWeek);
      return taskDate >= currentYearDate;
    });

    const selected = activeTask || tasks[tasks.length - 1];

    return {
      site: SITE_NAME,
      current: {
        week: selected.week,
        name: selected.name,
        taskDescription: selected.taskDescription,
        targetDate: selected.lastDayOfWeek,
        mindsetHoliday: selected.mindsetHoliday
      }
    };

  } catch (error) {
    console.error(`[homeHealthCollector] Error:`, error.message);
    return {
      site: SITE_NAME,
      error: error.message
    };
  }
}

module.exports = { collect };
