const cron = require('node-cron');
const { checkAllKeywords } = require('./rankChecker');

const DEFAULT_SCHEDULE = '0 0 * * *'; // Daily at midnight

let task = null;

/**
 * Start the daily rank-check scheduler.
 * Optionally pass a cron expression (default: daily at midnight).
 *
 * @param {string} [cronExpression='0 0 * * *']
 */
function start(cronExpression) {
  if (task) {
    console.warn('[scheduler] Already running. Stop first to restart.');
    return;
  }

  const schedule = cronExpression || DEFAULT_SCHEDULE;
  console.log(`[scheduler] Rank checks scheduled: "${schedule}"`);

  task = cron.schedule(schedule, async () => {
    console.log(`[scheduler] Starting daily rank check at ${new Date().toISOString()}`);
    try {
      const result = checkAllKeywords();
      console.log(
        `[scheduler] Completed: ${result.successes}/${result.total} keywords checked, ${result.failures} failures`
      );
    } catch (err) {
      console.error('[scheduler] Rank check job failed:', err.message);
    }
  });
}

/**
 * Stop the daily rank-check scheduler.
 */
function stop() {
  if (task) {
    task.stop();
    task = null;
    console.log('[scheduler] Rank check scheduler stopped.');
  }
}

module.exports = { start, stop };