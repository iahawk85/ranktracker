const { getDb } = require('../db');

const SERPER_API_URL = 'https://google.serper.dev/search';

/**
 * Normalise a search-engine name to a Serper gl (country code) value.
 * Default to 'us' when none given or when the old 'google' default is used.
 *
 * @param {string} searchEngine
 * @returns {string} two-letter country code
 */
function countryCode(searchEngine) {
  if (!searchEngine || searchEngine === 'google') return 'us';
  return searchEngine.toLowerCase();
}

/**
 * Call the Serper API to get a keyword's rank for a specific domain.
 *
 * Requires SERPER_API_KEY env var.
 * POSTs { q: <keyword>, gl: <countryCode> } to
 * https://google.serper.dev/search, then scans the organic results
 * array for the first result whose `link` contains the target domain.
 *
 * @param {string} keyword  - The search query
 * @param {string} searchEngine - Search engine / country code
 * @param {string} domain   - The target domain to find in organic results
 * @returns {number|null} 1-indexed position, or null if domain not found
 */
async function serperCheckRank(keyword, searchEngine, domain) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error('SERPER_API_KEY environment variable is not set');
  }

  const gl = countryCode(searchEngine);

  const response = await fetch(SERPER_API_URL, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: keyword, gl }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Serper API error: ${response.status} ${response.statusText}${text ? ' — ' + text : ''}`
    );
  }

  const data = await response.json();
  const organic = data.organic || [];

  for (let i = 0; i < organic.length; i++) {
    const result = organic[i];
    if (result.link && result.link.includes(domain)) {
      return i + 1; // 1-indexed position
    }
  }

  return null; // Domain not found in top results
}

/**
 * Run a rank check for a single keyword, identified by its id.
 * Verifies project ownership via userId.
 * Calls the Serper API to get real rank data.
 *
 * @param {number} keywordId
 * @param {number} projectId
 * @param {number} userId
 * @returns {object|null} the new rank_check row, or null if keyword not found
 */
async function checkKeyword(keywordId, projectId, userId) {
  const db = getDb();

  // Look up keyword with ownership verification and the project domain
  const keyword = db.prepare(`
    SELECT k.id, k.keyword, k.search_engine, p.domain
    FROM keywords k
    JOIN projects p ON p.id = k.project_id
    WHERE k.id = ? AND k.project_id = ? AND p.user_id = ?
  `).get(keywordId, projectId, userId);

  if (!keyword) return null;

  const position = await serperCheckRank(keyword.keyword, keyword.search_engine, keyword.domain);
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
 * Calls the Serper API to get real rank data.
 *
 * @param {number} keywordId
 * @returns {object|null} the new rank_check row, or null if keyword not found
 */
async function checkKeywordById(keywordId) {
  const db = getDb();

  const keyword = db.prepare(`
    SELECT k.id, k.keyword, k.search_engine, p.domain
    FROM keywords k
    JOIN projects p ON p.id = k.project_id
    WHERE k.id = ?
  `).get(keywordId);

  if (!keyword) return null;

  const position = await serperCheckRank(keyword.keyword, keyword.search_engine, keyword.domain);
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
async function checkAllKeywords() {
  const db = getDb();
  const keywords = db.prepare('SELECT id FROM keywords').all();

  const successes = [];
  const failures = [];

  for (const kw of keywords) {
    try {
      const result = await checkKeywordById(kw.id);
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

module.exports = { serperCheckRank, checkKeyword, checkKeywordById, checkAllKeywords };