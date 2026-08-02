const { getDb } = require('../db');

function listProjects(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

function getProject(id, userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
}

function createProject(userId, name, domain) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO projects (user_id, name, domain) VALUES (?, ?, ?)');
  const result = stmt.run(userId, name, domain);
  return { id: result.lastInsertRowid, user_id: userId, name, domain };
}

function updateProject(id, userId, fields) {
  const db = getDb();
  const allowed = ['name', 'domain'];
  const sets = [];
  const vals = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(fields[key]);
    }
  }
  if (sets.length === 0) return getProject(id, userId);
  vals.push(id, userId);
  db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  return getProject(id, userId);
}

function deleteProject(id, userId) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?');
  return stmt.run(id, userId);
}

module.exports = { listProjects, getProject, createProject, updateProject, deleteProject };