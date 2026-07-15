// ============================================================
//  Knoomi — Daily Mood Judgement Service
//  Location: /backend/services/moodJudge.js
//
//  Runs nightly at 00:00 (server time). For each user with any
//  activity that day (AI chat OR logged mood), Gemini reads the
//  full context and outputs { score: 1-10, note: '...' }.
//  The result overwrites the user's mood entries for that day
//  (or inserts one if none existed).
// ============================================================

const { GoogleGenAI } = require('@google/genai');
const { admin } = require('../config/firebase');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash';

const JUDGE_SYSTEM_PROMPT = `You are Mira's analytical partner — an assistant that reads a user's day of interactions with the Knoomi mental health platform and produces an honest, compassionate summary of their emotional state.

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

// Firestore range queries need concrete boundary Dates rather than SQL's
// DATE(logged_at) = DATE(?) truncation — this derives the same UTC calendar
// day boundaries from whatever Date is passed in.
function dayRangeUTC(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const end   = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  return { start, end };
}


/**
 * Judges a single user's mood for the given date using their day's data.
 * Returns { score, note } or null if there wasn't enough data to judge.
 */
async function judgeUserMoodForDay(db, uid, date) {
  const { start, end } = dayRangeUTC(date);

  // Fetch AI chat messages for this user on this date
  const chatSnap = await db.collection('users').doc(uid).collection('aiMessages')
    .where('createdAt', '>=', start).where('createdAt', '<=', end)
    .orderBy('createdAt', 'asc').get();

  // Fetch any mood entries logged this day
  const moodSnap = await db.collection('users').doc(uid).collection('moodEntries')
    .where('loggedAt', '>=', start).where('loggedAt', '<=', end)
    .orderBy('loggedAt', 'asc').get();

  // Skip users with no activity at all today
  if (chatSnap.empty && moodSnap.empty) {
    return null;
  }

  // Build the context payload sent to Gemini
  const chatTranscript = !chatSnap.empty
    ? chatSnap.docs
        .map(d => `${d.data().isAi ? 'Mira' : 'User'}: ${d.data().content}`)
        .join('\n')
    : '(no chat messages today)';

  const loggedMoods = !moodSnap.empty
    ? moodSnap.docs
        .map(d => `Score ${d.data().score}/10${d.data().note ? ` — "${d.data().note}"` : ''}`)
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
    console.error(`[moodJudge] Failed to parse JSON for user ${uid}:`, raw);
    return null;
  }

  const score = parseInt(parsed.score, 10);
  const note  = String(parsed.note || '').slice(0, 250);

  if (isNaN(score) || score < 1 || score > 10) {
    console.error(`[moodJudge] Invalid score for user ${uid}:`, parsed);
    return null;
  }

  return { score, note };
}


/**
 * Writes an AI-judged mood entry to Firestore.
 * If the user already has entries for this date, deletes them first
 * so the AI judgement is the single source of truth for that day.
 */
async function writeMoodJudgement(db, uid, date, judgement) {
  const { start, end } = dayRangeUTC(date);
  const moodRef = db.collection('users').doc(uid).collection('moodEntries');

  const existingSnap = await moodRef.where('loggedAt', '>=', start).where('loggedAt', '<=', end).get();

  const batch = db.batch();
  existingSnap.docs.forEach(doc => batch.delete(doc.ref));
  batch.set(moodRef.doc(), {
    score: judgement.score,
    note: judgement.note,
    loggedAt: admin.firestore.Timestamp.fromDate(date),
  });
  await batch.commit();
}


/**
 * Finds every user with AI chat or mood activity on the given date.
 * Iterates all users rather than a collection-group query, since a
 * collection-group query here would need a manually provisioned Firestore
 * index that isn't available in this environment — acceptable at this
 * app's current user-count scale.
 */
async function findActiveUids(db, date) {
  const { start, end } = dayRangeUTC(date);
  const usersSnap = await db.collection('users').get();
  const activeUids = [];

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const [chatSnap, moodSnap] = await Promise.all([
      db.collection('users').doc(uid).collection('aiMessages')
        .where('createdAt', '>=', start).where('createdAt', '<=', end).limit(1).get(),
      db.collection('users').doc(uid).collection('moodEntries')
        .where('loggedAt', '>=', start).where('loggedAt', '<=', end).limit(1).get(),
    ]);
    if (!chatSnap.empty || !moodSnap.empty) activeUids.push(uid);
  }
  return activeUids;
}


/**
 * Main entry: run the judgement for all active users for the given date.
 * If no date is passed, uses "yesterday" (which is what the midnight job wants).
 */
async function runDailyMoodJudgement(db, targetDate = null) {
  const date = targetDate || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);   // yesterday, since job runs at 00:00
    d.setHours(23, 59, 59, 999);   // end of that day
    return d;
  })();

  console.log(`[moodJudge] Starting daily mood judgement for ${date.toISOString().slice(0, 10)}`);

  const activeUids = await findActiveUids(db, date);
  console.log(`[moodJudge] Found ${activeUids.length} active user(s) to judge.`);

  let succeeded = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const uid of activeUids) {
    try {
      const judgement = await judgeUserMoodForDay(db, uid, date);
      if (!judgement) {
        skipped++;
        continue;
      }
      await writeMoodJudgement(db, uid, date, judgement);
      succeeded++;
      console.log(`[moodJudge] ✓ user ${uid} → score ${judgement.score}/10`);
    } catch (err) {
      failed++;
      console.error(`[moodJudge] ✗ user ${uid}:`, err.message);
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
