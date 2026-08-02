const { getDb } = require('../db');

/**
 * Generate a deterministic-ish mock rank for a keyword.
 * Uses a simple hash of the keyword text to seed a base rank,
 * then adds random noise so each call returns a slightly different value.
 *
 * Most results fall in the 1–50 range (realistic for tracked keywords),
 * with occasional outliers up to 100.
 *
 * @param {string} keyword
 * @param {string} searchEngine
 * @returns {number} mock rank position (1-100)
 */
function mockCheckRank(keyword, searchEngine) {
  // Simple hash for seed
  let hash = 0;
  for (let i = 0; i < keyword.length; i++) {
    hash = ((hash << 5) - hash) + keyword.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  // Normalise seed to a base rank (1-50)
  const baseRank = (Math.abs(hash) % 50) + 1;

  // Add noise: ±15 positions, clamped to 1-100
  const noise = Math.floor(Math.random() * 31) - 15; // -15 .. +15
  return Math.max(1, Math.min(100, baseRank + noise));
}

/**
 * Run a rank check for a single keyword, identified by its id.
 * Verifies project ownership via userId.
 *
 * @param {number} keywordId
 * @param {number} projectId
 * @param {number} userId
 * @returns {object|null} the new rank_check row, or null if keyword not found
 */
function checkKeyword(keywordId, projectId, userId) {
  const db = getDb();

  // Look up keyword with ownership verification
  const keyword = db.prepare(`
    SELECT k.id, k.keyword, k.search_engine
    FROM keywords k
    JOIN projects p ON p.id = k.project_id
    WHERE k.id = ? AND k.project_id = ? AND p.user_id = ?
  `).get(keywordId, projectId, userId);

  if (!keyword) return null;

  const position = mockCheckRank(keyword.keyword, keyword.search_engine);
  const stmt = db.prepare(
    'INSERT INTO rank_checks (keyword_id, position, search_engine) VALUES (?, ?, ?)'
  );
  const result = stmt.run(keywordId, position, keyword.search_engine);

  return {
    id: result.lastInsertRowid,
    keyword_id: keywordId,
    position,
    checked_at: new Date().toISOString(),
    search_engine: keyword.search_engine,
  };
}

/**
 * Run a rank check for a single keyword without ownership verification
 * (used by the scheduler — system-level, not per-user).
 *
 * @param {number} keywordId
 * @returns {object|null} the new rank_check row, or null if keyword not found
 */
function checkKeywordById(keywordId) {
  const db = getDb();

  const keyword = db.prepare('SELECT id, keyword, search_engine FROM keywords WHERE id = ?').get(keywordId);
  if (!keyword) return null;

  const position = mockCheckRank(keyword.keyword, keyword.search_engine);
  const stmt = db.prepare(
    'INSERT INTO rank_checks (keyword_id, position, search_engine) VALUES (?, ?, ?)'
  );
  const result = stmt.run(keywordId, position, keyword.search_engine);

  return {
    id: result.lastInsertRowid,
    keyword_id: keywordId,
    position,
    checked_at: new Date().toISOString(),
    search_engine: keyword.search_engine,
  };
}

/**
 * Run rank checks for ALL keywords across ALL users/projects.
 * Used by the daily cron scheduler.
 *
 * @returns {{ total: number, successes: number, failures: number, checks: Array }}
 */
function checkAllKeywords() {
  const db = getDb();
  const keywords = db.prepare('SELECT id FROM keywords').all();

  const successes = [];
  const failures = [];

  for (const kw of keywords) {
    try {
      const result = checkKeywordById(kw.id);
      if (result) {
        successes.push(result);
      } else {
        failures.push(kw.id);
      }
    } catch (err) {
      console.error(`Rank check failed for keyword ${kw.id}:`, err.message);
      failures.push(kw.id);
    }
  }

  return {
    total: keywords.length,
    successes: successes.length,
    failures: failures.length,
    checks: successes,
  };
}

module.exports = { mockCheckRank, checkKeyword, checkKeywordById, checkAllKeywords };