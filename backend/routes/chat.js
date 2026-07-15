const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const { db, admin } = require('../config/firebase');
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
const FieldValue = admin.firestore.FieldValue;


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

// Deterministic path for a 1:1 DM thread between two uids.
function dmId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
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
      console.log(`[CRISIS DETECTED] user=${req.uid}, keywords=${matchedKeywords.join(', ')}`);
    }

    const aiMessagesRef = db.collection('users').doc(req.uid).collection('aiMessages');

    // 2. Save user message
    await aiMessagesRef.add({ content: message, isAi: false, createdAt: FieldValue.serverTimestamp() });

    // 3. Load personalisation context
    const context = await loadUserContext(db, req.uid);

    // 4. Fetch recent history
    const historySnap = await aiMessagesRef.orderBy('createdAt', 'desc').limit(20).get();
    const historyDocs = historySnap.docs.map(d => d.data()).reverse();
    const history = historyDocs.map(m => ({ role: m.isAi ? 'assistant' : 'user', content: m.content }));

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
    const replyRef = await aiMessagesRef.add({ content: reply, isAi: true, createdAt: FieldValue.serverTimestamp() });

    // 7. ─── MOOD SHIFT DETECTION ─────────────────────────
    let shiftNotification = null;

    const historyForDetection = [
      ...historyDocs.map(m => ({ content: m.content, is_ai: m.isAi })),
      { content: message, is_ai: false },
      { content: reply,   is_ai: true },
    ];

    const shouldCheck = isCrisis || shouldRunDetection(historyForDetection);

    if (shouldCheck) {
      const shift = isCrisis
        ? { severity: 'urgent', from_mood: 5, to_mood: 2, signals: matchedKeywords.slice(0, 3), summary: "I'm really glad you reached out. What you're feeling right now matters — you don't have to face this alone." }
        : await detectMoodShift(historyForDetection);

      if (shift) {
        console.log(`[MOOD SHIFT] user=${req.uid}, severity=${shift.severity}, ${shift.from_mood}→${shift.to_mood}`);
        shiftNotification = await createShiftNotifications(db, req.uid, shift, isCrisis);
      }
    }

    res.json({
      reply,
      message_id: replyRef.id,
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
    const snap = await db.collection('users').doc(req.uid).collection('aiMessages')
      .orderBy('createdAt', 'asc').limit(50).get();
    const messages = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        sender_id: req.uid,
        content: d.content,
        is_ai: d.isAi,
        created_at: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : d.createdAt,
      };
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/chat/direct/:otherId
router.get('/direct/:otherId', auth, async (req, res) => {
  const otherId = req.params.otherId;
  try {
    const snap = await db.collection('dms').doc(dmId(req.uid, otherId)).collection('messages')
      .orderBy('createdAt', 'asc').get();
    const messages = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        sender_id: d.senderId,
        sender: d.senderUsername,
        receiver_id: d.receiverId,
        content: d.content,
        created_at: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : d.createdAt,
      };
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/ai/welcome
router.post('/ai/welcome', auth, async (req, res) => {
  try {
    const aiMessagesRef = db.collection('users').doc(req.uid).collection('aiMessages');

    // If the user already has AI chat history, do NOT send a welcome.
    // This ensures the welcome only appears the very first time.
    const existingSnap = await aiMessagesRef.where('isAi', '==', true).limit(1).get();
    if (!existingSnap.empty) {
      return res.json({ welcome: null, already_welcomed: true });
    }

    // Load context so we can personalise (name + AI name if you have that)
    const context = await loadUserContext(db, req.uid);
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
    const result = await aiMessagesRef.add({ content: welcome, isAi: true, createdAt: FieldValue.serverTimestamp() });

    res.json({
      welcome,
      message_id: result.id,
      already_welcomed: false,
    });

  } catch (err) {
    console.error('Welcome message error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
