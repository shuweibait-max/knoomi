require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const { auth: firebaseAuth, db } = require('./config/firebase');

const adminRoutes         = require('./routes/admin');
const authRoutes          = require('./routes/auth');
const chatRoutes          = require('./routes/chat');
const groupRoutes         = require('./routes/groups');
const moodRoutes          = require('./routes/mood');
const videoRoutes         = require('./routes/video');
const crisisRoutes        = require('./routes/crisis');
const notificationsRoutes = require('./routes/notifications');

const cron = require('node-cron');
const { runDailyMoodJudgement } = require('./services/moodJudge');

const app    = express();
const server = http.createServer(app);

// ── Allowed origins for CORS (dev + production) ──────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5000',
].filter(Boolean);   // remove undefined values

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/admin',         adminRoutes);
app.use('/api/auth',          authRoutes);
app.use('/api/chat',          chatRoutes);
app.use('/api/groups',        groupRoutes);
app.use('/api/mood',          moodRoutes);
app.use('/api/video',         videoRoutes);
app.use('/api/crisis',        crisisRoutes);
app.use('/api/notifications', notificationsRoutes);

// ── Serve React build in production ──────────────────────────────────────────
const frontendBuild = path.join(__dirname, '..', 'frontend', 'dist');
if (require('fs').existsSync(frontendBuild)) {
  app.use(express.static(frontendBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuild, 'index.html'));
  });
}

// ── Socket.IO ─────────────────────────────────────────────────────────────────
// Chat (group + direct messages) now goes straight to Firestore — the client
// writes messages directly and listens via onSnapshot, enforced by Firestore
// security rules, rather than round-tripping through this socket server.
// Socket.IO's only remaining job is the ephemeral `typing` indicator, which
// doesn't belong in Firestore (a write per keystroke would be wasteful).
async function getUserFromToken(token) {
  try { return await firebaseAuth.verifyIdToken(token); }
  catch { return null; }
}

io.on('connection', (socket) => {
  socket.on('connect_user', async ({ token }) => {
    const user = await getUserFromToken(token);
    if (!user) return;
    socket.join(`user_${user.uid}`);
    socket.uid  = user.uid;
    socket.name = user.name || user.email;
  });

  // Plain room join/leave for scoping the `typing` broadcast — no membership
  // check here since access to the group chat UI already required it
  // (enforced by the Firestore-backed groups API), and this only controls
  // who sees a "someone is typing" event, not message content.
  socket.on('join_group_room', ({ group_id }) => {
    socket.join(`group_${group_id}`);
  });

  socket.on('leave_group_room', ({ group_id }) => {
    socket.leave(`group_${group_id}`);
  });

  socket.on('typing', async ({ token, group_id, receiver_id }) => {
    const user = await getUserFromToken(token);
    if (!user) return;
    const room = group_id ? `group_${group_id}` : `user_${receiver_id}`;
    socket.to(room).emit('user_typing', { username: user.name || user.email || 'Someone' });
  });
});

// ── Cron job for daily mood judgement ────────────────────────────────────────
cron.schedule('0 0 * * *', async () => {
  console.log('⏰ Midnight mood judgement job triggered');
  try {
    await runDailyMoodJudgement(db);
  } catch (err) {
    console.error('❌ Mood judgement job failed:', err);
  }
}, {
  timezone: 'Asia/Kuala_Lumpur',
});

console.log('📅 Daily mood judgement scheduled for 00:00 Asia/Kuala_Lumpur');

// Test endpoint — POST /api/admin/run-mood-judgement
app.post('/api/admin/run-mood-judgement', async (req, res) => {
  try {
    const targetDate = req.body?.date ? new Date(req.body.date) : null;
    const result = await runDailyMoodJudgement(db, targetDate);
    res.json({ message: 'Judgement complete', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🌿 Knoomi API running on http://localhost:${PORT}`));