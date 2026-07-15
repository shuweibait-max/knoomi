const express = require('express');
const crypto  = require('crypto');
const { db, admin } = require('../config/firebase');
const auth    = require('../middleware/auth');

const router = express.Router();
const FieldValue = admin.firestore.FieldValue;

function generateInviteCode() {
  return crypto.randomBytes(5).toString('hex');
}

function toISO(ts) {
  return ts?.toDate ? ts.toDate().toISOString() : ts ?? null;
}

function serializeGroup(id, data, extra = {}) {
  return {
    id,
    name: data.name,
    description: data.description || '',
    topic: data.topic,
    created_by: data.createdBy,
    is_private: !!data.isPrivate,
    invite_code: data.inviteCode,
    member_count: data.memberCount || 0,
    created_at: toISO(data.createdAt),
    ...extra,
  };
}

// Fetch the current user's membership doc for a group (or null)
async function getMembership(groupId, uid) {
  const doc = await db.collection('groups').doc(groupId).collection('members').doc(uid).get();
  return doc.exists ? doc.data() : null;
}

// Map<groupId, role> for every group the user belongs to — backed by a
// denormalized users/{uid}.groupIds array rather than a Firestore
// collection-group query, since collection-group queries need a manually
// created index we can't provision from here.
async function getMyGroupRoles(uid) {
  const userDoc = await db.collection('users').doc(uid).get();
  const groupIds = userDoc.data()?.groupIds || [];
  if (groupIds.length === 0) return new Map();

  const memberDocs = await Promise.all(
    groupIds.map(gid => db.collection('groups').doc(gid).collection('members').doc(uid).get())
  );
  const map = new Map();
  memberDocs.forEach((doc, i) => { if (doc.exists) map.set(groupIds[i], doc.data().role); });
  return map;
}

async function addMember(groupRef, uid, role) {
  const userDoc = await db.collection('users').doc(uid).get();
  await groupRef.collection('members').doc(uid).set({
    uid,
    role,
    username: userDoc.data()?.username || null,
    joinedAt: FieldValue.serverTimestamp(),
  });
  await groupRef.update({ memberCount: FieldValue.increment(1) });
  await db.collection('users').doc(uid).update({ groupIds: FieldValue.arrayUnion(groupRef.id) });
}

async function removeMember(groupRef, uid) {
  await groupRef.collection('members').doc(uid).delete();
  await groupRef.update({ memberCount: FieldValue.increment(-1) });
  await db.collection('users').doc(uid).update({ groupIds: FieldValue.arrayRemove(groupRef.id) });
}

// Generates a unique invite code, atomically swapping it in for an
// already-existing group (used by regenerate + the missing-code fallback).
async function regenerateInviteCode(groupRef) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateInviteCode();
    const codeRef = db.collection('inviteCodes').doc(candidate);
    try {
      await db.runTransaction(async (tx) => {
        const codeDoc = await tx.get(codeRef);
        if (codeDoc.exists) throw Object.assign(new Error('taken'), { code: 'taken' });
        const groupDoc = await tx.get(groupRef);
        const oldCode = groupDoc.data()?.inviteCode;
        tx.create(codeRef, { groupId: groupRef.id });
        if (oldCode) tx.delete(db.collection('inviteCodes').doc(oldCode));
        tx.update(groupRef, { inviteCode: candidate });
      });
      return candidate;
    } catch (e) {
      if (e.code !== 'taken') throw e;
    }
  }
  throw new Error('Could not generate a unique invite code');
}


