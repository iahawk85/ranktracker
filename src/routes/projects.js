const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} = require('../models/project');
const { listKeywords } = require('../models/keyword');

const router = Router();

// All routes require auth
router.use(requireAuth);

// GET /api/projects
router.get('/', (req, res) => {
  const projects = listProjects(req.session.userId);
  res.json(projects);
});

// GET /api/projects/:id
router.get('/:id', (req, res) => {
  const project = getProject(req.params.id, req.session.userId);
  if (!project) return res.status(404).json({ error: 'Project not found.' });
  res.json(project);
});

// POST /api/projects
router.post('/', (req, res) => {
  const { name, domain } = req.body;
  if (!name || !domain) {
    return res.status(400).json({ error: 'Name and domain are required.' });
  }
  const project = createProject(req.session.userId, name, domain);
  res.status(201).json(project);
});

// PUT /api/projects/:id
router.put('/:id', (req, res) => {
  const project = updateProject(req.params.id, req.session.userId, req.body);
  if (!project) return res.status(404).json({ error: 'Project not found.' });
  res.json(project);
});

// DELETE /api/projects/:id
router.delete('/:id', (req, res) => {
  const result = deleteProject(req.params.id, req.session.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Project not found.' });
  res.json({ message: 'Project deleted.' });
});

// GET /api/projects/:id/keywords
router.get('/:id/keywords', (req, res) => {
  const keywords = listKeywords(req.params.id, req.session.userId);
  res.json(keywords);
});

module.exports = router;