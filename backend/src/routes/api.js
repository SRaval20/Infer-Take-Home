const express = require('express');
const { getSession } = require('../websocket/wsHandler');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/carriers', (req, res) => {
  res.json({ carriers: ['progressive', 'geico'] });
});

// Fallback REST endpoint — frontend primarily uses WS, this is for polling fallback
router.get('/session/:id/status', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ sessionId: req.params.id, active: true });
});

module.exports = router;
