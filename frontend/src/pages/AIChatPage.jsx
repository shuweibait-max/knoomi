import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'

// ─── Suggested names & avatars ─────────────────────────────
const NAME_SUGGESTIONS = ['Mira', 'Nova', 'Sage', 'Lumi', 'Kai', 'Iris', 'Wren', 'Ori']
const AVATARS = ['🌿', '🌸', '🦋', '🌊', '☁️', '⭐', '🍃', '🌙', '🔮', '💫', '🌱', '🕊️']

const STARTERS = [
  "I've been feeling anxious lately",
  "I'm having trouble sleeping",
  "I need someone to talk to",
  "I want to learn coping strategies",
]


function Bubble({ msg, username, aiAvatar }) {
  const isAI = msg.is_ai
  return (
    <div className={`flex gap-2.5 ${isAI ? '' : 'flex-row-reverse'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 self-end
        ${isAI ? 'bg-brand-100 text-brand-600' : 'bg-slate-200 text-slate-600 font-bold text-xs'}`}>
        {isAI ? aiAvatar : username?.[0]?.toUpperCase()}
      </div>
      <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed
        ${isAI
          ? 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'
          : 'bg-brand-600 text-white rounded-tr-sm'}`}>
        {msg.content}
      </div>
    </div>
  )
}


// ─── Customize Modal ──────────────────────────────────────
function CustomizeModal({ currentName, currentAvatar, onClose, onSave }) {
  const [name, setName]     = useState(currentName)
  const [avatar, setAvatar] = useState(currentAvatar)
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Please enter a name'); return }
    if (trimmed.length > 50) { setError('Name must be 50 characters or less'); return }
    if (!/^[a-zA-Z0-9\s\-']+$/.test(trimmed)) {
      setError('Only letters, numbers, spaces, hyphens and apostrophes allowed'); return
    }

    setSaving(true); setError('')
    try {
      await onSave(trimmed, avatar)
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-brand-50 to-brand-100 px-6 pt-6 pb-8 text-center">
          <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-3xl mx-auto mb-3">
            {avatar}
          </div>
          <h2 className="text-lg font-bold text-slate-800">Customize your companion</h2>
          <p className="text-xs text-slate-500 mt-1">Make them feel like your own</p>
        </div>

        <div className="px-6 py-5">
          {error && <div className="alert-error mb-4">{error}</div>}

          {/* Name */}
          <div className="mb-5">
            <label className="label">Companion name</label>
            <input className="input" value={name} maxLength={50}
              placeholder="e.g. Mira"
              onChange={e => setName(e.target.value)} autoFocus />

            <div className="text-xs text-slate-400 mt-2 mb-2">Quick suggestions:</div>
            <div className="flex flex-wrap gap-1.5">
              {NAME_SUGGESTIONS.map(s => (
                <button key={s} type="button"
                  onClick={() => setName(s)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors
                    ${name === s
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Avatar picker */}
          <div className="mb-5">
            <label className="label">Choose an avatar</label>
            <div className="grid grid-cols-6 gap-2">
              {AVATARS.map(a => (
                <button key={a} type="button"
                  onClick={() => setAvatar(a)}
                  className={`aspect-square rounded-lg text-2xl flex items-center justify-center border-2 transition-all
                    ${avatar === a
                      ? 'border-brand-600 bg-brand-50 scale-105'
                      : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-slate-100 px-6 py-4 flex gap-2 bg-slate-50">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={saving}>
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary flex-1" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── Main page ────────────────────────────────────────────
export default function AIChatPage() {
  const { user, setUser } = useAuth()

  // Read AI name + avatar from user object with fallbacks
  const aiName   = user?.ai_name   || 'Mira'
  const aiAvatar = user?.ai_avatar || '🌿'

  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [fetching, setFetching]   = useState(true)
  const [welcoming, setWelcoming] = useState(false)
  const [showCustomize, setShow]  = useState(false)
  const bottomRef = useRef(null)

  // ─── Load history + trigger welcome for new users ────────
  useEffect(() => {
    const initialize = async () => {
      try {
        const historyRes = await api.get('/chat/ai/history')
        const history = historyRes.data

        if (history.length === 0) {
          // First-time user — fetch AI-generated welcome
          setFetching(false)
          setWelcoming(true)
          try {
            const { data } = await api.post('/chat/ai/welcome')
            if (data.welcome) {
              setTimeout(() => {
                setMessages([{
                  id: data.message_id,
                  content: data.welcome,
                  is_ai: true,
                }])
                setWelcoming(false)
              }, 900)
            } else {
              setWelcoming(false)
            }
          } catch {
            setWelcoming(false)
          }
        } else {
          setMessages(history)
          setFetching(false)
        }
      } catch {
        setFetching(false)
      }
    }
    initialize()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, welcoming])

  const send = async (text) => {
    const content = (text || input).trim()
    if (!content || loading) return
    setInput('')
    setMessages(m => [...m, { id: Date.now(), content, is_ai: false }])
    setLoading(true)
    try {
      const { data } = await api.post('/chat/ai', { message: content })
      setMessages(m => [...m, { id: data.message_id, content: data.reply, is_ai: true }])
    } catch {
      setMessages(m => [...m, { id: Date.now(), content: 'Sorry, I had trouble responding. Please try again.', is_ai: true }])
    } finally { setLoading(false) }
  }

  const saveCustomization = async (newName, newAvatar) => {
    const { data } = await api.put('/auth/ai-name', {
      ai_name:   newName,
      ai_avatar: newAvatar,
    })
    setUser?.(data)
    localStorage.setItem('mb_user', JSON.stringify(data))
    setShow(false)
  }

  const showStarters = !fetching && !welcoming
    && messages.length > 0
    && messages.every(m => m.is_ai)

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-lg">
            {aiAvatar}
          </div>
          <div>
            <div className="font-semibold text-slate-800 text-sm">{aiName}</div>
            <div className="text-xs text-green-500">● Online · Always available</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShow(true)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-600 transition-colors font-medium">
            <span>⚙️</span>
            <span>Customize</span>
          </button>
          <div className="w-px h-4 bg-slate-200" />
          <Link to="/crisis" className="text-xs text-red-500 hover:underline">🆘 Crisis help</Link>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {fetching && <p className="text-center text-slate-400 text-sm">Loading…</p>}

        {messages.map(msg => <Bubble key={msg.id} msg={msg} username={user?.username} aiAvatar={aiAvatar} />)}

        {/* Typing dots — for both welcome AND regular responses */}
        {(welcoming || loading) && (
          <div className="flex gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-sm shrink-0">
              {aiAvatar}
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 bg-slate-300 rounded-full typing-dot"
                    style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Starter buttons after welcome */}
        {showStarters && (
          <div className="pt-2">
            <div className="text-xs text-slate-400 text-center mb-3">Or try one of these:</div>
            <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
              {STARTERS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-left text-xs bg-white border border-slate-200 rounded-xl px-3 py-2.5
                    hover:border-brand-300 hover:text-brand-600 transition-colors text-slate-600">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50 border-t border-amber-100 px-5 py-1.5 text-xs text-amber-700 text-center shrink-0">
        {aiName} is not a licensed therapist. For emergencies call <strong>999</strong> or{' '}
        <Link to="/crisis" className="underline">see crisis resources</Link>.
      </div>

      {/* Input */}
      <div className="bg-white border-t border-slate-200 px-4 py-3 shrink-0">
        <div className="flex gap-2">
          <input className="input flex-1" placeholder={`Message ${aiName}…`}
            value={input} onChange={e => setInput(e.target.value)} disabled={loading || welcoming}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button onClick={() => send()} disabled={!input.trim() || loading || welcoming} className="btn-primary px-5">Send</button>
        </div>
      </div>

      {/* Customize modal */}
      {showCustomize && (
        <CustomizeModal
          currentName={aiName}
          currentAvatar={aiAvatar}
          onClose={() => setShow(false)}
          onSave={saveCustomization}
        />
      )}
    </div>
  )
}
