// ============================================================
//  Notifications routes
//  Location: /backend/routes/notifications.js
// ============================================================

const express = require('express');
const { db, admin } = require('../config/firebase');
const auth    = require('../middleware/auth');

const router = express.Router();

function serialize(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    user_id: d.userId,
    type: d.type,
    severity: d.severity,
    title: d.title,
    message: d.message,
    metadata: d.metadata || {},
    is_read: !!d.isRead,
    created_at: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : d.createdAt,
  };
}

// ─── User: fetch their own notifications ───────────────────
// GET /api/notifications
router.get('/', auth, async (req, res) => {
  try {
    // No orderBy here: two equality filters plus an orderBy on a third
    // field need a composite index we can't provision in this environment
    // — fetch matches (bounded by this user's own notification volume)
    // and sort/slice in memory instead.
    const snap = await db.collection('notifications')
      .where('userId', '==', req.uid).where('audience', '==', 'user').get();
    const sorted = [...snap.docs].sort((a, b) => {
      const aTime = a.data().createdAt?.toMillis?.() || 0;
      const bTime = b.data().createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    }).slice(0, 30);
    res.json(sorted.map(serialize));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── User: unread count ────────────────────────────────────
// GET /api/notifications/unread-count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const countSnap = await db.collection('notifications')
      .where('userId', '==', req.uid).where('audience', '==', 'user').where('isRead', '==', false)
      .count().get();
    res.json({ count: countSnap.data().count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── User: mark a notification as read ─────────────────────
// PATCH /api/notifications/:id/read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const ref = db.collection('notifications').doc(req.params.id);
    const doc = await ref.get();
    if (doc.exists && doc.data().userId === req.uid && doc.data().audience === 'user') {
      await ref.update({ isRead: true });
    }
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── User: mark ALL as read ────────────────────────────────
// PATCH /api/notifications/read-all
router.patch('/read-all', auth, async (req, res) => {
  try {
    const snap = await db.collection('notifications')
      .where('userId', '==', req.uid).where('audience', '==', 'user').get();
    const batch = db.batch();
    snap.docs.forEach(doc => batch.update(doc.ref, { isRead: true }));
    await batch.commit();
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
    const rawSnap = await db.collection('notifications').where('audience', '==', 'admin').get();
    const snap = { docs: [...rawSnap.docs].sort((a, b) => {
      const aTime = a.data().createdAt?.toMillis?.() || 0;
      const bTime = b.data().createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    }).slice(0, 100) };

    const uids = [...new Set(snap.docs.map(d => d.data().userId))];
    const userDocs = await Promise.all(uids.map(uid => db.collection('users').doc(uid).get()));
    const usersByUid = Object.fromEntries(userDocs.map(d => [d.id, d.data()]));

    const rows = snap.docs.map(doc => ({
      ...serialize(doc),
      username: usersByUid[doc.data().userId]?.username || null,
      email: usersByUid[doc.data().userId]?.email || null,
    }));
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
    const ref = db.collection('notifications').doc(req.params.id);
    const doc = await ref.get();
    if (doc.exists && doc.data().audience === 'admin') {
      await ref.update({ isRead: true });
    }
    res.json({ message: 'Marked as reviewed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
