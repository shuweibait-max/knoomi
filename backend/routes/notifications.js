// ============================================================
//  Notifications routes
//  Location: /backend/routes/notifications.js
// ============================================================

const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();

// ─── User: fetch their own notifications ───────────────────
// GET /api/notifications
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, type, severity, title, message, metadata, is_read, created_at
       FROM notifications
       WHERE user_id = ? AND audience = 'user'
       ORDER BY created_at DESC LIMIT 30`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── User: unread count ────────────────────────────────────
// GET /api/notifications/unread-count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE user_id = ? AND audience = 'user' AND is_read = 0`,
      [req.userId]
    );
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── User: mark a notification as read ─────────────────────
// PATCH /api/notifications/:id/read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = 1
       WHERE id = ? AND user_id = ? AND audience = 'user'`,
      [parseInt(req.params.id), req.userId]
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── User: mark ALL as read ────────────────────────────────
// PATCH /api/notifications/read-all
router.patch('/read-all', auth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = 1
       WHERE user_id = ? AND audience = 'user'`,
      [req.userId]
    );
    res.json({ message: 'All marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: view all admin-audience notifications ──────────
// GET /api/notifications/admin
// Requires role='admin'
router.get('/admin', auth, async (req, res) => {
  if (req.userRole !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });

  try {
    const [rows] = await pool.query(
      `SELECT n.id, n.user_id, u.username, u.email,
              n.type, n.severity, n.title, n.message, n.metadata,
              n.is_read, n.created_at
       FROM notifications n
       JOIN users u ON u.id = n.user_id
       WHERE n.audience = 'admin'
       ORDER BY n.created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: mark an admin notification reviewed ────────────
// PATCH /api/notifications/admin/:id/read
router.patch('/admin/:id/read', auth, async (req, res) => {
  if (req.userRole !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });

  try {
    await pool.query(
      `UPDATE notifications SET is_read = 1
       WHERE id = ? AND audience = 'admin'`,
      [parseInt(req.params.id)]
    );
    res.json({ message: 'Marked as reviewed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
