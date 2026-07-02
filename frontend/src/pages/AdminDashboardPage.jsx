import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Navigate, Link } from 'react-router-dom'
import api from '../utils/api'

const SEVERITY_STYLES = {
  info:    { bg: 'bg-brand-50',  border: 'border-brand-200',  text: 'text-brand-700',  icon: '💭', label: 'Info' },
  concern: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-800',  icon: '💛', label: 'Concern' },
  urgent:  { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    icon: '❤️', label: 'Urgent' },
}

function StatCard({ label, value, hint, accent = 'brand', warn = false }) {
  const color = warn && value > 0 ? 'text-red-600' : `text-${accent}-600`
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-2">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value ?? '—'}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  )
}

function TabButton({ active, onClick, label, badge }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2
        ${active
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
      {label}
      {badge > 0 && (
        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
          {badge}
        </span>
      )}
    </button>
  )
}

// ─── OVERVIEW TAB ────────────────────────────────────────
function OverviewTab({ stats }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Users</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total users"      value={stats?.total_users} />
        <StatCard label="Active (7 days)"  value={stats?.active_users_7d} hint="Any chat or mood log" />
        <StatCard label="Support groups"   value={stats?.total_groups} />
        <StatCard label="Messages today"   value={stats?.messages_today} />
      </div>

      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Wellbeing signals</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Avg mood (7 days)"
          value={stats?.avg_mood_7d ? `${stats.avg_mood_7d}/10` : '—'} />
        <StatCard label="Unread alerts" value={stats?.unread_alerts} warn />
        <StatCard label="Urgent (7 days)" value={stats?.urgent_alerts_7d} accent="red" warn />
      </div>
    </div>
  )
}

