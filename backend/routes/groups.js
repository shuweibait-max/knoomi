const express = require('express');
const crypto  = require('crypto');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();

function generateInviteCode() {
  return crypto.randomBytes(5).toString('hex');
}

// Fetch the current user's membership row for a group (or null)
async function getMembership(groupId, userId) {
  const [rows] = await pool.query(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
    [groupId, userId]
  );
  return rows[0] || null;
}


// ─── GET /api/groups/ ─── public groups list, WITH live membership status ───
router.get('/', auth, async (req, res) => {
  const { topic } = req.query;
  try {
    let query = `
      SELECT g.*,
             (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count,
             (SELECT gm2.role FROM group_members gm2 WHERE gm2.group_id = g.id AND gm2.user_id = ?) AS my_role
      FROM "groups" g
      WHERE g.is_private = 0`;
    const params = [req.userId];
    if (topic && topic !== 'All') {
      query += ' AND g.topic = ?';
      params.push(topic);
    }
    query += ' ORDER BY g.created_at DESC';
    const [rows] = await pool.query(query, params);

    const withMembership = rows.map(g => ({ ...g, is_member: !!g.my_role }));
    res.json(withMembership);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/mine ─── groups the current user belongs to ────────────
router.get('/mine', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT g.*, gm.role AS my_role,
              (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count
       FROM "groups" g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = ?
       ORDER BY g.created_at DESC`,
      [req.userId]
    );
    res.json(rows.map(g => ({ ...g, is_member: true })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/groups/ ─── create group, creator auto-joins as owner ───────
router.post('/', auth, async (req, res) => {
  const { name, description, topic, is_private } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: 'Group name is required' });

  try {
    const [existing] = await pool.query(
      'SELECT id FROM "groups" WHERE LOWER(name) = LOWER(?)',
      [name.trim()]
    );
    if (existing.length > 0)
      return res.status(409).json({ error: 'A group with this name already exists' });

    let inviteCode = generateInviteCode();
    for (let i = 0; i < 3; i++) {
      const [check] = await pool.query('SELECT id FROM "groups" WHERE invite_code = ?', [inviteCode]);
      if (check.length === 0) break;
      inviteCode = generateInviteCode();
    }

    const [result] = await pool.query(
      'INSERT INTO "groups" (name, description, topic, created_by, is_private, invite_code) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), description || '', topic || 'General', req.userId, is_private ? 1 : 0, inviteCode]
    );

    await pool.query(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
      [result.insertId, req.userId, 'owner']
    );

    const [newGroup] = await pool.query(
      `SELECT g.*, 'owner' AS my_role,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count
       FROM "groups" g WHERE g.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ ...newGroup[0], is_member: true });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/groups/:id/join ─── join a PUBLIC group directly ────────────
router.post('/:id/join', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  try {
    const [groupRows] = await pool.query('SELECT id, name, is_private FROM "groups" WHERE id = ?', [groupId]);
    if (!groupRows[0]) return res.status(404).json({ error: 'Group not found' });
    if (groupRows[0].is_private === 1)
      return res.status(403).json({ error: 'This group is private — you need an invite link to join.' });

    const existing = await getMembership(groupId, req.userId);
    if (existing) return res.status(409).json({ error: 'You are already a member of this group' });

    await pool.query(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
      [groupId, req.userId, 'member']
    );
    res.json({ message: 'Joined group', group_id: groupId, group_name: groupRows[0].name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/invite/:code ─── preview group by invite code ─────────
router.get('/invite/:code', auth, async (req, res) => {
  const code = String(req.params.code || '').toLowerCase();
  try {
    const [rows] = await pool.query(
      `SELECT g.id, g.name, g.description, g.topic, g.is_private,
              u.username AS created_by_name,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count,
              (SELECT gm2.role FROM group_members gm2 WHERE gm2.group_id = g.id AND gm2.user_id = ?) AS my_role
       FROM "groups" g
       JOIN users u ON u.id = g.created_by
       WHERE g.invite_code = ?`,
      [req.userId, code]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Invalid or expired invite link' });
    res.json({ ...rows[0], is_member: !!rows[0].my_role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/groups/invite/:code/join ─── join via invite code ───────────
router.post('/invite/:code/join', auth, async (req, res) => {
  const code = String(req.params.code || '').toLowerCase();
  try {
    const [groupRows] = await pool.query('SELECT id, name FROM "groups" WHERE invite_code = ?', [code]);
    if (!groupRows[0]) return res.status(404).json({ error: 'Invalid or expired invite link' });

    const groupId = groupRows[0].id;
    const existing = await getMembership(groupId, req.userId);
    if (existing) return res.json({ message: 'Already a member', group_id: groupId, group_name: groupRows[0].name });

    await pool.query(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
      [groupId, req.userId, 'member']
    );
    res.json({ message: 'Joined group', group_id: groupId, group_name: groupRows[0].name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/:id/invite ─── get invite code (members only) ─────────
router.get('/:id/invite', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  try {
    const membership = await getMembership(groupId, req.userId);
    if (!membership) return res.status(403).json({ error: 'You must be a member to view the invite link' });

    const [groupRows] = await pool.query('SELECT invite_code FROM "groups" WHERE id = ?', [groupId]);
    if (!groupRows[0]) return res.status(404).json({ error: 'Group not found' });

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


// ─── POST /api/groups/:id/invite/regenerate ─── owner/admin only ───────────
router.post('/:id/invite/regenerate', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  try {
    const membership = await getMembership(groupId, req.userId);
    if (!membership || !['owner', 'admin'].includes(membership.role))
      return res.status(403).json({ error: 'Only owners and admins can regenerate the invite link' });

    const newCode = generateInviteCode();
    await pool.query('UPDATE "groups" SET invite_code = ? WHERE id = ?', [newCode, groupId]);
    res.json({ invite_code: newCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/:id/members ─── list all members with roles ──────────
router.get('/:id/members', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  try {
    const membership = await getMembership(groupId, req.userId);
    if (!membership) return res.status(403).json({ error: 'Not a member of this group' });

    const [rows] = await pool.query(
      `SELECT u.id AS user_id, u.username, u.ai_avatar, gm.role, gm.joined_at
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY
         CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
         gm.joined_at ASC`,
      [groupId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── PATCH /api/groups/:id/members/:userId/role ─── promote/demote ─────────
router.patch('/:id/members/:userId/role', auth, async (req, res) => {
  const groupId  = parseInt(req.params.id);
  const targetId = parseInt(req.params.userId);
  const { role }  = req.body;

  if (!['admin', 'member'].includes(role))
    return res.status(400).json({ error: 'Role must be admin or member' });

  try {
    const requester = await getMembership(groupId, req.userId);
    if (!requester || requester.role !== 'owner')
      return res.status(403).json({ error: 'Only the group owner can change member roles' });

    const target = await getMembership(groupId, targetId);
    if (!target) return res.status(404).json({ error: 'That user is not a member of this group' });
    if (target.role === 'owner')
      return res.status(403).json({ error: "You can't change the owner's role" });

    await pool.query(
      'UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?',
      [role, groupId, targetId]
    );
    res.json({ message: `Member ${role === 'admin' ? 'promoted to admin' : 'demoted to member'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── DELETE /api/groups/:id/members/:userId ─── kick a member ──────────────
router.delete('/:id/members/:userId', auth, async (req, res) => {
  const groupId  = parseInt(req.params.id);
  const targetId = parseInt(req.params.userId);

  try {
    const requester = await getMembership(groupId, req.userId);
    if (!requester || !['owner', 'admin'].includes(requester.role))
      return res.status(403).json({ error: 'Only owners and admins can remove members' });

    if (targetId === req.userId)
      return res.status(400).json({ error: 'Use "Leave group" to remove yourself' });

    const target = await getMembership(groupId, targetId);
    if (!target) return res.status(404).json({ error: 'That user is not a member of this group' });

    if (target.role === 'owner')
      return res.status(403).json({ error: 'The owner cannot be removed' });

    if (requester.role === 'admin' && target.role === 'admin')
      return res.status(403).json({ error: 'Admins cannot remove other admins — only the owner can' });

    await pool.query(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, targetId]
    );
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── PATCH /api/groups/:id ─── edit group info (owner/admin) ───────────────
router.patch('/:id', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  const { name, description, topic, is_private } = req.body;

  try {
    const membership = await getMembership(groupId, req.userId);
    if (!membership || !['owner', 'admin'].includes(membership.role))
      return res.status(403).json({ error: 'Only owners and admins can edit group settings' });

    if (name && name.trim()) {
      const [dupe] = await pool.query(
        'SELECT id FROM "groups" WHERE LOWER(name) = LOWER(?) AND id != ?',
        [name.trim(), groupId]
      );
      if (dupe.length > 0)
        return res.status(409).json({ error: 'A group with this name already exists' });
    }

    await pool.query(
      `UPDATE "groups" SET
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         topic = COALESCE(?, topic),
         is_private = COALESCE(?, is_private)
       WHERE id = ?`,
      [name?.trim() || null, description ?? null, topic || null, is_private != null ? (is_private ? 1 : 0) : null, groupId]
    );

    const [updated] = await pool.query('SELECT * FROM "groups" WHERE id = ?', [groupId]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── DELETE /api/groups/:id ─── delete group entirely (owner only) ─────────
router.delete('/:id', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  try {
    const membership = await getMembership(groupId, req.userId);
    if (!membership || membership.role !== 'owner')
      return res.status(403).json({ error: 'Only the group owner can delete the group' });

    await pool.query('DELETE FROM "groups" WHERE id = ?', [groupId]);
    res.json({ message: 'Group deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/:id/messages ─── message history ──────────────────────
router.get('/:id/messages', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  try {
    const membership = await getMembership(groupId, req.userId);
    if (!membership) return res.status(403).json({ error: 'Not a member of this group' });

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


// ─── DELETE /api/groups/:id/leave ─── leave a group ─────────────────────────
router.delete('/:id/leave', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  try {
    const membership = await getMembership(groupId, req.userId);
    if (membership?.role === 'owner')
      return res.status(400).json({ error: 'Owners cannot leave — transfer ownership or delete the group instead' });

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
