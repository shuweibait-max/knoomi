const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, email, password, role = 'user' } = req.body;

  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields are required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR username = ?', [email.toLowerCase(), username]
    );
    if (existing.length > 0)
      return res.status(409).json({ error: 'Email or username already taken' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email.toLowerCase(), hash, role]
    );

    const token = jwt.sign(
      { userId: result.insertId, role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Fetch the full user record (includes ai_name default 'Mira' and created_at)
    const [newUserRows] = await pool.query(
      'SELECT id, username, email, role, ai_name, ai_avatar, created_at FROM users WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({ token, user: newUserRows[0] });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        ai_name: user.ai_name,
        ai_avatar: user.ai_avatar,
        created_at: user.created_at,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, email, role, ai_name, ai_avatar, created_at FROM users WHERE id = ?',
      [req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
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

  try {
    const normalizedEmail = email.toLowerCase();

    // Check if username is taken by someone else
    const [takenByUsername] = await pool.query(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [username, req.userId]
    );
    if (takenByUsername.length > 0)
      return res.status(409).json({ error: 'Username already taken' });

    // Check if email is taken by someone else
    const [takenByEmail] = await pool.query(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [normalizedEmail, req.userId]
    );
    if (takenByEmail.length > 0)
      return res.status(409).json({ error: 'Email already taken' });

    // Perform the update
    await pool.query(
      'UPDATE users SET username = ?, email = ? WHERE id = ?',
      [username, normalizedEmail, req.userId]
    );

    // Fetch the updated record
    const [updatedRows] = await pool.query(
      'SELECT id, username, email, role, ai_name, ai_avatar, created_at FROM users WHERE id = ?',
      [req.userId]
    );

    if (!updatedRows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(updatedRows[0]);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/ai-name
router.put('/ai-name', auth, async (req, res) => {
  const { ai_name, ai_avatar } = req.body;
  const trimmedName = (ai_name || '').trim();
 
  // Name validation
  if (!trimmedName)
    return res.status(400).json({ error: 'AI name cannot be empty' });
  if (trimmedName.length > 50)
    return res.status(400).json({ error: 'AI name must be 50 characters or less' });
  if (!/^[a-zA-Z0-9\s\-']+$/.test(trimmedName))
    return res.status(400).json({ error: 'AI name can only contain letters, numbers, spaces, hyphens and apostrophes' });
 
  // Avatar validation (optional — if not sent, keep existing)
  const trimmedAvatar = ai_avatar ? String(ai_avatar).trim() : null;
  if (trimmedAvatar && trimmedAvatar.length > 10)
    return res.status(400).json({ error: 'Invalid avatar' });
 
  try {
    if (trimmedAvatar) {
      await pool.query(
        'UPDATE users SET ai_name = ?, ai_avatar = ? WHERE id = ?',
        [trimmedName, trimmedAvatar, req.userId]
      );
    } else {
      await pool.query(
        'UPDATE users SET ai_name = ? WHERE id = ?',
        [trimmedName, req.userId]
      );
    }
 
    const [updatedRows] = await pool.query(
      'SELECT id, username, email, role, ai_name, ai_avatar, created_at FROM users WHERE id = ?',
      [req.userId]
    );
    res.json(updatedRows[0]);
  } catch (err) {
    console.error('AI customization update error:', err);
    res.status(500).json({ error: err.message });
  }
});
 
// PUT /api/auth/password
router.put('/password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Both passwords are required' });
  if (newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' });

  try {
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.userId]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Password update error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
