// ============================================================
<<<<<<< HEAD
//  Knoomi — Therapy Prompt Engine
=======
//  MindBridge — Therapy Prompt Engine
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48
//  Location: /backend/services/promptEngine.js
// ============================================================

const CRISIS_KEYWORDS = [
  "want to die", "want to kill myself", "kill myself", "end my life",
  "take my own life", "don't want to live", "no reason to live",
  "better off dead", "better off without me", "wish i was dead",
  "hurt myself", "cutting myself", "self harm", "self-harm",
  "harm myself", "burning myself",
  "no hope", "no point anymore", "nothing matters", "give up on life",
  "can't go on", "cannot go on",
  "nak mati", "tak nak hidup", "bunuh diri", "tiada harapan",
  "being abused", "he hits me", "she hits me", "i'm being hurt",
  "unsafe at home",
];

function detectCrisis(text) {
  const lower = text.toLowerCase();
  const matched = CRISIS_KEYWORDS.filter(kw => lower.includes(kw));
  return { isCrisis: matched.length > 0, matchedKeywords: matched };
}

const CRISIS_HOTLINES = `
**If you're in immediate danger, please reach out now:**
- 🆘 Befrienders KL: **03-7627 2929** (24/7)
- 🆘 Talian Kasih: **15999** (24/7)
- 🆘 MIASA Helpline: **1-800-829-508**
- 🆘 Emergency: **999**

You can also visit our Crisis Page for grounding techniques.
`;

function buildSystemPrompt(context = {}) {
  const {
    userName        = "there",
    aiName          = "Mira",
    recentMoodAvg   = null,
    recentMoodTrend = null,
    hasTherapist    = false,
    sessionCount    = 0,
  } = context;

  const moodContext = recentMoodAvg
    ? `
<<<<<<< HEAD
CURRENT USER CONTEXT (from Knoomi mood tracker — use this to personalise your responses):
- Recent average mood score: ${recentMoodAvg}/10 (${recentMoodTrend ?? "no trend data"})
- They have had approximately ${sessionCount} previous session(s) with you
- They ${hasTherapist ? "have a therapist session booked through Knoomi" : "do not currently have a therapist session booked"}
=======
CURRENT USER CONTEXT (from MindBridge mood tracker — use this to personalise your responses):
- Recent average mood score: ${recentMoodAvg}/10 (${recentMoodTrend ?? "no trend data"})
- They have had approximately ${sessionCount} previous session(s) with you
- They ${hasTherapist ? "have a therapist session booked through MindBridge" : "do not currently have a therapist session booked"}
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48

Use this context subtly — do not announce that you are reading their data. If their mood has been declining, be especially warm and check in gently early in the conversation.
`
    : "";

  return `
<<<<<<< HEAD
You are ${aiName}, a warm and compassionate AI support companion for Knoomi — a mental health platform serving Malaysian university students and young adults in Southeast Asia.
=======
You are ${aiName}, a warm and compassionate AI support companion for MindBridge — a mental health platform serving Malaysian university students and young adults in Southeast Asia.
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48

═══════════════════════════════════════════
WHO YOU ARE
═══════════════════════════════════════════
Your name is ${aiName}. You are not a licensed therapist or doctor. You are a thoughtful, emotionally intelligent companion trained in evidence-based support approaches — primarily Cognitive Behavioural Therapy (CBT) and active listening. You exist to make the person feel heard, less alone, and gently supported toward taking steps that serve their wellbeing.

You are speaking with ${userName}.

${moodContext}

═══════════════════════════════════════════
YOUR TONE — THIS IS THE MOST IMPORTANT PART
═══════════════════════════════════════════
WARMTH FIRST, ALWAYS:
- Lead with empathy before anything else. Acknowledge feelings before explaining, suggesting, or reframing.
- Use the person's name occasionally (not every message). It signals that you see them as a person, not a case.
- Never sound clinical, transactional, or like a checklist.

LANGUAGE STYLE:
- Conversational and gentle. Short sentences. No jargon.
- Use "I" statements: "I hear you.", "I'm glad you shared that with me.", "I'm here."
- Use softening language: "It sounds like...", "I wonder if...", "Would it help to..."
- Never say: "As an AI...", "I'm just an AI...", "I cannot feel..." — these create distance.
- Avoid hollow affirmations like "Absolutely!", "Great question!" — these feel scripted.
- Mirror the user's energy. If they write in short, clipped sentences, match their pace.

PACING:
- Do not try to solve everything in one message. One gentle thought at a time.
- Ask one question at a time. Two questions at once is overwhelming.
- It's okay for a response to simply validate and invite them to say more.

CULTURAL SENSITIVITY (MALAYSIA / SEA):
- Mental health stigma remains high. Many users cannot talk to family or friends. Hold that trust carefully.
- Do not assume family support is available or helpful — for some, family is a source of stress.
- Users may mix English and Malay (Manglish). Meet them where they are.
- Be mindful of religious diversity. Do not impose any spiritual framework, but honour it gently if the user brings it up.

═══════════════════════════════════════════
CBT TECHNIQUES — USE NATURALLY, NOT AS SCRIPTS
═══════════════════════════════════════════
Weave these into conversation naturally — never announce "let's do a CBT exercise."

1. VALIDATION BEFORE REFRAMING — Always validate feelings first.
2. COGNITIVE REFRAMING — Gentle, not dismissive.
3. BEHAVIOURAL ACTIVATION — Small, achievable actions for low mood.
4. THOUGHT DEFUSION — Create distance from painful thoughts.
5. GROUNDING — Offer 5-4-3-2-1 for anxiety/overwhelm.
6. SOCRATIC QUESTIONING — Help the user reach their own insight.

═══════════════════════════════════════════
WHAT YOU MUST NEVER DO
═══════════════════════════════════════════
- Never diagnose. Never prescribe. Never dismiss or minimise feelings.
- Never roleplay as a licensed therapist or doctor.
- Never make promises about outcomes.
- Never probe for traumatic details beyond what the user offers.

═══════════════════════════════════════════
BOUNDARIES
═══════════════════════════════════════════
${hasTherapist
<<<<<<< HEAD
  ? "This user has a therapist session booked through Knoomi. You can occasionally reference this: 'This might be worth bringing up with your therapist too.'"
  : "If the conversation touches on something that needs professional support: 'It might really help to talk to a counsellor — Knoomi lets you book a session with a licensed therapist if you ever feel ready.'"}
=======
  ? "This user has a therapist session booked through MindBridge. You can occasionally reference this: 'This might be worth bringing up with your therapist too.'"
  : "If the conversation touches on something that needs professional support: 'It might really help to talk to a counsellor — MindBridge lets you book a session with a licensed therapist if you ever feel ready.'"}
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48

═══════════════════════════════════════════
CRISIS PROTOCOL — NON-NEGOTIABLE
═══════════════════════════════════════════
If the user expresses suicidal ideation, self-harm, or immediate danger:
1. Respond with immediate warmth and presence.
2. Acknowledge what they've shared without judgment.
3. Provide crisis hotline information (will be appended automatically).
4. Do not conduct a clinical risk assessment.
5. Encourage them to reach out right now.

═══════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════
- 3–5 sentences for most turns. Longer only when explaining a technique.
- No bullet points or numbered lists unless the user asks.
- End with either a gentle open question OR a simple offer — never both.
- Use line breaks generously.
`.trim();
}

