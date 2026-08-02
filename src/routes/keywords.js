const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  getKeyword,
  createKeyword,
  deleteKeyword,
  listRankChecks,
  createRankCheck,
} = require('../models/keyword');

const router = Router({ mergeParams: true });

router.use(requireAuth);

// POST /api/projects/:projectId/keywords
router.post('/', (req, res) => {
  const { keyword, search_engine } = req.body;
  if (!keyword) {
    return res.status(400).json({ error: 'Keyword is required.' });
  }
  const kw = createKeyword(req.params.projectId, req.session.userId, keyword, search_engine);
  if (!kw) return res.status(404).json({ error: 'Project not found.' });
  res.status(201).json(kw);
});

// DELETE /api/projects/:projectId/keywords/:id
router.delete('/:id', (req, res) => {
  const result = deleteKeyword(req.params.id, req.params.projectId, req.session.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Keyword not found.' });
  res.json({ message: 'Keyword deleted.' });
});

// GET /api/projects/:projectId/keywords/:id/rank-checks
router.get('/:id/rank-checks', (req, res) => {
  const rankChecks = listRankChecks(req.params.id, req.params.projectId, req.session.userId);
  res.json(rankChecks);
});

// POST /api/projects/:projectId/keywords/:id/rank-checks
router.post('/:id/rank-checks', (req, res) => {
  const { position, search_engine } = req.body;
  if (position === undefined || position === null) {
    return res.status(400).json({ error: 'Position is required.' });
  }
  const rc = createRankCheck(
    req.params.id,
    req.params.projectId,
    req.session.userId,
    position,
    search_engine
  );
  if (!rc) return res.status(404).json({ error: 'Keyword not found.' });
  res.status(201).json(rc);
});

module.exports = router;