// ─── GET /api/groups/ ─── public groups list, WITH live membership status ───
router.get('/', auth, async (req, res) => {
  const { topic } = req.query;
  try {
    // No orderBy here: an equality filter on topic plus an orderBy on a
    // different field needs a composite index we can't provision in this
    // environment — sort in memory instead (no limit() on this endpoint,
    // so nothing to slice).
    let query = db.collection('groups').where('isPrivate', '==', false);
    if (topic && topic !== 'All') query = query.where('topic', '==', topic);
    const snap = await query.get();
    const sortedDocs = [...snap.docs].sort((a, b) =>
      (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
    );

    const myRoles = await getMyGroupRoles(req.uid);
    const groups = sortedDocs.map(doc => {
      const myRole = myRoles.get(doc.id) || null;
      return { ...serializeGroup(doc.id, doc.data()), my_role: myRole, is_member: !!myRole };
    });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/mine ─── groups the current user belongs to ────────────
router.get('/mine', auth, async (req, res) => {
  try {
    const myRoles = await getMyGroupRoles(req.uid);
    if (myRoles.size === 0) return res.json([]);

    const groupDocs = await Promise.all(
      [...myRoles.keys()].map(id => db.collection('groups').doc(id).get())
    );
    const groups = groupDocs
      .filter(d => d.exists)
      .sort((a, b) => (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0))
      .map(d => ({ ...serializeGroup(d.id, d.data()), my_role: myRoles.get(d.id), is_member: true }));
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/groups/ ─── create group, creator auto-joins as owner ───────
router.post('/', auth, async (req, res) => {
  const { name, description, topic, is_private } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: 'Group name is required' });

  const trimmedName = name.trim();
  const nameLower = trimmedName.toLowerCase();

  try {
    const dupeSnap = await db.collection('groups').where('nameLower', '==', nameLower).limit(1).get();
    if (!dupeSnap.empty)
      return res.status(409).json({ error: 'A group with this name already exists' });

    const groupRef = db.collection('groups').doc();

    let inviteCode;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateInviteCode();
      const codeRef = db.collection('inviteCodes').doc(candidate);
      try {
        await db.runTransaction(async (tx) => {
          const codeDoc = await tx.get(codeRef);
          if (codeDoc.exists) throw Object.assign(new Error('taken'), { code: 'taken' });
          tx.create(codeRef, { groupId: groupRef.id });
        });
        inviteCode = candidate;
        break;
      } catch (e) {
        if (e.code !== 'taken') throw e;
      }
    }
    if (!inviteCode) throw new Error('Could not generate a unique invite code');

    await groupRef.set({
      name: trimmedName,
      nameLower,
      description: description || '',
      topic: topic || 'General',
      createdBy: req.uid,
      isPrivate: !!is_private,
      inviteCode,
      memberCount: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    await addMember(groupRef, req.uid, 'owner');

    const newDoc = await groupRef.get();
    res.status(201).json({ ...serializeGroup(newDoc.id, newDoc.data()), my_role: 'owner', is_member: true });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/groups/:id/join ─── join a PUBLIC group directly ────────────
router.post('/:id/join', auth, async (req, res) => {
  const groupId = req.params.id;
  try {
    const groupRef = db.collection('groups').doc(groupId);
    const groupDoc = await groupRef.get();
    if (!groupDoc.exists) return res.status(404).json({ error: 'Group not found' });
    const group = groupDoc.data();
    if (group.isPrivate)
      return res.status(403).json({ error: 'This group is private — you need an invite link to join.' });

    const existing = await getMembership(groupId, req.uid);
    if (existing) return res.status(409).json({ error: 'You are already a member of this group' });

    await addMember(groupRef, req.uid, 'member');
    res.json({ message: 'Joined group', group_id: groupId, group_name: group.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/invite/:code ─── preview group by invite code ─────────
router.get('/invite/:code', auth, async (req, res) => {
  const code = String(req.params.code || '').toLowerCase();
  try {
    const codeDoc = await db.collection('inviteCodes').doc(code).get();
    if (!codeDoc.exists) return res.status(404).json({ error: 'Invalid or expired invite link' });

    const groupId = codeDoc.data().groupId;
    const groupDoc = await db.collection('groups').doc(groupId).get();
    if (!groupDoc.exists) return res.status(404).json({ error: 'Invalid or expired invite link' });
    const group = groupDoc.data();

    const creatorDoc = await db.collection('users').doc(group.createdBy).get();
    const membership = await getMembership(groupId, req.uid);

    res.json({
      id: groupId,
      name: group.name,
      description: group.description,
      topic: group.topic,
      is_private: group.isPrivate,
      created_by_name: creatorDoc.data()?.username || 'Unknown',
      member_count: group.memberCount || 0,
      is_member: !!membership,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/groups/invite/:code/join ─── join via invite code ───────────
router.post('/invite/:code/join', auth, async (req, res) => {
  const code = String(req.params.code || '').toLowerCase();
  try {
    const codeDoc = await db.collection('inviteCodes').doc(code).get();
    if (!codeDoc.exists) return res.status(404).json({ error: 'Invalid or expired invite link' });

    const groupId = codeDoc.data().groupId;
    const groupRef = db.collection('groups').doc(groupId);
    const groupDoc = await groupRef.get();
    if (!groupDoc.exists) return res.status(404).json({ error: 'Invalid or expired invite link' });
    const group = groupDoc.data();

    const existing = await getMembership(groupId, req.uid);
    if (existing) return res.json({ message: 'Already a member', group_id: groupId, group_name: group.name });

    await addMember(groupRef, req.uid, 'member');
    res.json({ message: 'Joined group', group_id: groupId, group_name: group.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/:id/invite ─── get invite code (members only) ─────────
router.get('/:id/invite', auth, async (req, res) => {
  const groupId = req.params.id;
  try {
    const membership = await getMembership(groupId, req.uid);
    if (!membership) return res.status(403).json({ error: 'You must be a member to view the invite link' });

    const groupRef = db.collection('groups').doc(groupId);
    const groupDoc = await groupRef.get();
    if (!groupDoc.exists) return res.status(404).json({ error: 'Group not found' });

    let code = groupDoc.data().inviteCode;
    if (!code) code = await regenerateInviteCode(groupRef);
    res.json({ invite_code: code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/groups/:id/invite/regenerate ─── owner/admin only ───────────
router.post('/:id/invite/regenerate', auth, async (req, res) => {
  const groupId = req.params.id;
  try {
    const membership = await getMembership(groupId, req.uid);
    if (!membership || !['owner', 'admin'].includes(membership.role))
      return res.status(403).json({ error: 'Only owners and admins can regenerate the invite link' });

    const newCode = await regenerateInviteCode(db.collection('groups').doc(groupId));
    res.json({ invite_code: newCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/:id/members ─── list all members with roles ──────────
router.get('/:id/members', auth, async (req, res) => {
  const groupId = req.params.id;
  try {
    const membership = await getMembership(groupId, req.uid);
    if (!membership) return res.status(403).json({ error: 'Not a member of this group' });

    const snap = await db.collection('groups').doc(groupId).collection('members').get();
    const rolePriority = { owner: 0, admin: 1, member: 2 };
    const members = snap.docs
      .map(doc => {
        const d = doc.data();
        return {
          user_id: doc.id,
          username: d.username,
          ai_avatar: d.ai_avatar || null,
          role: d.role,
          joined_at: toISO(d.joinedAt),
        };
      })
      .sort((a, b) =>
        (rolePriority[a.role] ?? 3) - (rolePriority[b.role] ?? 3) ||
        (a.joined_at || '').localeCompare(b.joined_at || '')
      );
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── PATCH /api/groups/:id/members/:userId/role ─── promote/demote ─────────
router.patch('/:id/members/:userId/role', auth, async (req, res) => {
  const groupId  = req.params.id;
  const targetId = req.params.userId;
  const { role }  = req.body;

  if (!['admin', 'member'].includes(role))
    return res.status(400).json({ error: 'Role must be admin or member' });

  try {
    const requester = await getMembership(groupId, req.uid);
    if (!requester || requester.role !== 'owner')
      return res.status(403).json({ error: 'Only the group owner can change member roles' });

    const target = await getMembership(groupId, targetId);
    if (!target) return res.status(404).json({ error: 'That user is not a member of this group' });
    if (target.role === 'owner')
      return res.status(403).json({ error: "You can't change the owner's role" });

    await db.collection('groups').doc(groupId).collection('members').doc(targetId).update({ role });
    res.json({ message: `Member ${role === 'admin' ? 'promoted to admin' : 'demoted to member'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── DELETE /api/groups/:id/members/:userId ─── kick a member ──────────────
router.delete('/:id/members/:userId', auth, async (req, res) => {
  const groupId  = req.params.id;
  const targetId = req.params.userId;

  try {
    const requester = await getMembership(groupId, req.uid);
    if (!requester || !['owner', 'admin'].includes(requester.role))
      return res.status(403).json({ error: 'Only owners and admins can remove members' });

    if (targetId === req.uid)
      return res.status(400).json({ error: 'Use "Leave group" to remove yourself' });

    const target = await getMembership(groupId, targetId);
    if (!target) return res.status(404).json({ error: 'That user is not a member of this group' });

    if (target.role === 'owner')
      return res.status(403).json({ error: 'The owner cannot be removed' });

    if (requester.role === 'admin' && target.role === 'admin')
      return res.status(403).json({ error: 'Admins cannot remove other admins — only the owner can' });

    await removeMember(db.collection('groups').doc(groupId), targetId);
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── PATCH /api/groups/:id ─── edit group info (owner/admin) ───────────────
router.patch('/:id', auth, async (req, res) => {
  const groupId = req.params.id;
  const { name, description, topic, is_private } = req.body;

  try {
    const membership = await getMembership(groupId, req.uid);
    if (!membership || !['owner', 'admin'].includes(membership.role))
      return res.status(403).json({ error: 'Only owners and admins can edit group settings' });

    const groupRef = db.collection('groups').doc(groupId);
    const update = {};

    if (name && name.trim()) {
      const trimmedName = name.trim();
      const nameLower = trimmedName.toLowerCase();
      const dupeSnap = await db.collection('groups').where('nameLower', '==', nameLower).limit(2).get();
      if (dupeSnap.docs.some(d => d.id !== groupId))
        return res.status(409).json({ error: 'A group with this name already exists' });
      update.name = trimmedName;
      update.nameLower = nameLower;
    }
    if (description !== undefined) update.description = description;
    if (topic) update.topic = topic;
    if (is_private != null) update.isPrivate = !!is_private;

    await groupRef.update(update);
    const updated = await groupRef.get();
    res.json(serializeGroup(updated.id, updated.data()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── DELETE /api/groups/:id ─── delete group entirely (owner only) ─────────
router.delete('/:id', auth, async (req, res) => {
  const groupId = req.params.id;
  try {
    const membership = await getMembership(groupId, req.uid);
    if (!membership || membership.role !== 'owner')
      return res.status(403).json({ error: 'Only the group owner can delete the group' });

    const groupRef = db.collection('groups').doc(groupId);
    const groupDoc = await groupRef.get();
    const inviteCode = groupDoc.data()?.inviteCode;

    const memberSnap = await groupRef.collection('members').get();
    await Promise.all(memberSnap.docs.map(doc =>
      db.collection('users').doc(doc.id).update({ groupIds: FieldValue.arrayRemove(groupId) }).catch(() => {})
    ));

    await db.recursiveDelete(groupRef);
    if (inviteCode) await db.collection('inviteCodes').doc(inviteCode).delete();

    res.json({ message: 'Group deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/groups/:id/messages ─── message history ──────────────────────
router.get('/:id/messages', auth, async (req, res) => {
  const groupId = req.params.id;
  try {
    const membership = await getMembership(groupId, req.uid);
    if (!membership) return res.status(403).json({ error: 'Not a member of this group' });

    const snap = await db.collection('groups').doc(groupId).collection('messages')
      .orderBy('createdAt', 'asc').limit(200).get();
    const messages = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        sender_id: d.senderId,
        sender: d.senderUsername,
        group_id: groupId,
        content: d.content,
        created_at: toISO(d.createdAt),
      };
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── DELETE /api/groups/:id/leave ─── leave a group ─────────────────────────
router.delete('/:id/leave', auth, async (req, res) => {
  const groupId = req.params.id;
  try {
    const membership = await getMembership(groupId, req.uid);
    if (membership?.role === 'owner')
      return res.status(400).json({ error: 'Owners cannot leave — transfer ownership or delete the group instead' });

    if (membership) await removeMember(db.collection('groups').doc(groupId), req.uid);
    res.json({ message: 'Left group' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
