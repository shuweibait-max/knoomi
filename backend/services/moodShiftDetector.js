// ============================================================
<<<<<<< HEAD
//  Knoomi — Mood Shift Detector
=======
//  MindBridge — Mood Shift Detector
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48
//  Location: /backend/services/moodShiftDetector.js
//
//  After each AI reply, this checks whether the user's emotional
//  state seems to have deteriorated during this conversation.
//  If it has, it inserts notifications for both the user and admin.
// ============================================================

const { GoogleGenAI } = require('@google/genai');
const ai              = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL           = 'gemini-2.5-flash';

// Only re-check after every N user messages to save API calls
const CHECK_EVERY_N_TURNS   = 4;
// Minimum messages needed before running the check
const MIN_TURNS_BEFORE_CHECK = 6;

<<<<<<< HEAD
const DETECTOR_SYSTEM_PROMPT = `You are a mental health signal analyzer for the Knoomi platform. Your job is to detect emotional deterioration during a conversation between a user and an AI companion.
=======
const DETECTOR_SYSTEM_PROMPT = `You are a mental health signal analyzer for the MindBridge platform. Your job is to detect emotional deterioration during a conversation between a user and an AI companion.
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48

You will be given the most recent chat messages. Analyze the trajectory of the user's emotional state — NOT their absolute mood, but how it has SHIFTED over the conversation.

Return ONLY a JSON object:
{
  "shift_detected": true | false,
  "severity": "info" | "concern" | "urgent",
  "from_mood": <estimated mood at start of window, 1-10>,
  "to_mood":   <estimated mood at end of window, 1-10>,
  "signals":   ["short phrase describing what shifted", ...max 3],
  "summary":   "One warm sentence (max 150 chars) written to the user acknowledging the shift."
}

Severity guide:
- "info"    — mild negative shift (drop of 1-2 points, or worry appearing)
- "concern" — notable shift (drop of 3+ points, hopelessness emerging, withdrawal)
- "urgent"  — crisis-level indicators (self-harm language, suicidal ideation, imminent danger)

Rules:
- Only flag genuine deterioration. Do not flag momentary vulnerability that resolves.
- If the user started distressed and is now calmer, shift_detected = false.
- If no meaningful shift, shift_detected = false with brief reason in "summary".
- The "summary" should be a warm, gentle observation, NOT a diagnosis. Example: "It sounds like this conversation has brought up some heavier feelings — would it help to slow down?"
- Output ONLY the JSON object. No markdown fencing. No preamble.`;


/**
 * Analyzes the recent chat history for emotional deterioration.
 * Returns null if no shift is detected, or an object with the shift details.
 */
async function detectMoodShift(historyMessages) {
  // Format messages for the detector prompt
  const transcript = historyMessages
    .slice(-12)
    .map(m => `${m.is_ai ? 'AI' : 'User'}: ${m.content}`)
    .join('\n');

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: `Analyze this conversation:\n\n${transcript}\n\nOutput JSON now.` }] }],
      config: {
        systemInstruction: DETECTOR_SYSTEM_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 300,
        responseMimeType: 'application/json',
      },
    });

    const raw = response.text?.trim() || '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.shift_detected) return null;

    // Validate & normalize
    return {
      severity:   ['info', 'concern', 'urgent'].includes(parsed.severity) ? parsed.severity : 'info',
      from_mood:  Math.max(1, Math.min(10, parseInt(parsed.from_mood) || 5)),
      to_mood:    Math.max(1, Math.min(10, parseInt(parsed.to_mood)   || 5)),
      signals:    Array.isArray(parsed.signals) ? parsed.signals.slice(0, 3) : [],
      summary:    String(parsed.summary || '').slice(0, 200),
    };
  } catch (err) {
    console.error('[moodShift] Analysis failed:', err.message);
    return null;
  }
}


/**
 * Decides whether it's time to run detection.
 * Runs every N user turns after a minimum baseline.
 */
function shouldRunDetection(historyMessages) {
  const userTurns = historyMessages.filter(m => !m.is_ai).length;
  if (userTurns < MIN_TURNS_BEFORE_CHECK) return false;
  return userTurns % CHECK_EVERY_N_TURNS === 0;
}


/**
 * Inserts notifications for the user AND for admin review.
 * Returns the user-facing notification so it can be attached to the chat response.
 */
async function createShiftNotifications(pool, userId, shift, isCrisis = false) {
  const severity = isCrisis ? 'urgent' : shift.severity;

  // ── User notification (gentle, supportive) ────────────────
  const userTitle = severity === 'urgent'
    ? 'I noticed you might be really struggling right now'
    : severity === 'concern'
    ? 'I noticed some heavier feelings coming up'
    : 'Just checking in';

  const userMeta = {
    from_mood: shift.from_mood,
    to_mood:   shift.to_mood,
    signals:   shift.signals,
  };

  await pool.query(
    `INSERT INTO notifications (user_id, audience, type, severity, title, message, metadata)
     VALUES (?, 'user', 'mood_shift', ?, ?, ?, ?)`,
    [userId, severity, userTitle, shift.summary, JSON.stringify(userMeta)]
  );

  // ── Admin notification (concise clinical log) ─────────────
  const adminTitle = `Mood shift detected — user ${userId}`;
  const adminMessage = `User ${userId} showed a ${severity} mood shift during AI chat. From ~${shift.from_mood}/10 to ~${shift.to_mood}/10. Signals: ${shift.signals.join(', ') || 'none'}. ${isCrisis ? '⚠️ CRISIS LANGUAGE DETECTED. Consider outreach.' : ''}`;

  await pool.query(
    `INSERT INTO notifications (user_id, audience, type, severity, title, message, metadata)
     VALUES (?, 'admin', 'mood_shift', ?, ?, ?, ?)`,
    [userId, severity, adminTitle, adminMessage, JSON.stringify({
      from_mood: shift.from_mood,
      to_mood:   shift.to_mood,
      signals:   shift.signals,
      is_crisis: isCrisis,
    })]
  );

  // Return the user notification data to attach to chat response
  return {
    severity,
    title:   userTitle,
    message: shift.summary,
  };
}


module.exports = {
  detectMoodShift,
  shouldRunDetection,
  createShiftNotifications,
};
