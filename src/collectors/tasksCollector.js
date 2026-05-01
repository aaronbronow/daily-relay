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
    // 1. Fetch all task lists
    const listRes = await tasksService.tasklists.list();
    const taskLists = listRes.data.items || [];

    if (taskLists.length === 0) {
      return { site: SITE_NAME, rawData: "No task lists found." };
    }

    // 2. Fetch tasks from all lists
    let allTasks = [];
    for (const list of taskLists) {
      // Fetch both pending and completed tasks
      const res = await tasksService.tasks.list({
        tasklist: list.id,
        showCompleted: true,
        showHidden: true
      });
      if (res.data.items) {
        // Add the list title to each task
        const tasksWithListInfo = res.data.items.map(t => ({ ...t, listTitle: list.title }));
        allTasks = allTasks.concat(tasksWithListInfo);
      }
    }

    if (allTasks.length === 0) {
      return { site: SITE_NAME, rawData: "No tasks found." };
    }

    const tasks = allTasks;
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Use local YYYY-MM-DD for comparison of all-day tasks
    const todayStr = now.toLocaleDateString('en-CA'); 

    const relevantTasks = tasks.filter(task => {
      // If completed, only keep if completed today
      if (task.status === 'completed') {
        if (!task.completed) return false;
        const completedDate = new Date(task.completed).toLocaleDateString('en-CA');
        return completedDate === todayStr;
      }

      if (!task.due) return true;
      
      const isAllDay = task.due.endsWith('T00:00:00.000Z');
      if (isAllDay) {
        const taskDate = task.due.split('T')[0];
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
        return taskDate <= sevenDaysFromNow;
      }

      const dueDate = new Date(task.due);
      return dueDate < oneWeekFromNow;
    });

    if (relevantTasks.length === 0) {
      return { site: SITE_NAME, rawData: "No urgent tasks this week." };
    }

    // Format tasks for the LLM
    const currentDateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    let rawData = `Current Date: ${currentDateStr}\nCurrent Time: ${currentTimeStr}\n\n`;

    rawData += relevantTasks.map(task => {
      let status = "Upcoming";
      let timingInfo = "";
      
      if (task.due) {
        const isAllDay = task.due.endsWith('T00:00:00.000Z');
        
        if (isAllDay) {
          const taskDate = task.due.split('T')[0];
          if (taskDate < todayStr) status = "PAST DUE";
          else if (taskDate === todayStr) status = "TODAY";
          else status = "Upcoming";
          timingInfo = `(Due: ${taskDate}, All Day)`;
        } else {
          const dueDate = new Date(task.due);
          if (dueDate < now) status = "PAST DUE";
          else if (dueDate.toLocaleDateString('en-CA') === todayStr) status = "TODAY";
          else status = "Upcoming";
          
          const timePart = dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
          timingInfo = `(Due: ${task.due.split('T')[0]} at ${timePart})`;
        }
      } else {
        status = "No Due Date";
      }
      return `[List: ${task.listTitle}] [Status: ${status}] ${task.title} ${timingInfo}`;
    }).join("\n");

    return {
      site: SITE_NAME,
      rawData: rawData,
      _tasks: relevantTasks
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
