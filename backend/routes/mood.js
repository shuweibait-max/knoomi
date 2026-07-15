const express = require('express');
const { db, admin } = require('../config/firebase');
const auth    = require('../middleware/auth');

const router = express.Router();

function serializeEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    score: d.score,
    note: d.note || '',
    logged_at: d.loggedAt?.toDate ? d.loggedAt.toDate().toISOString() : d.loggedAt,
  };
}

// POST /api/mood
router.post('/', auth, async (req, res) => {
  const { score, note = '' } = req.body;
  if (!score || score < 1 || score > 10)
    return res.status(400).json({ error: 'Score must be between 1 and 10' });
  try {
    const ref = await db.collection('users').doc(req.uid).collection('moodEntries').add({
      score, note, loggedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const doc = await ref.get();
    res.status(201).json(serializeEntry(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mood — last 30 entries
router.get('/', auth, async (req, res) => {
  try {
    const snap = await db.collection('users').doc(req.uid).collection('moodEntries')
      .orderBy('loggedAt', 'asc').limit(30).get();
    res.json(snap.docs.map(serializeEntry));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mood/latest
router.get('/latest', auth, async (req, res) => {
  try {
    const snap = await db.collection('users').doc(req.uid).collection('moodEntries')
      .orderBy('loggedAt', 'desc').limit(1).get();
    res.json(snap.empty ? null : serializeEntry(snap.docs[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
