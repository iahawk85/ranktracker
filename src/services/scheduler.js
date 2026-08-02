const cron = require('node-cron');
const { checkKeywordById } = require('./rankChecker');
const { getDb } = require('../db');

const DEFAULT_SCHEDULE = '0 0 * * *'; // Daily at midnight

let task = null;

/**
 * Get the last batch-check timestamp for a user.
 * @param {object} db - database connection
 * @param {number} userId
 * @returns {string|null} ISO timestamp or null if never checked
 */
function getLastBatchCheck(db, userId) {
  const row = db.prepare('SELECT last_batch_check FROM users WHERE id = ?').get(userId);
  return row ? row.last_batch_check : null;
}

/**
 * Update the batch-check timestamp for a user.
 * @param {object} db
 * @param {number} userId
 */
function touchLastBatchCheck(db, userId) {
  db.prepare("UPDATE users SET last_batch_check = datetime('now') WHERE id = ?").run(userId);
}

/**
 * Determine if a free-tier user is due for a weekly check.
 * Free users get checked every 7 days.
 * @param {object} db
 * @param {number} userId
 * @returns {boolean}
 */
function isFreeUserDue(db, userId) {
  const last = getLastBatchCheck(db, userId);
  if (!last) return true; // never checked
  const hoursSince = (Date.now() - new Date(last + 'Z').getTime()) / (1000 * 60 * 60);
  return hoursSince >= 168; // 7 days
}

/**
 * Start the daily rank-check scheduler.
 * Pro users get checked daily. Free users get checked weekly.
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
      const db = getDb();
      const users = db.prepare('SELECT id, tier FROM users').all();
      let totalKeywords = 0;
      let totalSuccesses = 0;
      let totalFailures = 0;

      for (const user of users) {
        // Free users: only check if at least 7 days since last batch check
        if (user.tier === 'free') {
          if (!isFreeUserDue(db, user.id)) {
            continue; // skip this user this run
          }
        }

        // Find all keywords belonging to this user's projects
        const keywords = db.prepare(`
          SELECT k.id FROM keywords k
          JOIN projects p ON p.id = k.project_id
          WHERE p.user_id = ?
        `).all(user.id);

        let successes = 0;
        let failures = 0;

        for (const kw of keywords) {
          try {
            const result = checkKeywordById(kw.id);
            if (result) {
              successes++;
            } else {
              failures++;
            }
          } catch (err) {
            console.error(`[scheduler] Rank check failed for keyword ${kw.id}:`, err.message);
            failures++;
          }
        }

        totalKeywords += keywords.length;
        totalSuccesses += successes;
        totalFailures += failures;

        // Update last_batch_check for free users that were checked
        if (keywords.length > 0) {
          touchLastBatchCheck(db, user.id);
        }

        console.log(
          `[scheduler] User ${user.id} (${user.tier}): ${successes}/${keywords.length} checked, ${failures} failures`
        );
      }

      console.log(
        `[scheduler] Completed: ${totalSuccesses}/${totalKeywords} keywords checked, ${totalFailures} failures`
      );

      // After rank checks, run alert detection per project (all projects)
      const projects = db.prepare('SELECT id FROM projects').all();
      let totalAlerts = 0;
      for (const p of projects) {
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