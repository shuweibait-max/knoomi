const express = require('express');
const axios   = require('axios');
const { v4: uuidv4 } = require('uuid');
const { db, admin } = require('../config/firebase');
const auth    = require('../middleware/auth');

const router = express.Router();
const FieldValue = admin.firestore.FieldValue;

// POST /api/video/create
router.post('/create', auth, async (req, res) => {
  const { participant_id = null } = req.body;
  const roomName = `knoomi-${uuidv4().replace(/-/g,'').slice(0,12)}`;
  let dailyUrl   = `https://${process.env.DAILY_DOMAIN}/${roomName}`;

  // Create room on Daily.co if keys are set
  if (process.env.DAILY_API_KEY && process.env.DAILY_DOMAIN) {
    try {
      const resp = await axios.post(
        'https://api.daily.co/v1/rooms',
        {
          name:       roomName,
          properties: {
            max_participants: 2,
            enable_chat:      true,
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
        },
        { headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}` } }
      );
      dailyUrl = resp.data.url;
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create Daily.co room: ' + err.message });
    }
  }

  try {
    const ref = await db.collection('videoSessions').add({
      roomName,
      hostId: req.uid,
      participantId: participant_id,
      dailyRoomUrl: dailyUrl,
      startedAt: FieldValue.serverTimestamp(),
      endedAt: null,
    });
    res.status(201).json({ id: ref.id, room_name: roomName, daily_room_url: dailyUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/video/:id/end
router.patch('/:id/end', auth, async (req, res) => {
  try {
    await db.collection('videoSessions').doc(req.params.id).update({
      endedAt: FieldValue.serverTimestamp(),
    });
    res.json({ message: 'Session ended' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
