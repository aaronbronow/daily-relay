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

    // Find the index of the first week ending on or after the projected date
    const activeIndex = tasks.findIndex(t => {
      const taskDate = new Date(t.lastDayOfWeek);
      return taskDate >= currentYearDate;
    });

    const selectedIndex = activeIndex !== -1 ? activeIndex : tasks.length - 1;
    const selected = tasks[selectedIndex];

    // Resolve next week's task (wrap around at the end of the year)
    const nextIndex = (selectedIndex + 1) % tasks.length;
    const nextTask = tasks[nextIndex];

    // Calculate week progress: day-of-week from Monday (0) to Sunday (6)
    const dow = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
    const daysSinceMonday = (dow + 6) % 7; // Mon=0 ... Sun=6
    const weekDaysRemaining = 6 - daysSinceMonday;
    const weekProgressPercent = Math.round((daysSinceMonday / 6) * 100);

    return {
      site: SITE_NAME,
      current: {
        week: selected.week,
        name: selected.name,
        taskDescription: selected.taskDescription,
        targetDate: selected.lastDayOfWeek,
        mindsetHoliday: selected.mindsetHoliday,
        weekProgressPercent,
        weekDaysRemaining
      },
      next: {
        week: nextTask.week,
        name: nextTask.name,
        taskDescription: nextTask.taskDescription,
        targetDate: nextTask.lastDayOfWeek,
        mindsetHoliday: nextTask.mindsetHoliday
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
