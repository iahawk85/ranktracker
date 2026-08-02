const { getDb } = require('../db');

/**
 * Compare each keyword's latest two rank checks for a project.
 * If the position changed by more than 5 positions in either
 * direction, store a new alert (unless one was already logged
 * for the same keyword within the last hour to prevent spam).
 *
 * @param {number} projectId
 * @param {number} userId  — used only for ownership verification
 * @returns {number} number of new alerts created
 */
function checkAndStoreAlerts(projectId, userId) {
  const db = getDb();

  // Verify ownership
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
  if (!project) return 0;

  // Get latest two rank checks per keyword in this project
  const keywords = db.prepare(`
    SELECT k.id, k.keyword, k.search_engine
    FROM keywords k
    WHERE k.project_id = ?
  `).all(projectId);

  let newAlerts = 0;

  for (const kw of keywords) {
    const checks = db.prepare(`
      SELECT id, position, checked_at
      FROM rank_checks
      WHERE keyword_id = ?
      ORDER BY checked_at DESC
      LIMIT 2
    `).all(kw.id);

    if (checks.length < 2) continue;
    if (checks[0].position === null || checks[1].position === null) continue;

    const current = checks[0].position;
    const previous = checks[1].position;
    const change = current - previous; // positive = rank got higher (worse), negative = rank dropped (improved)

    if (Math.abs(change) <= 5) continue;

    // Deduplicate: don't create another alert for the same keyword if one
    // was triggered in the last hour
    const recentAlert = db.prepare(`
      SELECT id FROM alerts
      WHERE keyword_id = ? AND triggered_at >= datetime('now', '-1 hour')
      LIMIT 1
    `).get(kw.id);
    if (recentAlert) continue;

    const direction = change > 0 ? 'down' : 'up';
    const message = direction === 'up'
      ? `"${kw.keyword}" improved by ${Math.abs(change)} positions (${previous} → ${current})`
      : `"${kw.keyword}" declined by ${change} positions (${previous} → ${current})`;

    db.prepare(`
      INSERT INTO alerts (keyword_id, project_id, previous_pos, current_pos, change_amount, direction, message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(kw.id, projectId, previous, current, Math.abs(change), direction, message);

    newAlerts++;
  }

  return newAlerts;
}

/**
 * List alerts for a project, most recent first.
 *
 * @param {number} projectId
 * @param {number} userId
 * @param {number} [limit=50]
 * @returns {Array}
 */
function listAlerts(projectId, userId, limit) {
  const db = getDb();
  if (limit === undefined) limit = 50;

  return db.prepare(`
    SELECT a.*, k.keyword, k.search_engine
    FROM alerts a
    JOIN keywords k ON k.id = a.keyword_id
    JOIN projects p ON p.id = a.project_id
    WHERE a.project_id = ? AND p.user_id = ?
    ORDER BY a.triggered_at DESC
    LIMIT ?
  `).all(projectId, userId, limit);
}

/**
 * Mark an alert as acknowledged.
 *
 * @param {number} alertId
 * @param {number} projectId
 * @param {number} userId
 * @returns {boolean}
 */
function acknowledgeAlert(alertId, projectId, userId) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE alerts SET acknowledged = 1
    WHERE id = ? AND project_id = ?
    AND project_id IN (SELECT id FROM projects WHERE id = ? AND user_id = ?)
  `).run(alertId, projectId, projectId, userId);
  return result.changes > 0;
}

/**
 * Unacknowledged alert count for a project (used for badge display).
 *
 * @param {number} projectId
 * @param {number} userId
 * @returns {number}
 */
function unacknowledgedCount(projectId, userId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM alerts a
    JOIN projects p ON p.id = a.project_id
    WHERE a.project_id = ? AND p.user_id = ? AND a.acknowledged = 0
  `).get(projectId, userId);
  return row ? row.cnt : 0;
}

module.exports = { checkAndStoreAlerts, listAlerts, acknowledgeAlert, unacknowledgedCount };