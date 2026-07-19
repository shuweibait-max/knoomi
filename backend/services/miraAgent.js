// ============================================================
//  Mira Agent — 6-stage pipeline
//  Location: /backend/services/miraAgent.js
//
//  inbound message
//    → [1] SAFETY GATE   deterministic regex, pre-agent, non-overridable
//    → [2] PERCEIVE      long-term memory + session history + therapist status (parallel)
//    → [3] PLAN          cheap model classifies turn intent
//    → [4] ACT           bounded tool loop, parallel tool calls
//    → [5] REFLECT       cheap model reviews draft against tone/safety rules, rewrites once if failed
//    → [6] CONSOLIDATE   extract durable facts → miraMemory (async, non-blocking)
//
//  Replaces the old promptEngine.js (single reactive call, no tools, no memory).
//
//  Data layer note: this app has no Postgres — everything lives in Firestore
//  (migrated earlier this project). The schema this stage introduces:
//
//    users/{uid}/miraMemory/{factId}   — durable facts Mira has learned.
//      factId is a deterministic hash of the fact text, which is what gives
//      us UNIQUE(user_id, fact) without a read-then-write transaction: the
//      same fact text always resolves to the same doc, so a repeat
//      extraction overwrites (bumping confidence/updatedAt) instead of
//      duplicating. Being a subcollection under users/{uid} means it is
//      deleted for free by whatever recursive-delete step handles account
//      deletion — the Firestore equivalent of ON DELETE CASCADE.
//      Fields: fact, kind (situation|relationship|preference|coping|trigger),
//      confidence (0-1), sessionId, createdAt, updatedAt.
//
//    crisisFlags/{id}   — top-level collection, NOT under users/{uid}, so it
//      stays independently auditable from chat content and isn't swept up
//      in a user-initiated account deletion the way miraMemory should be.
//      Fields: userId, sessionId, matchedKeywords (array), reviewedBy,
//      reviewedAt, createdAt.
//
//    users/{uid}/aiMessages/{id}   — existing collection, now also gets an
//      `intent` field per assistant message (the Firestore equivalent of
//      adding an `intent` column to ai_conversations).
//
//  Firestore security rules for miraMemory/crisisFlags are in firestore.rules
//  — republish that file the same way as before for these to take effect.
// ============================================================

const crypto = require('crypto');
const { GoogleGenAI } = require('@google/genai');
const { admin } = require('../config/firebase');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const FieldValue = admin.firestore.FieldValue;

// ── CFG — every tunable lives here ──────────────────────────────────────────
// MODEL_PLAN/MODEL_REFLECT are intentionally the same as MODEL_ACT rather
// than a cheaper "lite" tier: this project's Gemini API key has zero quota
// on the 2.0 model family and is blocked from gemini-2.5-flash-lite ("no
// longer available to new users"), and gemini-2.5-flash is the only tier
// confirmed working end-to-end. Swap these independently once a key with
// broader model access is available — nothing else in the pipeline assumes
// they're equal.
const CFG = {
  MODEL_ACT: 'gemini-2.5-flash',
  MODEL_PLAN: 'gemini-2.5-flash',
  MODEL_REFLECT: 'gemini-2.5-flash',
  MAX_TOOL_TURNS: 4,
  TEMPERATURE: 0.75,
  HISTORY_WINDOW: 12,
  MEMORY_FACT_LIMIT: 12,
  TOOL_TIMEOUT_MS: 4000,
  REFLECTION_ENABLED: true,
  SESSION_GAP_MS: 30 * 60 * 1000, // 30 min of inactivity starts a new session
};

const INTENTS = ['LISTEN', 'PROBE', 'TECHNIQUE', 'DATA', 'CONNECT', 'CRISIS'];
const MEMORY_KINDS = ['situation', 'relationship', 'preference', 'coping', 'trigger'];

const FALLBACK_MESSAGE = "I'm here — could you tell me a bit more about what's on your mind?";

// ============================================================
//  STAGE 1 — SAFETY GATE (deterministic, non-overridable)
// ============================================================
// This is regex only, on purpose. The LLM never decides whether someone is
// in crisis — every downstream stage just reacts to the boolean this
// produces.
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

const CRISIS_HOTLINES = `
**If you're in immediate danger, please reach out now:**
- 🆘 Befrienders KL: **03-7627 2929** (24/7)
- 🆘 Talian Kasih: **15999** (24/7)
- 🆘 MIASA Helpline: **1-800-829-508**
- 🆘 Emergency: **999**

You can also visit our Crisis Page for grounding techniques.
`;

