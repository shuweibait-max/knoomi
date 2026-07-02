const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();

// GET /api/groups — list public groups (optional ?topic= filter)
router.get('/', auth, async (req, res) => {
  const { topic } = req.query;
  try {
    let query = `
      SELECT g.*, u.username AS creator,
        (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count
      FROM \`groups\` g
      JOIN users u ON u.id = g.created_by
      WHERE g.is_private = 0`;
    const params = [];
    if (topic) { query += ' AND g.topic = ?'; params.push(topic); }
    query += ' ORDER BY g.created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/groups — create group
router.post('/', auth, async (req, res) => {
  const { name, description = '', topic = '', is_private = false } = req.body;
  if (!name) return res.status(400).json({ error: 'Group name is required' });
  // Prevent duplicate group names
  const [existing] = await pool.query(
    'SELECT id FROM `groups` WHERE LOWER(name) = LOWER(?)',
    [name]
  );
  if (existing.length > 0)
    return res.status(409).json({ error: 'A group with this name already exists' });
  try {
    const [result] = await pool.query(
      'INSERT INTO `groups` (name, description, topic, created_by, is_private) VALUES (?, ?, ?, ?, ?)',
      [name, description, topic, req.userId, is_private ? 1 : 0]
    );
    // Creator auto-joins as moderator
    await pool.query(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, "moderator")',
      [result.insertId, req.userId]
    );
    const [group] = await pool.query('SELECT * FROM `groups` WHERE id = ?', [result.insertId]);
    res.status(201).json(group[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/groups/:id/join
router.post('/:id/join', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  try {
    const [existing] = await pool.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.userId]
    );
    if (existing.length > 0) return res.json({ message: 'Already a member' });
    await pool.query(
      'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
      [groupId, req.userId]
    );
    res.json({ message: 'Joined group' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/groups/:id/leave
router.delete('/:id/leave', auth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [parseInt(req.params.id), req.userId]
    );
    res.json({ message: 'Left group' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/groups/:id/messages
router.get('/:id/messages', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  try {
    const [member] = await pool.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.userId]
    );
    if (!member.length) return res.status(403).json({ error: 'Not a member of this group' });

    const [rows] = await pool.query(
      `SELECT m.*, u.username AS sender FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.group_id = ? ORDER BY m.created_at ASC LIMIT 100`,
      [groupId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/groups/mine
router.get('/mine', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT g.*,
         (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count
       FROM \`groups\` g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = ?`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
