const { auth, db } = require('../config/firebase');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    req.firebaseUser = decoded;

    // Profile doc may not exist yet (e.g. mid-registration, before
    // POST /api/auth/profile-init runs) — don't hard-fail here, just
    // leave userRole unset so role-gated routes deny access naturally.
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    req.userRole = userDoc.exists ? userDoc.data().role : null;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
