const express = require('express');
const session = require('express-session');
const path = require('path');
const { getDb } = require('./db');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const keywordRoutes = require('./routes/keywords');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database on startup
getDb();

// Middleware
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'ranktracker-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects/:projectId/keywords', keywordRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Rank Tracker API running on http://localhost:${PORT}`);
});

module.exports = app;