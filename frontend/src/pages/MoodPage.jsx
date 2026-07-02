import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../utils/api'
import { useMoodHistory } from '../hooks/useFetch'

const EMOJIS  = ['','😭','😢','😞','😟','😐','🙂','😊','😄','😁','🤩']
const moodColor = s => s >= 7 ? '#16a34a' : s >= 4 ? '#d97706' : '#dc2626'
const LABELS    = {1:'Very low',2:'Low',3:'Low',4:'Below avg',5:'Neutral',6:'Okay',7:'Good',8:'Good',9:'Great',10:'Excellent'}

export default function MoodPage() {
  const { data: entries = [], setData } = useMoodHistory()
  const [score,   setScore]   = useState(5)
  const [note,    setNote]    = useState('')
  const [saved,   setSaved]   = useState(false)
  const [saving,  setSaving]  = useState(false)

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await api.post('/mood/', { score, note })
      setData(prev => [...(prev || []), data])
      setNote('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {} finally { setSaving(false) }
  }

  const avg = entries.length
    ? (entries.reduce((s, e) => s + e.score, 0) / entries.length).toFixed(1)
    : null

  const chartData = entries.slice(-14).map(e => ({
    date:  new Date(e.logged_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
    score: e.score,
  }))

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Mood Tracker</h1>
        <p className="text-slate-500 text-sm mt-1">How are you feeling right now?</p>
      </div>

      {/* Log form */}
      <div className="card p-6 mb-6">
        <form onSubmit={submit}>
          <div className="text-center mb-6">
            <div className="text-6xl mb-2">{EMOJIS[score]}</div>
            <div className="text-3xl font-bold mb-2" style={{ color: moodColor(score) }}>{score}/10</div>
            <input type="range" min={1} max={10} value={score}
              onChange={e => setScore(parseInt(e.target.value))}
              className="w-full max-w-xs accent-brand-600" />
            <div className="flex justify-between max-w-xs mx-auto text-xs text-slate-400 mt-1">
              <span>Very low</span><span>Neutral</span><span>Excellent</span>
            </div>
          </div>
          <div className="form-group">
            <label className="label">What's on your mind? <span className="text-slate-400">(optional)</span></label>
            <textarea className="input" rows={3} placeholder="A few words about how you're feeling…"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
          {saved && <div className="alert-success">✓ Mood logged!</div>}
          <button type="submit" className="btn-primary btn-full" disabled={saving}>
            {saving ? 'Saving…' : 'Log mood'}
          </button>
        </form>
      </div>

      {/* Stats */}
      {entries.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[{ label: 'Average', value: avg + '/10' }, { label: 'Entries', value: entries.length }, { label: 'Latest', value: entries.at(-1)?.score + '/10' }]
              .map(s => (
                <div key={s.label} className="card p-4 text-center">
                  <div className="text-2xl font-bold text-brand-600">{s.value}</div>
                  <div className="text-xs text-slate-400 mt-1">{s.label}</div>
                </div>
              ))}
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Last 14 entries</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis domain={[1,10]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip formatter={v => [`${v}/10`, 'Mood']} />
                <Line type="monotone" dataKey="score" stroke="#0d9488" strokeWidth={2}
                  dot={{ r: 4, fill: '#0d9488' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
