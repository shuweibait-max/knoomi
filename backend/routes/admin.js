// ============================================================
//  Admin routes
//  Location: /backend/routes/admin.js
//
//  All routes require role='admin'. Admins can view aggregate
//  stats, browse users, see all notification logs, and drill
//  down into individual user history.
//
//  NOTE on scale: several stats below (active users, avg mood,
//  messages today) have no direct Firestore equivalent to a SQL
//  aggregate over a single table — they're computed by iterating
//  all users (or all groups) and querying each one's subcollections.
//  That's O(users)/O(groups) reads per dashboard load, which is
//  fine at this app's current size but would need a precomputed/
//  cached stats doc (e.g. written by the nightly cron) before it's
//  read at real production scale.
// ============================================================

const express = require('express');
const { db }  = require('../config/firebase');
const auth    = require('../middleware/auth');

const router = express.Router();

// Middleware — only allow admins past this point
function adminOnly(req, res, next) {
  if (req.userRole !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.use(auth, adminOnly);

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function notifSerialize(doc, usersByUid = {}) {
  const d = doc.data();
  return {
    id: doc.id,
    user_id: d.userId,
    username: usersByUid[d.userId]?.username || null,
    email: usersByUid[d.userId]?.email || null,
    type: d.type,
    severity: d.severity,
    title: d.title,
    message: d.message,
    metadata: d.metadata || {},
    is_read: !!d.isRead,
    created_at: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : d.createdAt,
  };
}


// ─── GET /api/admin/stats ─── overview cards for the dashboard
router.get('/stats', async (req, res) => {
  try {
    const sevenDaysAgo = daysAgo(7);
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

    const [usersSnap, groupsCountSnap, unreadCountSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('groups').count().get(),
      db.collection('notifications').where('audience', '==', 'admin').where('isRead', '==', false).count().get(),
    ]);

    // Active users (7d) + avg mood (7d) + messages today (AI side) — one
    // pass over all users' subcollections.
    let activeUserCount = 0;
    let moodSum = 0, moodCount = 0;
    let aiMessagesToday = 0;

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const [recentChatSnap, recentMoodSnap, todayAiSnap] = await Promise.all([
        db.collection('users').doc(uid).collection('aiMessages').where('createdAt', '>=', sevenDaysAgo).limit(1).get(),
        db.collection('users').doc(uid).collection('moodEntries').where('loggedAt', '>=', sevenDaysAgo).get(),
        db.collection('users').doc(uid).collection('aiMessages').where('createdAt', '>=', startOfToday).count().get(),
      ]);
      if (!recentChatSnap.empty || !recentMoodSnap.empty) activeUserCount++;
      recentMoodSnap.docs.forEach(d => { moodSum += d.data().score; moodCount++; });
      aiMessagesToday += todayAiSnap.data().count;
    }

    // Group messages today — one pass over all groups.
    const groupsSnap = await db.collection('groups').get();
    let groupMessagesToday = 0;
    for (const groupDoc of groupsSnap.docs) {
      const countSnap = await groupDoc.ref.collection('messages').where('createdAt', '>=', startOfToday).count().get();
      groupMessagesToday += countSnap.data().count;
    }

    // Urgent admin notifications (7d) — fetch admin+urgent (equality-only,
    // no composite index needed) and filter the date range in memory,
    // since combining a range filter with multiple equality filters would
    // need a manually provisioned composite index.
    const urgentSnap = await db.collection('notifications')
      .where('audience', '==', 'admin').where('severity', '==', 'urgent').get();
    const urgentAlerts7d = urgentSnap.docs.filter(d => {
      const createdAt = d.data().createdAt?.toDate ? d.data().createdAt.toDate() : new Date(d.data().createdAt);
      return createdAt >= sevenDaysAgo;
    }).length;

    res.json({
      total_users:      usersSnap.size,
      active_users_7d:  activeUserCount,
      messages_today:   aiMessagesToday + groupMessagesToday,
      total_groups:     groupsCountSnap.data().count,
      unread_alerts:    unreadCountSnap.data().count,
      urgent_alerts_7d: urgentAlerts7d,
      avg_mood_7d:      moodCount ? Math.round((moodSum / moodCount) * 100) / 100 : null,
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
    // No orderBy on this query: multiple equality filters plus an orderBy
    // on a different field need a composite index we can't provision here
    // — fetch matches and sort/slice in memory instead.
    let query = db.collection('notifications').where('audience', '==', 'admin');
    if (severity && ['info', 'concern', 'urgent'].includes(severity)) query = query.where('severity', '==', severity);
    if (unread_only === 'true') query = query.where('isRead', '==', false);
    if (user_id) query = query.where('userId', '==', user_id);

    const snap = await query.get();
    const sortedDocs = [...snap.docs].sort((a, b) => {
      const aTime = a.data().createdAt?.toMillis?.() || 0;
      const bTime = b.data().createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    }).slice(0, 100);

    const uids = [...new Set(sortedDocs.map(d => d.data().userId))];
    const userDocs = await Promise.all(uids.map(uid => db.collection('users').doc(uid).get()));
    const usersByUid = Object.fromEntries(userDocs.map(d => [d.id, d.data()]));

    res.json(sortedDocs.map(doc => notifSerialize(doc, usersByUid)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── PATCH /api/admin/notifications/:id/read ─── mark reviewed
router.patch('/notifications/:id/read', async (req, res) => {
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


// ─── GET /api/admin/users ─── list users
router.get('/users', async (req, res) => {
  const { search } = req.query;
  try {
    const usersSnap = await db.collection('users').get();
    const searchLower = search ? search.toLowerCase() : null;

    let users = usersSnap.docs.filter(doc => {
      if (!searchLower) return true;
      const d = doc.data();
      return d.username?.toLowerCase().includes(searchLower) || d.email?.toLowerCase().includes(searchLower);
    });

    const sevenDaysAgo = daysAgo(7);
    const rows = await Promise.all(users.map(async (doc) => {
      const uid = doc.id;
      const d = doc.data();
      const [chatCountSnap, moodCountSnap, urgentCountSnap, recentMoodSnap] = await Promise.all([
        db.collection('users').doc(uid).collection('aiMessages').count().get(),
        db.collection('users').doc(uid).collection('moodEntries').count().get(),
        db.collection('notifications').where('userId', '==', uid).where('audience', '==', 'admin').where('severity', '==', 'urgent').count().get(),
        db.collection('users').doc(uid).collection('moodEntries').where('loggedAt', '>=', sevenDaysAgo).get(),
      ]);
      const recentScores = recentMoodSnap.docs.map(m => m.data().score);
      const recentAvgMood = recentScores.length
        ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length
        : null;

      return {
        id: uid,
        username: d.username,
        email: d.email,
        role: d.role,
        created_at: d.created_at,
        chat_count: chatCountSnap.data().count,
        mood_count: moodCountSnap.data().count,
        urgent_count: urgentCountSnap.data().count,
        recent_avg_mood: recentAvgMood,
      };
    }));

    rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json(rows.slice(0, 100));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/admin/users/:id ─── single user's full profile
router.get('/users/:id', async (req, res) => {
  const uid = req.params.id;
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    const d = userDoc.data();

    const [moodSnap, notifSnap, chatCountSnap] = await Promise.all([
      db.collection('users').doc(uid).collection('moodEntries').orderBy('loggedAt', 'desc').limit(30).get(),
      // No orderBy here: combining two equality filters with an orderBy on a
      // third field needs a composite index we can't provision in this
      // environment — fetch all matches (bounded by this user's own
      // notification volume) and sort/slice in memory instead.
      db.collection('notifications').where('userId', '==', uid).where('audience', '==', 'admin').get(),
      db.collection('users').doc(uid).collection('aiMessages').where('isAi', '==', false).count().get(),
    ]);
    const sortedNotifDocs = [...notifSnap.docs].sort((a, b) => {
      const aTime = a.data().createdAt?.toMillis?.() || 0;
      const bTime = b.data().createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    }).slice(0, 30);

    res.json({
      user: {
        id: uid,
        username: d.username,
        email: d.email,
        role: d.role,
        ai_name: d.ai_name,
        created_at: d.created_at,
      },
      mood_entries: moodSnap.docs.map(doc => {
        const m = doc.data();
        return { score: m.score, note: m.note, logged_at: m.loggedAt?.toDate ? m.loggedAt.toDate().toISOString() : m.loggedAt };
      }),
      notifications: sortedNotifDocs.map(doc => notifSerialize(doc)),
      chat_message_count: chatCountSnap.data().count,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── PUT /api/admin/users/:id/role ─── change role (promote/demote)
router.put('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['user', 'therapist', 'admin'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });

  try {
    await db.collection('users').doc(req.params.id).update({ role });
    res.json({ message: `Role updated to ${role}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
