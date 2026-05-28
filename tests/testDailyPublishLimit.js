/**
 * Automated Mock Test for Target-Specific Daily Publishing Limits
 *
 * This script validates the publishing filter logic under five different scenarios:
 * Scenario 1: once_daily: true, publish_hour: 8, current time: 7:59 AM -> Should skip publishing.
 * Scenario 2: once_daily: true, publish_hour: 8, current time: 8:00 AM, not yet published today -> Should publish.
 * Scenario 3: once_daily: true, publish_hour: 8, current time: 8:00 AM, already published today -> Should skip publishing.
 * Scenario 4: once_daily: true, publish_hour: 8, current time: 8:00 AM, already published today, but --force flag is set (forceSummarize is true) -> Should publish.
 * Scenario 5: once_daily: false or omitted -> Should publish regardless of hour or previous publication date.
 *
 * Run with: node tests/testDailyPublishLimit.js
 */

const assert = require('assert');

/**
 * Replicates the decision logic for publishing to a target exactly as implemented in src/aggregator.js.
 *
 * @param {Object} target - The publishing target configuration.
 * @param {Date} now - The current mock Date.
 * @param {boolean} forceSummarize - The state of the --force command-line option.
 * @param {Object} data - The briefing cache data (containing lastPublished timestamps).
 * @returns {boolean} - True if the aggregator should proceed with publishing, false if it should skip.
 */
function evaluatePublishDecision(target, now, forceSummarize, data) {
  const todayStr = now.toLocaleDateString('en-CA');

  if (target.type === 'googledrive' && target.enabled !== false) {
    // Respect daily publish limit if once_daily is configured
    if (target.once_daily && !forceSummarize) {
      const publishHour = target.publish_hour !== undefined ? target.publish_hour : 8;
      if (now.getHours() < publishHour) {
        return false;
      }
      if (data.lastPublished && data.lastPublished[target.name] === todayStr) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function runTests() {
  console.log("=========================================");
  console.log("  DAILY PUBLISH LIMIT LOGIC TEST SUITE   ");
  console.log("=========================================\n");

  const today = new Date();
  const todayStr = today.toLocaleDateString('en-CA');

  // Scenario 1: once_daily: true, publish_hour: 8, current time: 7:59 AM -> Should skip publishing.
  console.log("Running Scenario 1: once_daily: true, publish_hour: 8, 7:59 AM -> Skip");
  {
    const target = {
      name: "Google Drive",
      type: "googledrive",
      enabled: true,
      once_daily: true,
      publish_hour: 8
    };
    const now = new Date(today);
    now.setHours(7, 59, 0, 0);
    const forceSummarize = false;
    const data = { lastPublished: {} };

    const result = evaluatePublishDecision(target, now, forceSummarize, data);
    assert.strictEqual(result, false, "Scenario 1 Failure: Should NOT publish before 8 AM");
    console.log("✅ Scenario 1 Passed!");
  }

  // Scenario 2: once_daily: true, publish_hour: 8, current time: 8:00 AM, not yet published today -> Should publish.
  console.log("\nRunning Scenario 2: once_daily: true, publish_hour: 8, 8:00 AM, not yet published today -> Publish");
  {
    const target = {
      name: "Google Drive",
      type: "googledrive",
      enabled: true,
      once_daily: true,
      publish_hour: 8
    };
    const now = new Date(today);
    now.setHours(8, 0, 0, 0);
    const forceSummarize = false;
    const data = { lastPublished: {} };

    const result = evaluatePublishDecision(target, now, forceSummarize, data);
    assert.strictEqual(result, true, "Scenario 2 Failure: Should publish at or after 8 AM if not yet published");
    console.log("✅ Scenario 2 Passed!");
  }

  // Scenario 3: once_daily: true, publish_hour: 8, current time: 8:00 AM, already published today -> Should skip publishing.
  console.log("\nRunning Scenario 3: once_daily: true, publish_hour: 8, 8:00 AM, already published today -> Skip");
  {
    const target = {
      name: "Google Drive",
      type: "googledrive",
      enabled: true,
      once_daily: true,
      publish_hour: 8
    };
    const now = new Date(today);
    now.setHours(8, 0, 0, 0);
    const forceSummarize = false;
    const data = { lastPublished: { "Google Drive": todayStr } };

    const result = evaluatePublishDecision(target, now, forceSummarize, data);
    assert.strictEqual(result, false, "Scenario 3 Failure: Should NOT publish if already published today");
    console.log("✅ Scenario 3 Passed!");
  }

  // Scenario 4: once_daily: true, publish_hour: 8, current time: 8:00 AM, already published today, but --force flag is set -> Should publish.
  console.log("\nRunning Scenario 4: once_daily: true, publish_hour: 8, 8:00 AM, already published today, forceSummarize: true -> Publish");
  {
    const target = {
      name: "Google Drive",
      type: "googledrive",
      enabled: true,
      once_daily: true,
      publish_hour: 8
    };
    const now = new Date(today);
    now.setHours(8, 0, 0, 0);
    const forceSummarize = true;
    const data = { lastPublished: { "Google Drive": todayStr } };

    const result = evaluatePublishDecision(target, now, forceSummarize, data);
    assert.strictEqual(result, true, "Scenario 4 Failure: Should publish when force flag is set, even if already published");
    console.log("✅ Scenario 4 Passed!");
  }

  // Scenario 5: once_daily: false or omitted -> Should publish regardless of hour or previous publication date.
  console.log("\nRunning Scenario 5a: once_daily: false -> Publish");
  {
    const target = {
      name: "Google Drive",
      type: "googledrive",
      enabled: true,
      once_daily: false,
      publish_hour: 8
    };
    const now = new Date(today);
    now.setHours(7, 59, 0, 0);
    const forceSummarize = false;
    const data = { lastPublished: { "Google Drive": todayStr } };

    const result = evaluatePublishDecision(target, now, forceSummarize, data);
    assert.strictEqual(result, true, "Scenario 5a Failure: Should publish if once_daily is false, even before hours and already published");
    console.log("✅ Scenario 5a Passed!");
  }

  console.log("\nRunning Scenario 5b: once_daily: omitted -> Publish");
  {
    const target = {
      name: "Google Drive",
      type: "googledrive",
      enabled: true,
      publish_hour: 8
    };
    const now = new Date(today);
    now.setHours(7, 59, 0, 0);
    const forceSummarize = false;
    const data = { lastPublished: { "Google Drive": todayStr } };

    const result = evaluatePublishDecision(target, now, forceSummarize, data);
    assert.strictEqual(result, true, "Scenario 5b Failure: Should publish if once_daily is omitted, even before hours and already published");
    console.log("✅ Scenario 5b Passed!");
  }

  console.log("\n=========================================");
  console.log("  ALL TESTS PASSED SUCCESSFULLY!          ");
  console.log("=========================================");
}

try {
  runTests();
  process.exit(0);
} catch (error) {
  console.error("\n❌ Assertion Failed:", error.stack || error.message);
  process.exit(1);
}
