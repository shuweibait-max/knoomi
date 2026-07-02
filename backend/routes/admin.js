// ============================================================
//  Admin routes
//  Location: /backend/routes/admin.js
//
//  All routes require role='admin'. Admins can view aggregate
//  stats, browse users, see all notification logs, and drill
//  down into individual user history.
// ============================================================

const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();

// Middleware — only allow admins past this point
function adminOnly(req, res, next) {
  if (req.userRole !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.use(auth, adminOnly);


// ─── GET /api/admin/stats ─── overview cards for the dashboard
router.get('/stats', async (req, res) => {
  try {
    // Total users
    const [usersRes] = await pool.query('SELECT COUNT(*) AS count FROM users');
    // Active last 7 days (any activity)
    const [activeRes] = await pool.query(
      `SELECT COUNT(DISTINCT user_id) AS count FROM (
         SELECT sender_id AS user_id FROM messages WHERE created_at >= NOW() - INTERVAL '7 days'
         UNION
         SELECT user_id FROM mood_entries WHERE logged_at >= NOW() - INTERVAL '7 days'
       ) AS a`
    );
    // Total messages today
    const [msgsRes] = await pool.query(
      `SELECT COUNT(*) AS count FROM messages
       WHERE DATE(created_at) = CURRENT_DATE`
    );
    // Total groups
    const [groupsRes] = await pool.query('SELECT COUNT(*) AS count FROM "groups"');
    // Unread admin notifications
    const [unreadRes] = await pool.query(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE audience = 'admin' AND is_read = 0`
    );
    // Urgent notifications last 7 days
    const [urgentRes] = await pool.query(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE audience = 'admin' AND severity = 'urgent'
         AND created_at >= NOW() - INTERVAL '7 days'`
    );
    // Average mood last 7 days
    const [avgMoodRes] = await pool.query(
      `SELECT AVG(score)::numeric(4,2) AS avg FROM mood_entries
       WHERE logged_at >= NOW() - INTERVAL '7 days'`
    );

    res.json({
      total_users:      parseInt(usersRes[0].count),
      active_users_7d:  parseInt(activeRes[0].count),
      messages_today:   parseInt(msgsRes[0].count),
      total_groups:     parseInt(groupsRes[0].count),
      unread_alerts:    parseInt(unreadRes[0].count),
      urgent_alerts_7d: parseInt(urgentRes[0].count),
      avg_mood_7d:      avgMoodRes[0].avg ? parseFloat(avgMoodRes[0].avg) : null,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/admin/notifications ─── filterable audit log
router.get('/notifications', async (req, res) => {
  const { severity, unread_only, user_id } = req.query;
  try {
    let query = `
      SELECT n.id, n.user_id, u.username, u.email,
             n.type, n.severity, n.title, n.message, n.metadata,
             n.is_read, n.created_at
      FROM notifications n
      JOIN users u ON u.id = n.user_id
      WHERE n.audience = 'admin'`;
    const params = [];

    if (severity && ['info','concern','urgent'].includes(severity)) {
      query += ' AND n.severity = ?';
      params.push(severity);
    }
    if (unread_only === 'true') {
      query += ' AND n.is_read = 0';
    }
    if (user_id) {
      query += ' AND n.user_id = ?';
      params.push(parseInt(user_id));
    }

    query += ' ORDER BY n.created_at DESC LIMIT 100';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── PATCH /api/admin/notifications/:id/read ─── mark reviewed
router.patch('/notifications/:id/read', async (req, res) => {
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


// ─── GET /api/admin/users ─── list users
router.get('/users', async (req, res) => {
  const { search } = req.query;
  try {
    let query = `
      SELECT u.id, u.username, u.email, u.role, u.created_at,
             (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id AND m.group_id IS NULL) AS chat_count,
             (SELECT COUNT(*) FROM mood_entries me WHERE me.user_id = u.id) AS mood_count,
             (SELECT COUNT(*) FROM notifications n WHERE n.user_id = u.id AND n.audience = 'admin' AND n.severity = 'urgent') AS urgent_count,
             (SELECT AVG(score) FROM mood_entries me WHERE me.user_id = u.id AND me.logged_at >= NOW() - INTERVAL '7 days') AS recent_avg_mood
      FROM users u`;
    const params = [];

    if (search) {
      query += ' WHERE u.username ILIKE ? OR u.email ILIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY u.created_at DESC LIMIT 100';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/admin/users/:id ─── single user's full profile
router.get('/users/:id', async (req, res) => {
  const userId = parseInt(req.params.id);
  try {
    const [userRows] = await pool.query(
      `SELECT id, username, email, role, ai_name, created_at
       FROM users WHERE id = ?`,
      [userId]
    );
    if (!userRows[0]) return res.status(404).json({ error: 'User not found' });

    const [moodRows] = await pool.query(
      `SELECT score, note, logged_at FROM mood_entries
       WHERE user_id = ? ORDER BY logged_at DESC LIMIT 30`,
      [userId]
    );

    const [notifRows] = await pool.query(
      `SELECT id, severity, title, message, metadata, is_read, created_at
       FROM notifications
       WHERE user_id = ? AND audience = 'admin'
       ORDER BY created_at DESC LIMIT 30`,
      [userId]
    );

    const [msgCountRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM messages
       WHERE sender_id = ? AND group_id IS NULL AND is_ai = 0`,
      [userId]
    );

    res.json({
      user:          userRows[0],
      mood_entries:  moodRows,
      notifications: notifRows,
      chat_message_count: parseInt(msgCountRows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── PUT /api/admin/users/:id/role ─── change role (promote/demote)
router.put('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['user','therapist','admin'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });

  try {
    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, parseInt(req.params.id)]);
    res.json({ message: `Role updated to ${role}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
