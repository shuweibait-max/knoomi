const express = require('express');
const crypto  = require('crypto');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();

// Helper to generate a short random invite code (10 hex chars)
function generateInviteCode() {
  return crypto.randomBytes(5).toString('hex');
}


// ─── GET /api/groups/ ─── list public groups (optional topic filter)
router.get('/', auth, async (req, res) => {
  const { topic } = req.query;
  try {
    let query = `
      SELECT g.*,
             (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count
      FROM "groups" g
      WHERE g.is_private = 0`;
    const params = [];
    if (topic && topic !== 'All') {
      query += ' AND g.topic = ?';
      params.push(topic);
    }
    query += ' ORDER BY g.created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/mine ─── groups the current user belongs to
router.get('/mine', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT g.*,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count
       FROM "groups" g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = ?
       ORDER BY g.created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/groups/ ─── create a new group (creator auto-joins)
router.post('/', auth, async (req, res) => {
  const { name, description, topic, is_private } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: 'Group name is required' });

  try {
    // Duplicate name check
    const [existing] = await pool.query(
      'SELECT id FROM "groups" WHERE LOWER(name) = LOWER(?)',
      [name.trim()]
    );
    if (existing.length > 0)
      return res.status(409).json({ error: 'A group with this name already exists' });

    // Generate unique invite code
    let inviteCode = generateInviteCode();
    // Extremely unlikely collision, but check anyway
    for (let i = 0; i < 3; i++) {
      const [check] = await pool.query(
        'SELECT id FROM "groups" WHERE invite_code = ?',
        [inviteCode]
      );
      if (check.length === 0) break;
      inviteCode = generateInviteCode();
    }

    // Create the group
    const [result] = await pool.query(
      'INSERT INTO "groups" (name, description, topic, created_by, is_private, invite_code) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), description || '', topic || 'General', req.userId, is_private ? 1 : 0, inviteCode]
    );

    // ─── Auto-join the creator as 'owner' ────────────────
    await pool.query(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
      [result.insertId, req.userId, 'owner']
    );

    // Fetch the full record to return
    const [newGroup] = await pool.query(
      `SELECT g.*,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count
       FROM "groups" g WHERE g.id = ?`,
      [result.insertId]
    );

    res.status(201).json(newGroup[0]);
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/groups/:id/join ─── join a PUBLIC group directly
router.post('/:id/join', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  try {
    // Fetch the group and check it's public
    const [groupRows] = await pool.query(
      'SELECT id, name, is_private FROM "groups" WHERE id = ?',
      [groupId]
    );
    if (!groupRows[0])
      return res.status(404).json({ error: 'Group not found' });

    if (groupRows[0].is_private === 1)
      return res.status(403).json({ error: 'This group is private — you need an invite link to join.' });

    // Check if already a member
    const [existing] = await pool.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.userId]
    );
    if (existing.length > 0)
      return res.status(409).json({ error: 'You are already a member of this group' });

    await pool.query(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
      [groupId, req.userId, 'member']
    );

    res.json({ message: 'Joined group', group_id: groupId, group_name: groupRows[0].name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/invite/:code ─── preview group by invite code (no auto-join)
router.get('/invite/:code', auth, async (req, res) => {
  const code = String(req.params.code || '').toLowerCase();
  try {
    const [rows] = await pool.query(
      `SELECT g.id, g.name, g.description, g.topic, g.is_private,
              u.username AS created_by_name,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = ?) AS is_member
       FROM "groups" g
       JOIN users u ON u.id = g.created_by
       WHERE g.invite_code = ?`,
      [req.userId, code]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Invalid or expired invite link' });
    res.json({
      ...rows[0],
      is_member: parseInt(rows[0].is_member) > 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/groups/invite/:code/join ─── join a group via invite code
router.post('/invite/:code/join', auth, async (req, res) => {
  const code = String(req.params.code || '').toLowerCase();
  try {
    const [groupRows] = await pool.query(
      'SELECT id, name FROM "groups" WHERE invite_code = ?',
      [code]
    );
    if (!groupRows[0])
      return res.status(404).json({ error: 'Invalid or expired invite link' });

    const groupId = groupRows[0].id;

    // Check if already a member
    const [existing] = await pool.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.userId]
    );
    if (existing.length > 0)
      return res.json({ message: 'Already a member', group_id: groupId, group_name: groupRows[0].name });

    await pool.query(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
      [groupId, req.userId, 'member']
    );

    res.json({ message: 'Joined group', group_id: groupId, group_name: groupRows[0].name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/:id/invite ─── get invite code for a group (members only)
router.get('/:id/invite', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  try {
    const [memberRows] = await pool.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.userId]
    );
    if (!memberRows[0])
      return res.status(403).json({ error: 'You must be a member to view the invite link' });

    const [groupRows] = await pool.query(
      'SELECT invite_code FROM "groups" WHERE id = ?',
      [groupId]
    );
    if (!groupRows[0]) return res.status(404).json({ error: 'Group not found' });

    // If somehow the invite_code is missing (legacy), generate one now
    let code = groupRows[0].invite_code;
    if (!code) {
      code = generateInviteCode();
      await pool.query('UPDATE "groups" SET invite_code = ? WHERE id = ?', [code, groupId]);
    }

    res.json({ invite_code: code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/:id/messages ─── message history for a group
router.get('/:id/messages', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  try {
    // Confirm membership
    const [memberRows] = await pool.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.userId]
    );
    if (!memberRows[0])
      return res.status(403).json({ error: 'Not a member of this group' });

    const [rows] = await pool.query(
      `SELECT m.*, u.username AS sender FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.group_id = ?
       ORDER BY m.created_at ASC LIMIT 200`,
      [groupId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── DELETE /api/groups/:id/leave ─── leave a group
router.delete('/:id/leave', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  try {
    await pool.query(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.userId]
    );
    res.json({ message: 'Left group' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
