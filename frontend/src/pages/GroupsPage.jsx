import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../utils/api'

const TOPICS = ['All','Anxiety','Depression','Grief','Stress','Relationships','Addiction','General']

// ─── Invite Modal ────────────────────────────────────────
function InviteModal({ group, onClose }) {
  const [code, setCode]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    api.get(`/groups/${group.id}/invite`)
      .then(r => setCode(r.data.invite_code))
      .catch(() => setCode(null))
      .finally(() => setLoading(false))
  }, [group.id])

  const inviteUrl = code ? `${window.location.origin}/invite/${code}` : ''

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = inviteUrl
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="bg-gradient-to-br from-brand-50 to-brand-100 px-6 pt-6 pb-6 text-center">
          <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto mb-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-brand-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800">Invite people to {group.name}</h2>
          <p className="text-xs text-slate-500 mt-1">
            {group.is_private
              ? 'Anyone with this link can join this private group'
              : 'Share this link so people can join directly'}
          </p>
        </div>

        <div className="px-6 py-5">
          {loading && <p className="text-center text-slate-400 text-sm py-4">Loading link…</p>}

          {!loading && code && (
            <>
              <label className="label">Invite link</label>
              <div className="flex gap-2 mb-4">
                <input readOnly value={inviteUrl}
                  className="input text-xs bg-slate-50 flex-1 font-mono"
                  onFocus={e => e.target.select()} />
                <button onClick={copyLink} className="btn-primary btn-sm px-4 shrink-0">
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500">
                💡 Anyone with this link can join {group.name}. Only share it with people you trust.
              </div>
            </>
          )}

          {!loading && !code && (
            <div className="alert-error">Could not load invite link. Try again later.</div>
          )}
        </div>

        <div className="border-t border-slate-100 px-6 py-3 bg-slate-50">
          <button onClick={onClose} className="btn-secondary btn-full">Done</button>
        </div>
      </div>
    </div>
  )
}


// ─── Main page ───────────────────────────────────────────
export default function GroupsPage() {
  const navigate = useNavigate()

  const [groups,     setGroups]     = useState([])
  const [myGroupIds, setMyGroupIds] = useState(new Set())
  const [topic,      setTopic]      = useState('All')
  const [loading,    setLoading]    = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [inviteFor,  setInviteFor]  = useState(null)
  const [form, setForm] = useState({ name: '', description: '', topic: 'Anxiety', is_private: false })
  const [createError, setCreateError] = useState('')
  const [creating,   setCreating]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [mine, all] = await Promise.all([
        api.get('/groups/mine'),
        api.get(topic === 'All' ? '/groups/' : `/groups/?topic=${topic}`),
      ])
      setMyGroupIds(new Set(mine.data.map(g => g.id)))
      setGroups(all.data)
    } catch {} finally { setLoading(false) }
  }, [topic])

  useEffect(() => { load() }, [load])

  const join = async (id) => {
    try {
      await api.post(`/groups/${id}/join`)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Could not join group')
    }
  }

  const create = async e => {
    e.preventDefault()
    setCreating(true); setCreateError('')
    try {
      const { data } = await api.post('/groups/', form)
      setShowCreate(false)
      setForm({ name: '', description: '', topic: 'Anxiety', is_private: false })

      // Show the invite modal immediately after creation for private groups
      if (data.is_private) {
        setInviteFor(data)
      }

      await load()

      // For public groups, navigate straight to the room since they're auto-joined
      if (!data.is_private) {
        navigate(`/groups/${data.id}`)
      }
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Could not create group')
    } finally { setCreating(false) }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Support Groups</h1>
          <p className="text-slate-500 text-sm mt-1">Find your community</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">+ Create</button>
      </div>

      {/* Topic filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        {TOPICS.map(t => (
          <button key={t} onClick={() => setTopic(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors
              ${topic === t ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Groups */}
      {loading && <p className="text-slate-400 text-sm text-center py-10">Loading…</p>}
      <div className="space-y-2.5">
        {groups.map(g => {
          const isMember = myGroupIds.has(g.id)
          return (
            <div key={g.id} className="card p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-slate-700">{g.name}</span>
                  {g.topic && <span className="text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full">{g.topic}</span>}
                  {g.is_private ? <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">🔒 Private</span> : null}
                </div>
                {g.description && <p className="text-xs text-slate-500 mt-1">{g.description}</p>}
                <div className="text-xs text-slate-400 mt-1">{g.member_count} member{g.member_count !== 1 ? 's' : ''}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isMember && (
                  <button onClick={() => setInviteFor(g)}
                    title="Copy invite link"
                    className="text-slate-400 hover:text-brand-600 transition-colors p-1.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                    </svg>
                  </button>
                )}
                {isMember
                  ? <Link to={`/groups/${g.id}`} className="btn-secondary btn-sm">Open →</Link>
                  : <button onClick={() => join(g.id)} className="btn-primary btn-sm">Join</button>
                }
              </div>
            </div>
          )
        })}
        {!loading && groups.length === 0 && (
          <p className="text-center text-slate-400 text-sm py-12">No groups found. Be the first to create one!</p>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
             onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-bold mb-4">Create a group</h2>
            {createError && <div className="alert-error">{createError}</div>}
            <form onSubmit={create}>
              <div className="form-group">
                <label className="label">Group name</label>
                <input className="input" placeholder="e.g. Anxiety Warriors" required
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <textarea className="input" rows={3} placeholder="What's this group about?"
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="label">Topic</label>
                <select className="input" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}>
                  {TOPICS.filter(t => t !== 'All').map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-600 cursor-pointer mb-1">
                <input type="checkbox" checked={form.is_private} className="mt-0.5"
                  onChange={e => setForm(f => ({ ...f, is_private: e.target.checked }))} />
                <span>
                  <span className="font-semibold">Private group</span>
                  <span className="block text-xs text-slate-400 mt-0.5">Only people with an invite link can join</span>
                </span>
              </label>
              <div className="text-xs text-slate-400 mb-4 pl-6">You'll be the owner and join automatically.</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1" disabled={creating}>Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={creating}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {inviteFor && (
        <InviteModal group={inviteFor} onClose={() => setInviteFor(null)} />
      )}
    </div>
  )
}