function safetyGate(text) {
  const lower = text.toLowerCase();
  const matched = CRISIS_KEYWORDS.filter(kw => lower.includes(kw));
  return { isCrisis: matched.length > 0, matchedKeywords: matched };
}

// Appended last, unconditionally, whenever isCrisis is true — whether the
// pipeline below succeeded or crashed. No planner, tool, or reflection pass
// can strip it because none of them ever see this step.
function appendHotlinesIfMissing(reply) {
  const text = reply && reply.trim() ? reply : "I'm here with you right now.";
  if (text.includes('Befrienders') || text.includes('Talian Kasih')) return text;
  return `${text}\n\n---\n${CRISIS_HOTLINES}`;
}

async function logCrisisFlag(db, uid, sessionId, matchedKeywords) {
  try {
    await db.collection('crisisFlags').add({
      userId: uid,
      sessionId,
      matchedKeywords,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[miraAgent] failed to log crisis flag:', err.message);
  }
}


// ============================================================
//  STAGE 2 — PERCEIVE (parallel loads)
// ============================================================
async function hasActiveTherapistSession(db, uid) {
  const [hostSnap, participantSnap] = await Promise.all([
    db.collection('videoSessions').where('hostId', '==', uid).get(),
    db.collection('videoSessions').where('participantId', '==', uid).get(),
  ]);
  const isActive = doc => !doc.data().endedAt;
  return hostSnap.docs.some(isActive) || participantSnap.docs.some(isActive);
}

async function perceive(db, uid) {
  const aiMessagesRef = db.collection('users').doc(uid).collection('aiMessages');

  const [userDoc, memorySnap, historySnap, hasTherapist] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('users').doc(uid).collection('miraMemory')
      .orderBy('confidence', 'desc').limit(CFG.MEMORY_FACT_LIMIT).get(),
    aiMessagesRef.orderBy('createdAt', 'desc').limit(CFG.HISTORY_WINDOW).get(),
    hasActiveTherapistSession(db, uid),
  ]);

  const user = userDoc.data() || {};
  const memory = memorySnap.docs.map(d => d.data());
  const historyDocsAsc = [...historySnap.docs].reverse();
  const history = historyDocsAsc.map(d => ({
    role: d.data().isAi ? 'assistant' : 'user',
    content: d.data().content,
  }));

  // Session continuity: reuse the last message's sessionId if we're still
  // inside the inactivity gap, otherwise start a new one.
  const lastDoc = historyDocsAsc[historyDocsAsc.length - 1];
  const lastData = lastDoc?.data();
  const lastTime = lastData?.createdAt?.toMillis?.() || 0;
  const sessionId = (lastData?.sessionId && (Date.now() - lastTime) < CFG.SESSION_GAP_MS)
    ? lastData.sessionId
    : `sess_${uid}_${Date.now()}`;

  return {
    uid,
    userName: user.username || 'there',
    aiName: user.ai_name || 'Mira',
    memory,
    history,
    hasTherapist,
    sessionId,
  };
}


// ============================================================
//  STAGE 3 — PLAN (cheap model classifies turn intent)
// ============================================================
async function plan(perceived, message) {
  const prompt = `Classify the user's turn intent for a mental-health support chat. Pick exactly ONE of:
- LISTEN: they are sharing feelings, venting, or describing a problem, and mainly need to feel heard — not advice, not questions, not a fix. This is the DEFAULT for emotional disclosures.
- PROBE: they've shared something ambiguous where one gentle clarifying question would help before anything else.
- TECHNIQUE: they are explicitly asking for a coping tool/exercise, or have clearly said they're ready to try something concrete.
- DATA: they are explicitly asking a factual question about their OWN history — e.g. "how has my mood been", "what's my trend been like". This is a direct question, not a feeling being shared.
- CONNECT: they are explicitly asking to be connected to a peer support group or a therapist — e.g. "is there a group for X", "can you connect me with someone", "I'd like to talk to a therapist". This is a direct request, not a feeling being shared.
- CRISIS: severe distress language a keyword filter may have missed the nuance of. Rare.

The LISTEN bias is specifically about NOT jumping to TECHNIQUE (unsolicited advice) when someone is venting — most people want to feel understood before they want a fix. It does NOT mean ignoring a direct, explicit question or request: if the user is plainly asking for their data (DATA) or asking to be connected to something concrete (CONNECT), classify it as that, even if the message also contains some feeling words.

Recent conversation:
${perceived.history.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n') || '(no prior messages)'}

Latest message: "${message}"

Respond with ONLY the intent word.`;

  try {
    const response = await ai.models.generateContent({
      model: CFG.MODEL_PLAN,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.1, maxOutputTokens: 10 },
    });
    const raw = (response.text || '').trim().toUpperCase();
    return INTENTS.includes(raw) ? raw : 'LISTEN';
  } catch (err) {
    console.error('[miraAgent] plan failed, defaulting to LISTEN:', err.message);
    return 'LISTEN';
  }
}


