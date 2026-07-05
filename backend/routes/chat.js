const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const {
  buildSystemPrompt,
  buildMessages,
  detectCrisis,
  loadUserContext,
  CRISIS_HOTLINES,
} = require('../services/promptEngine');
const {
  detectMoodShift,
  shouldRunDetection,
  createShiftNotifications,
} = require('../services/moodShiftDetector');

const router = express.Router();
const ai     = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL  = 'gemini-2.5-flash';


function convertToGeminiFormat(messages) {
  let systemInstruction = '';
  const contents = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }
  return { systemInstruction, contents };
}


// POST /api/chat/ai
router.post('/ai', auth, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim())
    return res.status(400).json({ error: 'Message cannot be empty' });

  try {
    // 1. Crisis detection on user's message
    const { isCrisis, matchedKeywords } = detectCrisis(message);
    if (isCrisis) {
      console.log(`[CRISIS DETECTED] user=${req.userId}, keywords=${matchedKeywords.join(', ')}`);
    }

    // 2. Save user message
    await pool.query(
      'INSERT INTO messages (sender_id, content, is_ai) VALUES (?, ?, 0)',
      [req.userId, message]
    );

    // 3. Load personalisation context
    const context = await loadUserContext(pool, req.userId);

    // 4. Fetch recent history
    const [historyRows] = await pool.query(
      `SELECT content, is_ai FROM messages
       WHERE sender_id = ? AND group_id IS NULL
       ORDER BY created_at DESC LIMIT 20`,
      [req.userId]
    );
    const history = historyRows.reverse().map(m => ({
      role:    m.is_ai ? 'assistant' : 'user',
      content: m.content,
    }));

    // 5. Build prompt & call Gemini
    const systemPrompt = buildSystemPrompt(context);
    const openAIStyleMessages = buildMessages(systemPrompt, history, message, isCrisis);
    const { systemInstruction, contents } = convertToGeminiFormat(openAIStyleMessages);

    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction,
        temperature: 0.75,
        maxOutputTokens: 600,
      },
    });

    let reply = response.text?.trim() || "I'm here — could you tell me a bit more about what's on your mind?";

    if (isCrisis && !reply.includes('Befrienders') && !reply.includes('Talian Kasih')) {
      reply = `${reply}\n\n---\n${CRISIS_HOTLINES}`;
    }

    // 6. Save AI reply
    const [result] = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, content, is_ai) VALUES (?, ?, ?, 1)',
      [req.userId, req.userId, reply]
    );

    // 7. ─── MOOD SHIFT DETECTION ─────────────────────────
    let shiftNotification = null;

    // Always trigger detection immediately on crisis language
    // Otherwise, check periodically (every 4 user turns after 6 baseline turns)
    const historyForDetection = [
      ...historyRows.reverse().map(m => ({ content: m.content, is_ai: m.is_ai })),
      { content: message, is_ai: false },
      { content: reply,   is_ai: true },
    ];

    const shouldCheck = isCrisis || shouldRunDetection(historyForDetection);

    if (shouldCheck) {
      const shift = isCrisis
        ? { severity: 'urgent', from_mood: 5, to_mood: 2, signals: matchedKeywords.slice(0, 3), summary: "I'm really glad you reached out. What you're feeling right now matters — you don't have to face this alone." }
        : await detectMoodShift(historyForDetection);

      if (shift) {
        console.log(`[MOOD SHIFT] user=${req.userId}, severity=${shift.severity}, ${shift.from_mood}→${shift.to_mood}`);
        shiftNotification = await createShiftNotifications(pool, req.userId, shift, isCrisis);
      }
    }

    res.json({
      reply,
      message_id: result.insertId,
      is_crisis:  isCrisis,
      shift_notification: shiftNotification,   // frontend can show this inline
    });

  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: err.message });
  }
});


// GET /api/chat/ai/history
router.get('/ai/history', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.*, u.username AS sender
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.sender_id = ? AND m.group_id IS NULL
       ORDER BY m.created_at ASC LIMIT 50`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/chat/direct/:otherId
router.get('/direct/:otherId', auth, async (req, res) => {
  const otherId = parseInt(req.params.otherId);
  try {
    const [rows] = await pool.query(
      `SELECT m.*, u.username AS sender FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE ((m.sender_id = ? AND m.receiver_id = ?)
           OR (m.sender_id = ? AND m.receiver_id = ?))
         AND m.group_id IS NULL AND m.is_ai = 0
       ORDER BY m.created_at ASC`,
      [req.userId, otherId, otherId, req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//-welcome message
router.post('/welcome', auth, async (req, res) => {
  try {
    // If the user already has AI chat history, do NOT send a welcome.
    // This ensures the welcome only appears the very first time.
    const [existing] = await pool.query(
      `SELECT id FROM messages
       WHERE sender_id = ? AND group_id IS NULL AND is_ai = 1
       LIMIT 1`,
      [req.userId]
    );
 
    if (existing.length > 0) {
      return res.json({ welcome: null, already_welcomed: true });
    }
 
    // Load context so we can personalise (name + AI name if you have that)
    const context = await loadUserContext(pool, req.userId);
    const aiName   = context.aiName   || 'Mira';
    const userName = context.userName || 'there';
 
    // Build a short, warm welcome prompt
    const welcomeSystemPrompt = `You are ${aiName}, a warm and compassionate AI companion on Knoomi — a mental health platform for young adults in Malaysia and Southeast Asia.
 
This is the very first time you are meeting ${userName}. Write a warm, brief opening message (2–3 sentences max) that:
- Introduces yourself by name gently ("Hi ${userName}, I'm ${aiName}...")
- Makes it clear this is a safe space
- Gently invites them to share whatever's on their mind — no pressure
- Feels human, warm, and non-clinical
- Does NOT ask multiple questions
- Does NOT say "As an AI" or sound scripted
 
Output ONLY the welcome message text. No quotes. No preamble.`;
 
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: 'Write the welcome message now.' }] }],
      config: {
        systemInstruction: welcomeSystemPrompt,
        temperature: 0.8,
        maxOutputTokens: 200,
      },
    });
 
    const welcome = response.text?.trim()
      || `Hi ${userName}, I'm ${aiName}. This is a safe space — whenever you're ready, I'm here to listen. 🌿`;
 
    // Save the welcome as a real AI message so it appears in history
    const [result] = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, content, is_ai) VALUES (?, ?, ?, 1)',
      [req.userId, req.userId, welcome]
    );
 
    res.json({
      welcome,
      message_id: result.insertId,
      already_welcomed: false,
    });
 
  } catch (err) {
    console.error('Welcome message error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
