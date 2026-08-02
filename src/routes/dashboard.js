const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { getDashboard } = require('../models/dashboard');
const { checkAndStoreAlerts, listAlerts, acknowledgeAlert, unacknowledgedCount } = require('../models/alerts');

const router = Router({ mergeParams: true });

router.use(requireAuth);

// GET /api/projects/:projectId/dashboard
router.get('/dashboard', (req, res) => {
  const data = getDashboard(req.params.projectId, req.session.userId);
  if (!data) return res.status(404).json({ error: 'Project not found.' });
  res.json(data);
});

// GET /api/projects/:projectId/dashboard/alerts
router.get('/dashboard/alerts', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const alerts = listAlerts(req.params.projectId, req.session.userId, limit);
  res.json(alerts);
});

// POST /api/projects/:projectId/dashboard/check-alerts
// Manually triggers the alert check for this project
router.post('/dashboard/check-alerts', (req, res) => {
  const count = checkAndStoreAlerts(req.params.projectId, req.session.userId);
  res.json({ newAlerts: count, message: `${count} new alert(s) created.` });
});

// GET /api/projects/:projectId/dashboard/alerts/count
// Returns unacknowledged alert count
router.get('/dashboard/alerts/count', (req, res) => {
  const count = unacknowledgedCount(req.params.projectId, req.session.userId);
  res.json({ count });
});

// POST /api/projects/:projectId/dashboard/alerts/:id/acknowledge
router.post('/dashboard/alerts/:id/acknowledge', (req, res) => {
  const ok = acknowledgeAlert(req.params.id, req.params.projectId, req.session.userId);
  if (!ok) return res.status(404).json({ error: 'Alert not found.' });
  res.json({ message: 'Alert acknowledged.' });
});

module.exports = router;