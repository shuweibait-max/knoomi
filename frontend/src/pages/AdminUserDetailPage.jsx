import { useState, useEffect } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../utils/api'

const SEVERITY_STYLES = {
  info:    { icon: '💭', color: 'text-brand-700',  bg: 'bg-brand-50' },
  concern: { icon: '💛', color: 'text-amber-700',  bg: 'bg-amber-50' },
  urgent:  { icon: '❤️', color: 'text-red-700',    bg: 'bg-red-50' },
}

export default function AdminUserDetailPage() {
  const { user: currentUser } = useAuth()
  const { id } = useParams()
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)

  if (currentUser && currentUser.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  useEffect(() => {
    api.get(`/admin/users/${id}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-slate-400 text-center py-16 text-sm">Loading…</p>
  if (!data)   return <p className="text-slate-400 text-center py-16 text-sm">User not found</p>

  const { user, mood_entries, notifications, chat_message_count } = data

  const moodChartData = [...mood_entries].reverse().slice(-30).map(e => ({
    date: new Date(e.logged_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
    score: e.score,
  }))

  const avgMood = mood_entries.length
    ? (mood_entries.reduce((s, e) => s + e.score, 0) / mood_entries.length).toFixed(1)
    : null

  const urgentCount = notifications.filter(n => n.severity === 'urgent').length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back link */}
      <Link to="/admin" className="text-sm text-slate-500 hover:text-brand-600 mb-4 inline-block">
        ← Back to dashboard
      </Link>

      {/* User header */}
      <div className="card p-5 mb-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xl font-bold shrink-0">
          {user.username?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-slate-800">{user.username}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize
              ${user.role === 'admin' ? 'bg-purple-100 text-purple-700'
              : user.role === 'therapist' ? 'bg-blue-100 text-blue-700'
              : 'bg-slate-100 text-slate-600'}`}>
              {user.role}
            </span>
          </div>
          <div className="text-sm text-slate-500 mt-0.5">{user.email}</div>
          <div className="text-xs text-slate-400 mt-1">
            Joined {new Date(user.created_at).toLocaleDateString()} · AI companion: <span className="font-semibold">{user.ai_name}</span>
          </div>
        </div>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-2">Chats</div>
          <div className="text-2xl font-bold text-brand-600">{chat_message_count}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-2">Mood entries</div>
          <div className="text-2xl font-bold text-brand-600">{mood_entries.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-2">Avg mood</div>
          <div className="text-2xl font-bold text-brand-600">{avgMood ? `${avgMood}/10` : '—'}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-2">Urgent alerts</div>
          <div className={`text-2xl font-bold ${urgentCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>
            {urgentCount}
          </div>
        </div>
      </div>

      {/* Mood chart */}
      {moodChartData.length > 0 && (
        <div className="card p-5 mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Mood trend (last 30 entries)</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={moodChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis domain={[1, 10]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip formatter={v => [`${v}/10`, 'Mood']} />
              <Line type="monotone" dataKey="score" stroke="#0d9488" strokeWidth={2}
                dot={{ r: 4, fill: '#0d9488' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Notifications */}
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Alert history</p>
      {notifications.length === 0 && (
        <p className="text-slate-400 text-sm text-center py-6">No alerts for this user.</p>
      )}
      <div className="space-y-2">
        {notifications.map(n => {
          const style = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info
          const meta  = typeof n.metadata === 'string' ? JSON.parse(n.metadata || '{}') : (n.metadata || {})
          return (
            <div key={n.id} className={`card p-4 ${style.bg}`}>
              <div className="flex items-start gap-3">
                <div className="text-xl shrink-0">{style.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold uppercase ${style.color}`}>{n.severity}</span>
                    <span className="text-xs text-slate-400 ml-auto">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-800 mt-1">{n.title}</div>
                  <div className="text-sm text-slate-600 mt-1">{n.message}</div>
                  {(meta.from_mood != null || meta.signals?.length) && (
                    <div className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200">
                      {meta.from_mood != null && (
                        <>Mood shift: <strong>{meta.from_mood}/10 → {meta.to_mood}/10</strong></>
                      )}
                      {meta.signals?.length > 0 && (
                        <> · Signals: {meta.signals.join(', ')}</>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
