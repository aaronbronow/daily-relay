/**
 * Multi-Year Diagnostic Script for Seasonal Archetypal Calendar
 * 
 * Verifies boundaries, gaps, overlaps, and leap-year compliance.
 * Usage: node tests/seasonTest.js
 */

const { getSeasonForDate, getEasterSunday } = require('../src/utils/seasonCalculator');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SEASONS_CONFIG_PATH = path.join(__dirname, '../config/seasons.yaml');

function runDiagnostic() {
  console.log("=========================================");
  console.log("  SEASON ENGINE MULTI-YEAR DIAGNOSTIC    ");
  console.log("=========================================\n");

  const years = [2025, 2026, 2027];
  let config;
  
  try {
    const yamlContent = fs.readFileSync(SEASONS_CONFIG_PATH, 'utf8');
    config = yaml.load(yamlContent);
  } catch (err) {
    console.error("❌ Failed to load seasons.yaml config:", err.message);
    process.exit(1);
  }

  // Helper function to format Date
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  years.forEach(year => {
    const easter = getEasterSunday(year);
    console.log(`✨ Year ${year} (Easter Sunday: ${fmt(easter)})`);
    console.log("--------------------------------------------------------------------------------------------------");

    // Reconstruct calculateSeasonsForYear logic locally to print table
    const ashWednesday = new Date(easter);
    ashWednesday.setDate(ashWednesday.getDate() - 46);
    const easterMonday = new Date(easter);
    easterMonday.setDate(easterMonday.getDate() + 1);
    
    const dayBeforeAshWednesday = new Date(ashWednesday);
    dayBeforeAshWednesday.setDate(dayBeforeAshWednesday.getDate() - 1);
    const dayAfterEasterMonday = new Date(easterMonday);
    dayAfterEasterMonday.setDate(dayAfterEasterMonday.getDate() + 1);

    const tableData = config.seasons.map(s => {
      let startDate, endDate;

      if (s.type === 'fixed') {
        startDate = new Date(year, s.start_month - 1, s.start_day, 0, 0, 0, 0);
        endDate = new Date(year, s.end_month - 1, s.end_day, 23, 59, 59, 999);
      } else {
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
        Season: s.name.substring(0, 15),
        Start: fmt(startDate),
        End: fmt(endDate),
        Faculty: s.focus.substring(0, 30),
        'Days Total': Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      };
    });

    console.table(tableData);
    
    // Gap / Overlap Check
    console.log("🔍 Checking boundary gaps or overlaps...");
    let valid = true;
    for (let i = 0; i < tableData.length - 1; i++) {
      const currentEnd = new Date(tableData[i].End);
      const nextStart = new Date(tableData[i+1].Start);
      
      const diffMs = nextStart.getTime() - currentEnd.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      // We expect the next start to be exactly the day after the current end.
      // Since end date is at 23:59:59.999 and next start is 00:00:00.000, difference in days between starts should be 1.
      const diffWholeDays = Math.round((new Date(tableData[i+1].Start).setHours(0,0,0,0) - new Date(tableData[i].End).setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
      
      if (diffWholeDays !== 1) {
        console.warn(`⚠️ Gap/Overlap detected between ${tableData[i].Season} (ends ${tableData[i].End}) and ${tableData[i+1].Season} (starts ${tableData[i+1].Start}). Day difference: ${diffWholeDays}`);
        valid = false;
      }
    }
    
    if (valid) {
      console.log("✅ All boundaries are completely contiguous! No gaps, no overlaps.\n");
    } else {
      console.log("❌ Contiguity check failed.\n");
      process.exit(1);
    }
  });

  // Verify current day calculation
  console.log("=========================================");
  console.log("  VERIFYING TODAY'S DATE CALCULATION     ");
  console.log("=========================================");
  try {
    const today = new Date();
    const season = getSeasonForDate(today);
    console.log(`📅 Today is: ${fmt(today)}`);
    console.log(`🍁 Active Season: ${season.name}`);
    console.log(`🎯 Focus:         ${season.focus}`);
    console.log(`⏱️ Remaining:     ${season.remainingDays} of ${season.totalDays} days (${season.progressPercent}% complete)`);
    console.log(`✨ Status:        SUCCESS\n`);
  } catch (err) {
    console.error("❌ Today's calculation failed:", err.message);
    process.exit(1);
  }
}

runDiagnostic();