// ============================================================
//  Persona / system prompt
// ============================================================
function buildSystemPrompt(perceived, intent) {
  const { userName, aiName, memory, hasTherapist } = perceived;

  const memoryBlock = memory.length
    ? `\nWhat you remember about ${userName} (use naturally, never announce you're "recalling" this):\n${memory.map(m => `- (${m.kind}) ${m.fact}`).join('\n')}\n`
    : '';

  const intentGuidance = {
    LISTEN: 'Right now, just be with them. Validate. Do not suggest a technique or ask a probing question unless it emerges naturally — presence is the whole job this turn.',
    PROBE: 'Ask ONE gentle, curious clarifying question to understand more. Nothing else.',
    TECHNIQUE: 'They are ready for a concrete tool. Offer ONE small technique (grounding, reframing, behavioural activation) — never a list of options.',
    DATA: 'They are asking about their own history. Use the get_mood_history tool before answering — do not guess.',
    CONNECT: 'They want to be connected to people. Use find_peer_room or find_therapist before answering — do not guess at what is available.',
    CRISIS: 'Respond with immediate warmth and presence. Acknowledge what they shared without judgment. Do not conduct a risk assessment — crisis hotlines are appended automatically after your reply.',
  }[intent] || '';

  return `
You are ${aiName}, a warm and compassionate AI support companion for Knoomi — a mental health platform serving Malaysian university students and young adults in Southeast Asia. Your name comes from "know me" — your entire purpose is making ${userName} feel known.

You are speaking with ${userName}.
${memoryBlock}
${hasTherapist ? "This user has a therapist session booked through Knoomi. You can occasionally reference this: 'This might be worth bringing up with your therapist too.'" : ''}

THIS TURN'S FOCUS: ${intentGuidance}

TOOL USE (applies regardless of the focus above): if the user asks a factual question about their own mood history, or asks to be connected to a peer group or a therapist, always call the matching tool before answering — never guess or invent what's available.

═══════════════════════════════════════════
TONE — THE MOST IMPORTANT PART
═══════════════════════════════════════════
- Warmth before advice, always. Validate before explaining, suggesting, or reframing.
- 3–5 sentences. Short sentences, plain words, generous line breaks.
- End with ONE gentle question OR one simple offer — never both.
- No bullet points or numbered lists — this is a conversation, not a report.
- Never say "As an AI" or "I'm just an AI" — these create distance.
- No hollow affirmations ("Absolutely!", "Great question!") — they feel scripted.
- Mirror the user's energy. Short, clipped messages often mean distress — don't flood them with a wall of text in response.
- Never diagnose, prescribe, promise outcomes, or minimise what they're feeling.
- Never roleplay as a licensed therapist or doctor. Never probe for traumatic details beyond what they offer.

CULTURAL CONTEXT (Malaysia / SEA): mental health stigma remains high — many users cannot talk to anyone else about this. Don't assume family is a source of support; for some it's the opposite. Users may mix English and Malay — meet them where they are.
`.trim();
}


// ============================================================
//  Tools — read freely, write only with confirmation, never delete
// ============================================================
async function toolGetMoodHistory(db, uid, { days = 14 } = {}) {
  const since = new Date(Date.now() - Math.max(1, Number(days) || 14) * 24 * 60 * 60 * 1000);
  const snap = await db.collection('users').doc(uid).collection('moodEntries')
    .where('loggedAt', '>=', since).get();
  const entries = snap.docs.map(d => d.data());
  if (!entries.length) return { avg: null, trend: null, count: 0 };

  const scores = entries.map(e => e.score);
  const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  const sorted = [...entries].sort((a, b) => (a.loggedAt?.toMillis?.() || 0) - (b.loggedAt?.toMillis?.() || 0));
  const first = sorted[0].score;
  const last = sorted[sorted.length - 1].score;
  const trend = sorted.length < 3 ? 'insufficient_data'
    : last > first + 1 ? 'improving'
    : last < first - 1 ? 'declining'
    : 'stable';

  return { avg, trend, count: entries.length };
}