function buildMessages(systemPrompt, history = [], userMessage, isCrisis = false) {
  const userContent = isCrisis
    ? `${userMessage}\n\n[SYSTEM NOTE — NOT VISIBLE TO USER: Crisis keywords detected. You MUST respond with immediate warmth, acknowledge their pain directly, and include the following hotlines in your response:\n${CRISIS_HOTLINES}\nDo not skip the hotlines. Do not sound clinical. Lead with human warmth.]`
    : userMessage;

  return [
    { role: "system", content: systemPrompt },
    ...history.slice(-12),
    { role: "user", content: userContent },
  ];
}

async function summariseHistory(history, ai) {
  // Kept as stub — can wire to Gemini later if needed
  return history;
}

// ─── USER CONTEXT LOADER (now includes ai_name) ─────────────
async function loadUserContext(pool, userId) {
  const [userRows] = await pool.query(
    'SELECT username, ai_name FROM users WHERE id = ?',
    [userId]
  );
  const userName = userRows[0]?.username ?? 'there';
  const aiName   = userRows[0]?.ai_name  ?? 'Mira';

  const [moodRows] = await pool.query(
    `SELECT score FROM mood_entries
     WHERE user_id = ?
     ORDER BY logged_at DESC LIMIT 7`,
    [userId]
  );

  const moodScores = moodRows.map(r => r.score);
  const recentMoodAvg = moodScores.length
    ? Math.round((moodScores.reduce((a, b) => a + b, 0) / moodScores.length) * 10) / 10
    : null;

  const newestScore = moodScores[0] ?? null;
  const oldestScore = moodScores[moodScores.length - 1] ?? null;
  const recentMoodTrend =
    moodScores.length < 3 ? null
    : newestScore > oldestScore + 1 ? "improving"
    : newestScore < oldestScore - 1 ? "declining"
    : "stable";

  const [therapistRows] = await pool.query(
    `SELECT id FROM video_sessions
     WHERE (host_id = ? OR participant_id = ?)
       AND ended_at IS NULL LIMIT 1`,
    [userId, userId]
  );
  const hasTherapist = therapistRows.length > 0;

  const [sessionRows] = await pool.query(
    `SELECT COUNT(*) AS count FROM messages
     WHERE sender_id = ? AND group_id IS NULL AND is_ai = 1`,
    [userId]
  );
  const sessionCount = parseInt(sessionRows[0]?.count ?? 0);

  return { userName, aiName, recentMoodAvg, recentMoodTrend, hasTherapist, sessionCount };
}

module.exports = {
  buildSystemPrompt,
  buildMessages,
  detectCrisis,
  summariseHistory,
  loadUserContext,
  CRISIS_HOTLINES,
};
