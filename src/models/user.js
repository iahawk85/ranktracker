const { getDb } = require('../db');

const SALT_ROUNDS = 10;

function createUser(email, password) {
  const bcrypt = require('bcrypt');
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const db = getDb();
  const stmt = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
  const result = stmt.run(email, hash);
  return { id: result.lastInsertRowid, email };
}

function findUserByEmail(email) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function verifyPassword(plaintext, hash) {
  const bcrypt = require('bcrypt');
  return bcrypt.compareSync(plaintext, hash);
}

module.exports = { createUser, findUserByEmail, verifyPassword };