async function toolFindPeerRoom(db, _uid, { topic } = {}) {
  let query = db.collection('groups').where('isPrivate', '==', false);
  if (topic) query = query.where('topic', '==', topic);
  const snap = await query.limit(5).get();
  return snap.docs.map(d => ({
    id: d.id,
    name: d.data().name,
    topic: d.data().topic,
    memberCount: d.data().memberCount || 0,
  }));
}

async function toolFindTherapist(db, _uid, { specialisation, language } = {}) {
  // `specialisation`/`language` aren't fields on the user schema yet — this
  // filters defensively so requests for them return an empty list rather
  // than crashing, until that profile data actually exists.
  const snap = await db.collection('users').where('role', '==', 'therapist').limit(20).get();
  let therapists = snap.docs.map(d => ({
    id: d.id,
    username: d.data().username,
    specialisation: d.data().specialisation || null,
    language: d.data().language || null,
  }));
  if (specialisation) therapists = therapists.filter(t => t.specialisation === specialisation);
  if (language) therapists = therapists.filter(t => t.language === language);
  return therapists.slice(0, 5);
}

// Never writes — returns a proposal only. The frontend shows a confirm chip
// and the actual write happens through the existing, already-authenticated
// POST /api/mood route if and only if the user confirms.
async function toolProposeMoodLog(_db, _uid, { score, tags = [], note = '' } = {}) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore) || numericScore < 1 || numericScore > 10) {
    return { error: 'score must be between 1 and 10' };
  }
  return { proposal: true, score: numericScore, tags: Array.isArray(tags) ? tags : [], note: String(note || '') };
}

const TOOLS = {
  get_mood_history: toolGetMoodHistory,
  find_peer_room: toolFindPeerRoom,
  find_therapist: toolFindTherapist,
  propose_mood_log: toolProposeMoodLog,
};

