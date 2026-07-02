const express = require('express');
const axios   = require('axios');
const { v4: uuidv4 } = require('uuid');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();

// POST /api/video/create
router.post('/create', auth, async (req, res) => {
  const { participant_id = null } = req.body;
<<<<<<< HEAD
  const roomName = `knoomi-${uuidv4().replace(/-/g,'').slice(0,12)}`;
=======
  const roomName = `mindbridge-${uuidv4().replace(/-/g,'').slice(0,12)}`;
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48
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
    const [result] = await pool.query(
      'INSERT INTO video_sessions (room_name, host_id, participant_id, daily_room_url) VALUES (?, ?, ?, ?)',
      [roomName, req.userId, participant_id, dailyUrl]
    );
    res.status(201).json({ id: result.insertId, room_name: roomName, daily_room_url: dailyUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/video/:id/end
router.patch('/:id/end', auth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE video_sessions SET ended_at = NOW() WHERE id = ?',
      [parseInt(req.params.id)]
    );
    res.json({ message: 'Session ended' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
