require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const jwt        = require('jsonwebtoken');
const pool       = require('./config/db');
const initDB     = require('./config/initDB');

const adminRoutes = require('./routes/admin');
const authRoutes   = require('./routes/auth');
const chatRoutes   = require('./routes/chat');
const groupRoutes  = require('./routes/groups');
const moodRoutes   = require('./routes/mood');
const videoRoutes  = require('./routes/video');
const crisisRoutes = require('./routes/crisis');
const notificationsRoutes = require('./routes/notifications');

const cron = require('node-cron');
const { runDailyMoodJudgement } = require('./services/moodJudge');

const app    = express();
const server = http.createServer(app);
<<<<<<< HEAD
const io = new Server(server, {
  cors: {
  origin: [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5000',
  ].filter(Boolean),
  methods: ['GET', 'POST'],
  credentials: true,
=======
const io     = new Server(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://localhost:5000',
    ],
    methods: ['GET', 'POST'],
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48
  },
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
<<<<<<< HEAD
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5000',
  ].filter(Boolean),  // filter removes undefined values
  credentials: true,
  }));
=======
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:5000',
  ],
}));
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48
app.use(express.json());

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/admin', adminRoutes);
app.use('/api/auth',   authRoutes);
app.use('/api/chat',   chatRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/mood',   moodRoutes);
app.use('/api/video',  videoRoutes);
app.use('/api/crisis', crisisRoutes);
app.use('/api/notifications', notificationsRoutes);

// ── Serve React build in production ──────────────────────────────────────────
// In development, Vite runs its own dev server on port 5173.
// In production (after `npm run build`), serve the built files.
const frontendBuild = path.join(__dirname, '..', 'frontend', 'dist');
if (require('fs').existsSync(frontendBuild)) {
  app.use(express.static(frontendBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuild, 'index.html'));
  });
}

// ── Socket.IO ─────────────────────────────────────────────────────────────────
function getUserFromToken(token) {
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { return null; }
}

io.on('connection', (socket) => {
  socket.on('connect_user', ({ token }) => {
    const user = getUserFromToken(token);
    if (!user) return;
    socket.join(`user_${user.userId}`);
    socket.userId   = user.userId;
    socket.username = user.username;
  });

  socket.on('send_direct_message', async ({ token, receiver_id, content }) => {
    const user = getUserFromToken(token);
    if (!user || !content?.trim()) return;
    try {
      const [result] = await pool.query(
        'INSERT INTO messages (sender_id, receiver_id, content, is_ai) VALUES (?, ?, ?, 0)',
        [user.userId, receiver_id, content]
      );
      const [rows] = await pool.query(
        `SELECT m.*, u.username AS sender FROM messages m
         JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
        [result.insertId]
      );
      const msg = rows[0];
      io.to(`user_${user.userId}`).emit('new_direct_message', msg);
      io.to(`user_${receiver_id}`).emit('new_direct_message', msg);
    } catch (err) { socket.emit('error', { message: err.message }); }
  });

  socket.on('join_group_room', async ({ token, group_id }) => {
    const user = getUserFromToken(token);
    if (!user) return;
    const [member] = await pool.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
      [group_id, user.userId]
    );
    if (!member.length) { socket.emit('error', { message: 'Not a member' }); return; }
    socket.join(`group_${group_id}`);
    const [uRows] = await pool.query('SELECT username FROM users WHERE id = ?', [user.userId]);
    io.to(`group_${group_id}`).emit('system_message', { content: `${uRows[0]?.username} joined` });
  });

  socket.on('leave_group_room', async ({ token, group_id }) => {
    const user = getUserFromToken(token);
    if (!user) return;
    socket.leave(`group_${group_id}`);
    const [uRows] = await pool.query('SELECT username FROM users WHERE id = ?', [user.userId]);
    io.to(`group_${group_id}`).emit('system_message', { content: `${uRows[0]?.username} left` });
  });

  socket.on('send_group_message', async ({ token, group_id, content }) => {
    const user = getUserFromToken(token);
    if (!user || !content?.trim()) return;
    const [member] = await pool.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
      [group_id, user.userId]
    );
    if (!member.length) return;
    try {
      const [result] = await pool.query(
        'INSERT INTO messages (sender_id, group_id, content) VALUES (?, ?, ?)',
        [user.userId, group_id, content]
      );
      const [rows] = await pool.query(
        `SELECT m.*, u.username AS sender FROM messages m
         JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
        [result.insertId]
      );
      io.to(`group_${group_id}`).emit('new_group_message', rows[0]);
    } catch (err) { socket.emit('error', { message: err.message }); }
  });

  socket.on('typing', ({ token, group_id, receiver_id }) => {
    const user = getUserFromToken(token);
    if (!user) return;
    const room = group_id ? `group_${group_id}` : `user_${receiver_id}`;
    socket.to(room).emit('user_typing', { username: user.username || 'Someone' });
  });
});

//──────Cron job for daily mood judgement ──────────────────────────────────────────────────────────────

cron.schedule('0 0 * * *', async () => {
  console.log('⏰ Midnight mood judgement job triggered');
  try {
    await runDailyMoodJudgement(pool);
  } catch (err) {
    console.error('❌ Mood judgement job failed:', err);
  }
}, {
  timezone: 'Asia/Kuala_Lumpur',   // Malaysia time — change if needed
});
 
console.log('📅 Daily mood judgement scheduled for 00:00 Asia/Kuala_Lumpur');

// Test endpoint — POST /api/admin/run-mood-judgement
app.post('/api/admin/run-mood-judgement', async (req, res) => {
  try {
    // Optionally accept a specific date via body: { date: '2026-07-01' }
    const targetDate = req.body?.date ? new Date(req.body.date) : null;
    const result = await runDailyMoodJudgement(pool, targetDate);
    res.json({ message: 'Judgement complete', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
initDB()
  .then(() => server.listen(PORT, () =>
<<<<<<< HEAD
    console.log(`🌿 Knoomi API running on http://localhost:${PORT}`)
  ))
  .catch(err => { console.error('❌ Database init failed:', err); process.exit(1); });
=======
    console.log(`🌿 MindBridge API running on http://localhost:${PORT}`)
  ))
  .catch(err => { console.error('❌ Database init failed:', err.message); process.exit(1); });
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48
