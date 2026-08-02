const { getDb } = require('../db');

function listKeywords(projectId, userId) {
  const db = getDb();
  return db.prepare(`
    SELECT k.*, rc.position AS last_rank
    FROM keywords k
    JOIN projects p ON p.id = k.project_id
    LEFT JOIN (
      SELECT keyword_id, position
      FROM rank_checks
      WHERE id IN (
        SELECT MAX(id) FROM rank_checks GROUP BY keyword_id
      )
    ) rc ON rc.keyword_id = k.id
    WHERE k.project_id = ? AND p.user_id = ?
    ORDER BY k.created_at DESC
  `).all(projectId, userId);
}

function getKeyword(id, projectId, userId) {
  const db = getDb();
  return db.prepare(`
    SELECT k.* FROM keywords k
    JOIN projects p ON p.id = k.project_id
    WHERE k.id = ? AND k.project_id = ? AND p.user_id = ?
  `).get(id, projectId, userId);
}

function getKeywordCount(userId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) AS cnt FROM keywords k
    JOIN projects p ON p.id = k.project_id
    WHERE p.user_id = ?
  `).get(userId);
  return row ? row.cnt : 0;
}

function createKeyword(projectId, userId, keyword, searchEngine) {
  const db = getDb();
  // Verify project ownership
  const project = db.prepare('SELECT id, user_id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
  if (!project) return null;
  // Check tier limits
  const user = db.prepare('SELECT tier FROM users WHERE id = ?').get(userId);
  const FREE_LIMIT = 10;
  if (user && user.tier === 'free') {
    const count = getKeywordCount(userId);
    if (count >= FREE_LIMIT) {
      const err = new Error(`Free tier limited to ${FREE_LIMIT} keywords. Upgrade to Pro for unlimited keywords.`);
      err.statusCode = 403;
      err.limitExceeded = true;
      throw err;
    }
  }
  const stmt = db.prepare('INSERT INTO keywords (project_id, keyword, search_engine) VALUES (?, ?, ?)');
  const result = stmt.run(projectId, keyword, searchEngine || 'google');
  return { id: result.lastInsertRowid, project_id: projectId, keyword, search_engine: searchEngine || 'google' };
}

function deleteKeyword(id, projectId, userId) {
  const db = getDb();
  const stmt = db.prepare(`
    DELETE FROM keywords WHERE id = ? AND project_id = ?
    AND project_id IN (SELECT id FROM projects WHERE id = ? AND user_id = ?)
  `);
  return stmt.run(id, projectId, projectId, userId);
}

// Rank checks
function listRankChecks(keywordId, projectId, userId) {
  const db = getDb();
  return db.prepare(`
    SELECT rc.* FROM rank_checks rc
    JOIN keywords k ON k.id = rc.keyword_id
    JOIN projects p ON p.id = k.project_id
    WHERE rc.keyword_id = ? AND k.project_id = ? AND p.user_id = ?
    ORDER BY rc.checked_at DESC
  `).all(keywordId, projectId, userId);
}

function createRankCheck(keywordId, projectId, userId, position, searchEngine) {
  const db = getDb();
  // Verify access: keyword belongs to project, project belongs to user
  const row = db.prepare(`
    SELECT 1 FROM keywords k
    JOIN projects p ON p.id = k.project_id
    WHERE k.id = ? AND k.project_id = ? AND p.user_id = ?
  `).get(keywordId, projectId, userId);
  if (!row) return null;
  const stmt = db.prepare('INSERT INTO rank_checks (keyword_id, position, search_engine) VALUES (?, ?, ?)');
  const result = stmt.run(keywordId, position, searchEngine || 'google');
  return { id: result.lastInsertRowid, keyword_id: keywordId, position, checked_at: new Date().toISOString(), search_engine: searchEngine || 'google' };
}

module.exports = { listKeywords, getKeyword, getKeywordCount, createKeyword, deleteKeyword, listRankChecks, createRankCheck };