// ─── AUDIT LOG TAB ───────────────────────────────────────
function AuditLogTab() {
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [severity, setSeverity] = useState('all')
  const [unreadOnly, setUnread] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (severity !== 'all') params.append('severity', severity)
      if (unreadOnly)         params.append('unread_only', 'true')
      const { data } = await api.get(`/admin/notifications?${params}`)
      setLogs(data)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [severity, unreadOnly])

  const markRead = async (id) => {
    await api.patch(`/admin/notifications/${id}/read`)
    setLogs(l => l.map(x => x.id === id ? { ...x, is_read: 1 } : x))
  }

  return (
    <div>
      {/* Filters */}
      <div className="card p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {[
            { v: 'all',     l: 'All' },
            { v: 'urgent',  l: '❤️ Urgent' },
            { v: 'concern', l: '💛 Concern' },
            { v: 'info',    l: '💭 Info' },
          ].map(f => (
            <button key={f.v} onClick={() => setSeverity(f.v)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors
                ${severity === f.v
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
              {f.l}
            </button>
          ))}
        </div>
        <div className="flex-1"></div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={unreadOnly}
            onChange={e => setUnread(e.target.checked)} />
          Unread only
        </label>
      </div>

      {/* Logs */}
      {loading && <p className="text-slate-400 text-center py-10 text-sm">Loading…</p>}
      {!loading && logs.length === 0 && (
        <p className="text-slate-400 text-center py-12 text-sm">No alerts match your filters.</p>
      )}

      <div className="space-y-2">
        {logs.map(log => {
          const style = SEVERITY_STYLES[log.severity] || SEVERITY_STYLES.info
          const meta  = typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {})
          const isExpanded = expanded === log.id

          return (
            <div key={log.id}
              className={`card border-l-4 ${log.is_read ? 'border-l-slate-300' : `border-l-${log.severity === 'urgent' ? 'red' : log.severity === 'concern' ? 'amber' : 'brand'}-500`} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-lg">{style.icon}</span>
                    <span className={`text-xs font-bold uppercase tracking-wide ${style.text}`}>{style.label}</span>
                    {!log.is_read && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">NEW</span>
                    )}
                    <span className="text-xs text-slate-400 ml-auto">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-800">{log.title}</div>
                  <div className="text-xs text-slate-500 mt-1 mb-2">
                    User: <Link to={`/admin/users/${log.user_id}`} className="text-brand-600 font-semibold hover:underline">
                      {log.username}
                    </Link> · {log.email}
                  </div>
                  <div className="text-sm text-slate-700">{log.message}</div>

                  {(meta.from_mood || meta.signals) && (
                    <button onClick={() => setExpanded(isExpanded ? null : log.id)}
                      className="text-xs text-brand-600 mt-2 font-semibold hover:underline">
                      {isExpanded ? '▲ Hide details' : '▼ Show details'}
                    </button>
                  )}

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-1 text-xs">
                      {meta.from_mood != null && (
                        <div><span className="text-slate-400">Mood shift:</span>{' '}
                          <span className="font-semibold">{meta.from_mood}/10 → {meta.to_mood}/10</span>
                        </div>
                      )}
                      {meta.signals?.length > 0 && (
                        <div><span className="text-slate-400">Signals:</span>{' '}
                          <span className="text-slate-700">{meta.signals.join(', ')}</span>
                        </div>
                      )}
                      {meta.is_crisis && (
                        <div className="text-red-600 font-bold">⚠️ Crisis language flagged</div>
                      )}
                    </div>
                  )}
                </div>

                {!log.is_read && (
                  <button onClick={() => markRead(log.id)}
                    className="btn-secondary btn-sm shrink-0">
                    Mark reviewed
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── USERS TAB ───────────────────────────────────────────
function UsersTab() {
  const [users,   setUsers]   = useState([])
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await api.get(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`)
        setUsers(data)
      } finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const changeRole = async (id, newRole) => {
    if (!confirm(`Change this user's role to ${newRole}?`)) return
    await api.put(`/admin/users/${id}/role`, { role: newRole })
    setUsers(u => u.map(x => x.id === id ? { ...x, role: newRole } : x))
  }

  return (
    <div>
      <input className="input mb-4" placeholder="🔍 Search by username or email…"
        value={search} onChange={e => setSearch(e.target.value)} />

      {loading && <p className="text-slate-400 text-center py-10 text-sm">Loading…</p>}

      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="card p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold shrink-0">
              {u.username?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800">{u.username}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize
                  ${u.role === 'admin' ? 'bg-purple-100 text-purple-700'
                  : u.role === 'therapist' ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-600'}`}>
                  {u.role}
                </span>
                {parseInt(u.urgent_count) > 0 && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                    ⚠️ {u.urgent_count} urgent
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 truncate">{u.email}</div>
              <div className="text-xs text-slate-500 mt-1">
                {u.chat_count} chats · {u.mood_count} moods
                {u.recent_avg_mood && ` · avg mood ${parseFloat(u.recent_avg_mood).toFixed(1)}/10`}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link to={`/admin/users/${u.id}`} className="btn-secondary btn-sm">View</Link>
              <select value={u.role} onChange={e => changeRole(u.id, e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="user">user</option>
                <option value="therapist">therapist</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── MAIN PAGE ───────────────────────────────────────────
export default function AdminDashboardPage() {
  const { user }        = useAuth()
  const [stats, setStats] = useState(null)
  const [tab, setTab]   = useState('overview')

  // Block non-admins
  if (user && user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  useEffect(() => {
    api.get('/admin/stats').then(r => setStats(r.data)).catch(() => {})
    // Refresh every 30 seconds
    const t = setInterval(() => {
      api.get('/admin/stats').then(r => setStats(r.data)).catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-slate-800">Admin Dashboard</h1>
            <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-bold">ADMIN</span>
          </div>
<<<<<<< HEAD
          <p className="text-slate-500 text-sm">Knoomi platform oversight</p>
=======
          <p className="text-slate-500 text-sm">MindBridge platform oversight</p>
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48
        </div>
        <div className="text-right text-xs text-slate-400">
          Signed in as<br />
          <span className="text-slate-700 font-semibold">{user?.username}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 overflow-x-auto">
        <TabButton active={tab === 'overview'}   onClick={() => setTab('overview')}   label="📊 Overview" />
        <TabButton active={tab === 'audit'}      onClick={() => setTab('audit')}      label="🔔 Audit Log"
          badge={stats?.unread_alerts} />
        <TabButton active={tab === 'users'}      onClick={() => setTab('users')}      label="👥 Users" />
      </div>

      {tab === 'overview' && <OverviewTab stats={stats} />}
      {tab === 'audit'    && <AuditLogTab />}
      {tab === 'users'    && <UsersTab />}
    </div>
  )
}
