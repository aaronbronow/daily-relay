const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SEASONS_CONFIG_PATH = path.join(__dirname, '../../config/seasons.yaml');

/**
 * Implements getEasterSunday(year) using the Meeus/Jones/Butcher algorithm.
 * Returns a Date object representing Easter Sunday at midnight in the local timezone.
 * @param {number} year 
 * @returns {Date}
 */
function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Adds or subtracts days from a Date object using local calendar dates.
 * @param {Date} date 
 * @param {number} days 
 * @returns {Date}
 */
function addDaysLocal(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Formats a Date object as "Month Day" or "Month Day, Year"
 * @param {Date} date 
 * @param {boolean} includeYear 
 * @returns {string}
 */
function formatDate(date, includeYear = false) {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const month = monthNames[date.getMonth()];
  const day = date.getDate();
  if (includeYear) {
    return `${month} ${day}, ${date.getFullYear()}`;
  }
  return `${month} ${day}`;
}

/**
 * Calculates the exact start/end dates for each of the 8 seasons for any year, correctly factoring in leap years.
 * Returns an array of calculated season objects with Date boundaries.
 * @param {number} year 
 * @param {Array} configSeasons 
 * @returns {Array}
 */
function calculateSeasonsForYear(year, configSeasons) {
  const easter = getEasterSunday(year);
  const ashWednesday = addDaysLocal(easter, -46);
  const easterMonday = addDaysLocal(easter, 1);
  const dayBeforeAshWednesday = addDaysLocal(ashWednesday, -1);
  const dayAfterEasterMonday = addDaysLocal(easterMonday, 1);

  return configSeasons.map(s => {
    let startDate, endDate;

    if (s.type === 'fixed') {
      startDate = new Date(year, s.start_month - 1, s.start_day, 0, 0, 0, 0);
      endDate = new Date(year, s.end_month - 1, s.end_day, 23, 59, 59, 999);
    } else {
      // Dynamic seasons
      if (s.name === 'Pentacles') {
        startDate = new Date(year, 1, 1, 0, 0, 0, 0); // Feb 1
        endDate = new Date(dayBeforeAshWednesday.getFullYear(), dayBeforeAshWednesday.getMonth(), dayBeforeAshWednesday.getDate(), 23, 59, 59, 999);
      } else if (s.name.startsWith('Lent')) {
        startDate = new Date(ashWednesday.getFullYear(), ashWednesday.getMonth(), ashWednesday.getDate(), 0, 0, 0, 0);
        endDate = new Date(easterMonday.getFullYear(), easterMonday.getMonth(), easterMonday.getDate(), 23, 59, 59, 999);
      } else if (s.name === 'Wands') {
        startDate = new Date(dayAfterEasterMonday.getFullYear(), dayAfterEasterMonday.getMonth(), dayAfterEasterMonday.getDate(), 0, 0, 0, 0);
        endDate = new Date(year, 5, 9, 23, 59, 59, 999); // June 9
      }
    }

    return {
      ...s,
      startDate,
      endDate
    };
  });
}

/**
 * Returns the active season metadata object for any date.
 * Reads config/seasons.yaml, determines which season the date falls into,
 * calculates its progress percentage and remaining days, and formats start/end dates.
 * @param {Date|string} dateInput 
 * @returns {Object}
 */
function getSeasonForDate(dateInput) {
  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  const year = date.getFullYear();

  // Load configuration
  let config;
  try {
    const yamlContent = fs.readFileSync(SEASONS_CONFIG_PATH, 'utf8');
    config = yaml.load(yamlContent);
  } catch (err) {
    throw new Error(`Failed to load seasons config from ${SEASONS_CONFIG_PATH}: ${err.message}`);
  }

  if (!config || !config.seasons) {
    throw new Error("Invalid seasons configuration structure.");
  }

  const seasons = calculateSeasonsForYear(year, config.seasons);

  // Find which season contains the date
  const activeSeason = seasons.find(s => date >= s.startDate && date <= s.endDate);
  if (!activeSeason) {
    throw new Error(`No active season found for date: ${date.toISOString()}`);
  }

  const todayMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const startMidnight = new Date(activeSeason.startDate.getFullYear(), activeSeason.startDate.getMonth(), activeSeason.startDate.getDate());
  const endMidnight = new Date(activeSeason.endDate.getFullYear(), activeSeason.endDate.getMonth(), activeSeason.endDate.getDate());

  const elapsedDays = Math.round((todayMidnight.getTime() - startMidnight.getTime()) / (1000 * 60 * 60 * 24));
  const totalDays = Math.round((endMidnight.getTime() - startMidnight.getTime()) / (1000 * 60 * 60 * 24));
  
  const progressPercent = totalDays > 0 ? Math.round((elapsedDays / totalDays) * 100) : 100;
  const remainingDays = Math.max(0, totalDays - elapsedDays);

  return {
    name: activeSeason.name,
    focus: activeSeason.focus,
    color: activeSeason.color,
    archetype: activeSeason.archetype,
    startDateFormatted: formatDate(activeSeason.startDate, false),
    endDateFormatted: formatDate(activeSeason.endDate, true),
    progressPercent,
    remainingDays,
    totalDays
  };
}

module.exports = {
  getEasterSunday,
  getSeasonForDate
};