const TOOL_DECLARATIONS = [
  {
    name: 'get_mood_history',
    description: "Get the user's mood history (average, trend, entry count) to ground a response in fact rather than guessing.",
    parameters: {
      type: 'OBJECT',
      properties: { days: { type: 'NUMBER', description: 'How many days back to look. Default 14.' } },
    },
  },
  {
    name: 'find_peer_room',
    description: 'Find public peer support group rooms, optionally filtered by topic.',
    parameters: {
      type: 'OBJECT',
      properties: { topic: { type: 'STRING', description: 'e.g. Anxiety, Depression, Grief, Stress, Relationships, Addiction' } },
    },
  },
  {
    name: 'find_therapist',
    description: 'Find an available therapist on the platform.',
    parameters: {
      type: 'OBJECT',
      properties: {
        specialisation: { type: 'STRING' },
        language: { type: 'STRING' },
      },
    },
  },
  {
    name: 'propose_mood_log',
    description: "Propose logging a mood entry on the user's behalf based on what they've shared. This does NOT save anything — it only returns a proposal that the UI will ask the user to confirm before anything is written.",
    parameters: {
      type: 'OBJECT',
      properties: {
        score: { type: 'NUMBER', description: '1-10' },
        tags: { type: 'ARRAY', items: { type: 'STRING' } },
        note: { type: 'STRING' },
      },
      required: ['score'],
    },
  },
];

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`tool "${label}" timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}


// ============================================================
//  STAGE 4 — ACT (bounded tool loop, parallel tool calls)
// ============================================================
async function act(db, uid, perceived, message, intent) {
  const systemPrompt = buildSystemPrompt(perceived, intent);
  const contents = [
    ...perceived.history.slice(-CFG.HISTORY_WINDOW).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  const toolTrace = [];
  let moodProposal = null;

  const genConfig = {
    systemInstruction: systemPrompt,
    temperature: CFG.TEMPERATURE,
    maxOutputTokens: 600,
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
  };

  for (let turn = 0; turn < CFG.MAX_TOOL_TURNS; turn++) {
    const response = await ai.models.generateContent({ model: CFG.MODEL_ACT, contents, config: genConfig });
    const calls = response.functionCalls || [];

    if (!calls.length) {
      return { reply: response.text?.trim() || FALLBACK_MESSAGE, toolTrace, moodProposal };
    }

    contents.push({ role: 'model', parts: calls.map(c => ({ functionCall: { name: c.name, args: c.args } })) });

    // Bounded + parallel: every call in this turn runs concurrently, each
    // with its own timeout, and a failing/slow tool never blocks the others.
    const results = await Promise.all(calls.map(async (call) => {
      const fn = TOOLS[call.name];
      const started = Date.now();
      try {
        if (!fn) throw new Error(`unknown tool "${call.name}"`);
        const result = await withTimeout(fn(db, uid, call.args || {}), CFG.TOOL_TIMEOUT_MS, call.name);
        toolTrace.push({ name: call.name, args: call.args, ms: Date.now() - started, ok: true });
        if (call.name === 'propose_mood_log' && result?.proposal) moodProposal = result;
        return { name: call.name, response: result };
      } catch (err) {
        toolTrace.push({ name: call.name, args: call.args, ms: Date.now() - started, ok: false, error: err.message });
        return { name: call.name, response: { error: err.message } };
      }
    }));

    contents.push({
      role: 'user',
      parts: results.map(r => ({ functionResponse: { name: r.name, response: r.response } })),
    });
  }

  // MAX_TOOL_TURNS exceeded — force a final answer with tools disabled so
  // the model can't keep looping.
  const finalResponse = await ai.models.generateContent({
    model: CFG.MODEL_ACT,
    contents,
    config: { systemInstruction: systemPrompt, temperature: CFG.TEMPERATURE, maxOutputTokens: 600 },
  });
  return { reply: finalResponse.text?.trim() || FALLBACK_MESSAGE, toolTrace, moodProposal };
}

// Crisis path: no tool loop, no planning nuance — just a fast, warm,
// direct response. Speed matters more than tool access in this moment.
async function actCrisis(perceived, message, matchedKeywords) {
  const systemPrompt = buildSystemPrompt(perceived, 'CRISIS');
  const userContent = `${message}\n\n[SYSTEM NOTE — NOT VISIBLE TO USER: Crisis keywords detected (${matchedKeywords.join(', ')}). Respond with immediate warmth, acknowledge their pain directly. Do not sound clinical. Do not list hotlines yourself — they are appended automatically after your reply.]`;

  try {
    const response = await ai.models.generateContent({
      model: CFG.MODEL_ACT,
      contents: [
        ...perceived.history.slice(-6).map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        { role: 'user', parts: [{ text: userContent }] },
      ],
      config: { systemInstruction: systemPrompt, temperature: CFG.TEMPERATURE, maxOutputTokens: 400 },
    });
    return response.text?.trim() || "I'm really glad you reached out. What you're feeling right now matters — you don't have to face this alone.";
  } catch (err) {
    console.error('[miraAgent] actCrisis model call failed:', err.message);
    return "I'm really glad you reached out. What you're feeling right now matters — you don't have to face this alone.";
  }
}


// ============================================================
//  STAGE 5 — REFLECT (skipped entirely during crisis)
// ============================================================
async function reflect(draftReply) {
  const prompt = `You are reviewing a draft reply from Mira, a warm AI mental-health companion, before it is sent. Check it against these rules:
- Warmth before advice — validates before explaining/suggesting/reframing
- 3-5 sentences, short sentences, plain words
- Ends with ONE gentle question OR one simple offer — never both
- No bullet points or numbered lists
- Never says "As an AI" / "I'm just an AI"
- No hollow affirmations ("Absolutely!", "Great question!")
- Never diagnoses, prescribes, or promises outcomes

Draft reply:
"""
${draftReply}
"""

If it already follows every rule, respond with exactly: PASS
Otherwise, rewrite it to fix the violations while preserving its core message and warmth. Respond with ONLY the rewritten reply — no preamble, no explanation, no quotes around it.`;

  try {
    const response = await ai.models.generateContent({
      model: CFG.MODEL_REFLECT,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.3, maxOutputTokens: 300 },
    });
    const out = response.text?.trim();
    if (!out || out.toUpperCase() === 'PASS') return draftReply;
    return out;
  } catch (err) {
    console.error('[miraAgent] reflect failed, using draft as-is:', err.message);
    return draftReply; // fail open — never block the response on this stage
  }
}


// ============================================================
//  STAGE 6 — CONSOLIDATE (async, non-blocking, fire-and-forget)
// ============================================================
async function consolidate(db, uid, sessionId, userMessage, reply) {
  const prompt = `Extract at most 2 durable facts about this user from the exchange below, if any genuinely exist. A durable fact is worth remembering for future conversations — not small talk or anything already obvious.

