const express = require('express');
const { db, auth: firebaseAuth } = require('../config/firebase');
const auth    = require('../middleware/auth');

const router = express.Router();

const USER_FIELDS = ['username', 'email', 'role', 'ai_name', 'ai_avatar', 'created_at'];

function serializeUser(uid, data) {
  const out = { id: uid };
  for (const key of USER_FIELDS) out[key] = data[key] ?? null;
  return out;
}

// POST /api/auth/profile-init
// Called by the client right after Firebase Auth account creation to set up
// the corresponding Firestore user profile (Firebase Auth alone has no
// concept of username/role/ai_name).
router.post('/profile-init', auth, async (req, res) => {
  const { username, role = 'user' } = req.body;

  if (!username || username.length < 3)
    return res.status(400).json({ error: 'Username must be at least 3 characters' });

  const usernameLower = username.toLowerCase();
  const userRef     = db.collection('users').doc(req.uid);
  const usernameRef = db.collection('usernames').doc(usernameLower);

  try {
    await db.runTransaction(async (tx) => {
      const existingUser = await tx.get(userRef);
      if (existingUser.exists) throw Object.assign(new Error('Profile already exists'), { code: 409 });

      const usernameDoc = await tx.get(usernameRef);
      if (usernameDoc.exists) throw Object.assign(new Error('Username already taken'), { code: 409 });

      const email = req.firebaseUser?.email || null;
      const createdAt = new Date().toISOString();

      tx.set(userRef, {
        username,
        email,
        role,
        ai_name: 'Mira',
        ai_avatar: null,
        created_at: createdAt,
      });
      tx.set(usernameRef, { uid: req.uid });
    });

    const newUserDoc = await userRef.get();
    res.status(201).json({ user: serializeUser(req.uid, newUserDoc.data()) });
  } catch (err) {
    if (err.code === 409) return res.status(409).json({ error: err.message });
    console.error('Profile init error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const doc = await db.collection('users').doc(req.uid).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });
    res.json(serializeUser(req.uid, doc.data()));
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/profile
router.put('/profile', auth, async (req, res) => {
  const { username, email } = req.body;

  if (!username || !email)
    return res.status(400).json({ error: 'Username and email are required' });
  if (username.length < 3)
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Invalid email format' });

  const normalizedEmail = email.toLowerCase();
  const usernameLower   = username.toLowerCase();
  const userRef         = db.collection('users').doc(req.uid);
  const newUsernameRef  = db.collection('usernames').doc(usernameLower);

  try {
    const currentDoc = await userRef.get();
    if (!currentDoc.exists) return res.status(404).json({ error: 'User not found' });
    const oldUsernameLower = (currentDoc.data().username || '').toLowerCase();

    if (usernameLower !== oldUsernameLower) {
      await db.runTransaction(async (tx) => {
        const takenDoc = await tx.get(newUsernameRef);
        if (takenDoc.exists) throw Object.assign(new Error('Username already taken'), { code: 409 });
        tx.delete(db.collection('usernames').doc(oldUsernameLower));
        tx.set(newUsernameRef, { uid: req.uid });
        tx.update(userRef, { username, email: normalizedEmail });
      });
    } else {
      await userRef.update({ username, email: normalizedEmail });
    }

    await firebaseAuth.updateUser(req.uid, { email: normalizedEmail });

    const updatedDoc = await userRef.get();
    res.json(serializeUser(req.uid, updatedDoc.data()));
  } catch (err) {
    if (err.code === 409) return res.status(409).json({ error: err.message });
    console.error('Profile update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/ai-name
router.put('/ai-name', auth, async (req, res) => {
  const { ai_name, ai_avatar } = req.body;
  const trimmedName = (ai_name || '').trim();

  if (!trimmedName)
    return res.status(400).json({ error: 'AI name cannot be empty' });
  if (trimmedName.length > 50)
    return res.status(400).json({ error: 'AI name must be 50 characters or less' });
  if (!/^[a-zA-Z0-9\s\-']+$/.test(trimmedName))
    return res.status(400).json({ error: 'AI name can only contain letters, numbers, spaces, hyphens and apostrophes' });

  const trimmedAvatar = ai_avatar ? String(ai_avatar).trim() : null;
  if (trimmedAvatar && trimmedAvatar.length > 10)
    return res.status(400).json({ error: 'Invalid avatar' });

  try {
    const userRef = db.collection('users').doc(req.uid);
    const update = { ai_name: trimmedName };
    if (trimmedAvatar) update.ai_avatar = trimmedAvatar;

    await userRef.update(update);

    const updatedDoc = await userRef.get();
    res.json(serializeUser(req.uid, updatedDoc.data()));
  } catch (err) {
    console.error('AI customization update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/password
// Password is managed entirely by Firebase Auth now — the client SDK's
// updatePassword()/sendPasswordResetEmail() replace this endpoint.
// Kept as a 410 so any stale frontend calls fail loudly instead of silently.
router.put('/password', auth, async (req, res) => {
  res.status(410).json({ error: 'Password changes are handled by Firebase Auth on the client now' });
});

module.exports = router;
