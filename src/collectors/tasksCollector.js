const { google } = require('googleapis');

/**
 * Google Tasks Collector.
 * Fetches pending tasks from the primary list that are due this week or past due.
 * 
 * @param {Object} config - The source configuration from sources.yaml
 */
async function collect(config) {
  const SITE_NAME = config.name || "Google Tasks";
  
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.warn(`[tasksCollector] Missing credentials for ${SITE_NAME}`);
    return { site: SITE_NAME, rawData: "", error: "Missing credentials" };
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

  const tasksService = google.tasks({ version: 'v1', auth: oauth2Client });

  try {
    const res = await tasksService.tasks.list({
      tasklist: '@default',
      showCompleted: false,
      showHidden: false
    });

    const tasks = res.data.items;
    if (!tasks || tasks.length === 0) {
      return { site: SITE_NAME, rawData: "No tasks found." };
    }

    const now = new Date();
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(now.getDate() + 7);

    // Normalize dates to start of day for comparison
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const relevantTasks = tasks.filter(task => {
      if (!task.due) return true; // Keep tasks with no due date as 'upcoming' or 'pending'
      
      const dueDate = new Date(task.due);
      // Keep if past due or due within 7 days
      return dueDate < oneWeekFromNow;
    });

    if (relevantTasks.length === 0) {
      return { site: SITE_NAME, rawData: "No urgent tasks this week." };
    }

    // Format tasks for the LLM
    const rawData = relevantTasks.map(task => {
      let status = "Upcoming";
      if (task.due) {
        const dueDate = new Date(task.due);
        if (dueDate < startOfToday) status = "PAST DUE";
      } else {
        status = "No Due Date";
      }
      return `[Status: ${status}] ${task.title}${task.due ? ` (Due: ${task.due.split('T')[0]})` : ''}`;
    }).join("\n");

    return {
      site: SITE_NAME,
      rawData: rawData
    };

  } catch (error) {
    let msg = error.message;
    if (msg.includes('invalid_grant')) {
      msg = 'invalid_grant (Refresh token expired or revoked. Run node src/utils/getGoogleToken.js to re-authorize.)';
    }
    console.error(`[tasksCollector] Error:`, msg);
    return {
      site: SITE_NAME,
      rawData: "",
      error: msg
    };
  }
}

module.exports = { collect };