Kinds: situation (what's going on in their life), relationship (people in their life), preference (how they like to be supported), coping (what helps them), trigger (what makes things worse for them).

User: "${userMessage}"
Mira: "${reply}"

Respond with ONLY a JSON array (empty array if nothing durable emerged): [{"fact": "short first-person-about-them statement", "kind": "situation|relationship|preference|coping|trigger", "confidence": 0.0-1.0}]`;

  const response = await ai.models.generateContent({
    model: CFG.MODEL_REFLECT,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.2, maxOutputTokens: 300, responseMimeType: 'application/json' },
  });

  const raw = response.text?.trim() || '[]';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let facts;
  try { facts = JSON.parse(cleaned); } catch { return; }
  if (!Array.isArray(facts) || !facts.length) return;

  const memoryRef = db.collection('users').doc(uid).collection('miraMemory');

  for (const f of facts.slice(0, 2)) {
    if (!f || typeof f.fact !== 'string' || !f.fact.trim() || !MEMORY_KINDS.includes(f.kind)) continue;

    // Deterministic doc ID from the fact text == UNIQUE(user_id, fact)
    // without a read-then-write transaction: repeat extractions of the
    // same fact overwrite (bumping confidence/updatedAt) instead of
    // duplicating.
    const factId = crypto.createHash('sha1').update(f.fact.toLowerCase().trim()).digest('hex').slice(0, 24);
    const ref = memoryRef.doc(factId);
    const existing = await ref.get();

    await ref.set({
      fact: f.fact.trim(),
      kind: f.kind,
      confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.5)),
      sessionId,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  }
}


// ============================================================
//  Orchestrator
// ============================================================
async function runMiraAgent({ db, uid, message }) {
  const startedAt = Date.now();

  // STAGE 1 — always runs first, always deterministic.
  const { isCrisis, matchedKeywords } = safetyGate(message);

  let reply = FALLBACK_MESSAGE;
  let intent = null;
  let toolTrace = [];
  let moodProposal = null;
  let perceived = null;

  try {
    // STAGE 2
    perceived = await perceive(db, uid);

    if (isCrisis) {
      // Crisis path: no planning nuance, no tool loop, no reflection —
      // just a fast, warm, direct response. The hotline append below runs
      // regardless of what happens in this try block.
      intent = 'CRISIS';
      reply = await actCrisis(perceived, message, matchedKeywords);
    } else {
      // STAGE 3
      intent = await plan(perceived, message);
      // STAGE 4
      const acted = await act(db, uid, perceived, message, intent);
      reply = acted.reply;
      toolTrace = acted.toolTrace;
      moodProposal = acted.moodProposal;

      // STAGE 5 — skipped entirely for crisis, per the branch above.
      if (CFG.REFLECTION_ENABLED) {
        reply = await reflect(reply);
      }
    }
  } catch (err) {
    console.error('[miraAgent] pipeline error:', err);
    reply = FALLBACK_MESSAGE;
  }

  // Unconditional, non-overridable — runs whether the try block above
  // succeeded or crashed, and after every stage that could have touched
  // `reply` has already run.
  if (isCrisis) {
    reply = appendHotlinesIfMissing(reply);
  }

  const sessionId = perceived?.sessionId || `sess_${uid}_${Date.now()}`;

  // STAGE 6 — fire-and-forget, never blocks or fails the response.
  consolidate(db, uid, sessionId, message, reply)
    .catch(err => console.error('[miraAgent] consolidate failed:', err.message));

  if (isCrisis) {
    logCrisisFlag(db, uid, sessionId, matchedKeywords)
      .catch(err => console.error('[miraAgent] logCrisisFlag failed:', err.message));
  }

  return {
    reply,
    sessionId,
    intent,
    isCrisis,
    matchedKeywords,
    moodProposal,
    toolTrace,
    latencyMs: Date.now() - startedAt,
  };
}

module.exports = {
  runMiraAgent,
  CFG,
  CRISIS_HOTLINES,
};
