const cron = require('node-cron');
const { checkAllKeywords } = require('./rankChecker');
const { getDb } = require('../db');
const { checkAndStoreAlerts } = require('../models/alerts');

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

      // After rank checks, run alert detection per project
      const db = getDb();
      const projects = db.prepare('SELECT id FROM projects').all();
      let totalAlerts = 0;
      for (const p of projects) {
        // Use the project's own user_id via the first available keyword's user
        // For system-level alert checking we bypass per-user checks
        db.prepare(`
          INSERT OR IGNORE INTO alerts (keyword_id, project_id, previous_pos, current_pos, change_amount, direction, message, triggered_at)
          SELECT
            rc1.keyword_id,
            k.project_id,
            rc2.position AS previous_pos,
            rc1.position AS current_pos,
            ABS(rc1.position - rc2.position) AS change_amount,
            CASE WHEN rc1.position < rc2.position THEN 'up' ELSE 'down' END AS direction,
            CASE WHEN rc1.position < rc2.position
              THEN '"' || k.keyword || '" improved by ' || (rc2.position - rc1.position) || ' positions (' || rc2.position || ' → ' || rc1.position || ')'
              ELSE '"' || k.keyword || '" declined by ' || (rc1.position - rc2.position) || ' positions (' || rc2.position || ' → ' || rc1.position || ')'
            END AS message,
            datetime('now') AS triggered_at
          FROM rank_checks rc1
          JOIN keywords k ON k.id = rc1.keyword_id
          JOIN rank_checks rc2 ON rc2.keyword_id = rc1.keyword_id
            AND rc2.id = (
              SELECT MAX(rc3.id) FROM rank_checks rc3
              WHERE rc3.keyword_id = rc1.keyword_id AND rc3.id < rc1.id
            )
          WHERE k.project_id = ? AND rc1.position IS NOT NULL AND rc2.position IS NOT NULL
            AND ABS(rc1.position - rc2.position) > 5
            AND NOT EXISTS (
              SELECT 1 FROM alerts a2
              WHERE a2.keyword_id = rc1.keyword_id
                AND a2.triggered_at >= datetime('now', '-1 hour')
            )
        `).run(p.id);
        totalAlerts += db.prepare('SELECT changes() AS c').get().c;
      }
      console.log(`[scheduler] Alert check: ${totalAlerts} new alert(s)`);
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