// ============================================================
//  MindBridge — Daily Mood Judgement Service
//  Location: /backend/services/moodJudge.js
//
//  Runs nightly at 00:00 (server time). For each user with any
//  activity that day (AI chat OR logged mood), Gemini reads the
//  full context and outputs { score: 1-10, note: '...' }.
//  The result overwrites the user's mood_entries for that day
//  (or inserts one if none existed).
// ============================================================

const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash';

const JUDGE_SYSTEM_PROMPT = `You are Mira's analytical partner — an assistant that reads a user's day of interactions with the MindBridge mental health platform and produces an honest, compassionate summary of their emotional state.

Your task:
Given (1) their chat messages with Mira today and (2) any mood scores they logged themselves today, produce a single JSON object with:
- "score": an integer 1-10 representing your best judgement of their overall mood that day, where:
    1-2  = severe distress, crisis-level
    3-4  = low, struggling
    5-6  = neutral, mixed
    7-8  = good, coping well
    9-10 = thriving, joyful
- "note": a short 1-2 sentence reflection (max 200 chars) written in second person to the user, warm and non-clinical. Example: "It sounds like today had some difficult moments around your studies, but you also showed real self-awareness." Never diagnose. Never mention specific chat quotes.

Rules:
- Weight the emotional tone of chat conversations heavily — they reveal more than a self-reported number.
- If the user's self-reported score contradicts their chat tone, trust the chat signal but stay close to the user's score (within 2 points).
- If there is very little data, be conservative — default toward the middle (5-6) unless clear signal exists.
- If crisis content was detected in chat, the score MUST be 1 or 2.
- Output ONLY the JSON object. No preamble. No markdown fencing. Just: {"score": N, "note": "..."}`;


/**
 * Judges a single user's mood for the given date using their day's data.
 * Returns { score, note } or null if there wasn't enough data to judge.
 */
async function judgeUserMoodForDay(pool, userId, date) {
  // Fetch AI chat messages for this user on this date
  const [chatRows] = await pool.query(
    `SELECT content, is_ai FROM messages
     WHERE sender_id = ?
       AND group_id IS NULL
       AND DATE(created_at) = DATE(?)
     ORDER BY created_at ASC`,
    [userId, date]
  );

  // Fetch any mood entries logged this day
  const [moodRows] = await pool.query(
    `SELECT score, note FROM mood_entries
     WHERE user_id = ?
       AND DATE(logged_at) = DATE(?)
     ORDER BY logged_at ASC`,
    [userId, date]
  );

  // Skip users with no activity at all today
  if (chatRows.length === 0 && moodRows.length === 0) {
    return null;
  }

  // Build the context payload sent to Gemini
  const chatTranscript = chatRows.length > 0
    ? chatRows
        .map(m => `${m.is_ai ? 'Mira' : 'User'}: ${m.content}`)
        .join('\n')
    : '(no chat messages today)';

  const loggedMoods = moodRows.length > 0
    ? moodRows
        .map(m => `Score ${m.score}/10${m.note ? ` — "${m.note}"` : ''}`)
        .join('\n')
    : '(no mood logged manually today)';

  const userPayload = `
=== USER'S CHAT WITH MIRA TODAY ===
${chatTranscript}

=== USER'S SELF-LOGGED MOOD SCORES TODAY ===
${loggedMoods}

Now output the JSON judgement.`.trim();

  // Call Gemini
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: userPayload }] }],
    config: {
      systemInstruction: JUDGE_SYSTEM_PROMPT,
      temperature: 0.3,          // Lower temp for consistent judgement
      maxOutputTokens: 200,
      responseMimeType: 'application/json',
    },
  });

  const raw = response.text?.trim() || '';

  // Parse JSON safely
  let parsed;
  try {
    // Strip any markdown fencing just in case the model ignored the rule
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error(`[moodJudge] Failed to parse JSON for user ${userId}:`, raw);
    return null;
  }

  const score = parseInt(parsed.score, 10);
  const note  = String(parsed.note || '').slice(0, 250);

  if (isNaN(score) || score < 1 || score > 10) {
    console.error(`[moodJudge] Invalid score for user ${userId}:`, parsed);
    return null;
  }

  return { score, note };
}


/**
 * Writes an AI-judged mood entry to the database.
 * If the user already has entries for this date, deletes them first
 * so the AI judgement is the single source of truth for that day.
 */
async function writeMoodJudgement(pool, userId, date, judgement) {
  // Delete any existing mood entries for this user on this date
  await pool.query(
    `DELETE FROM mood_entries
     WHERE user_id = ? AND DATE(logged_at) = DATE(?)`,
    [userId, date]
  );

  // Insert the AI-judged entry, dated to the target day
  await pool.query(
    `INSERT INTO mood_entries (user_id, score, note, logged_at)
     VALUES (?, ?, ?, ?)`,
    [userId, judgement.score, judgement.note, date]
  );
}


/**
 * Main entry: run the judgement for all active users for the given date.
 * If no date is passed, uses "yesterday" (which is what the midnight job wants).
 */
async function runDailyMoodJudgement(pool, targetDate = null) {
  const date = targetDate || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);   // yesterday, since job runs at 00:00
    d.setHours(23, 59, 59, 999);   // end of that day
    return d;
  })();

  console.log(`[moodJudge] Starting daily mood judgement for ${date.toISOString().slice(0, 10)}`);

  // Get all users who had activity on this date (chat OR mood)
  const [activeUsers] = await pool.query(
    `SELECT DISTINCT user_id FROM (
       SELECT sender_id AS user_id FROM messages
       WHERE group_id IS NULL AND DATE(created_at) = DATE(?)
       UNION
       SELECT user_id FROM mood_entries
       WHERE DATE(logged_at) = DATE(?)
     ) AS active`,
    [date, date]
  );

  console.log(`[moodJudge] Found ${activeUsers.length} active user(s) to judge.`);

  let succeeded = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const row of activeUsers) {
    const userId = row.user_id;
    try {
      const judgement = await judgeUserMoodForDay(pool, userId, date);
      if (!judgement) {
        skipped++;
        continue;
      }
      await writeMoodJudgement(pool, userId, date, judgement);
      succeeded++;
      console.log(`[moodJudge] ✓ user ${userId} → score ${judgement.score}/10`);
    } catch (err) {
      failed++;
      console.error(`[moodJudge] ✗ user ${userId}:`, err.message);
    }
  }

  console.log(`[moodJudge] Done. Succeeded: ${succeeded}, Skipped: ${skipped}, Failed: ${failed}`);
  return { succeeded, skipped, failed };
}


module.exports = {
  runDailyMoodJudgement,
  judgeUserMoodForDay,
  writeMoodJudgement,
};
