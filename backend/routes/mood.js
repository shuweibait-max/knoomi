const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();

// POST /api/mood
router.post('/', auth, async (req, res) => {
  const { score, note = '' } = req.body;
  if (!score || score < 1 || score > 10)
    return res.status(400).json({ error: 'Score must be between 1 and 10' });
  try {
    const [result] = await pool.query(
      'INSERT INTO mood_entries (user_id, score, note) VALUES (?, ?, ?)',
      [req.userId, score, note]
    );
    const [entry] = await pool.query('SELECT * FROM mood_entries WHERE id = ?', [result.insertId]);
    res.status(201).json(entry[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mood — last 30 entries
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM mood_entries WHERE user_id = ? ORDER BY logged_at ASC LIMIT 30',
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mood/latest
router.get('/latest', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM mood_entries WHERE user_id = ? ORDER BY logged_at DESC LIMIT 1',
      [req.userId]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
