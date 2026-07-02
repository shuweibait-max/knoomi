import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api'

const TOPICS = ['All','Anxiety','Depression','Grief','Stress','Relationships','Addiction','General']

export default function GroupsPage() {
  const [groups,     setGroups]     = useState([])
  const [myGroupIds, setMyGroupIds] = useState(new Set())
  const [topic,      setTopic]      = useState('All')
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [form, setForm] = useState({ name: '', description: '', topic: 'Anxiety', is_private: false })

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

  const join = async (id) => { await api.post(`/groups/${id}/join`); load() }

  const create = async e => {
    e.preventDefault()
    await api.post('/groups/', form)
    setShowModal(false)
    setForm({ name: '', description: '', topic: 'Anxiety', is_private: false })
    load()
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Support Groups</h1>
          <p className="text-slate-500 text-sm mt-1">Find your community</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">+ Create</button>
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
        {groups.map(g => (
          <div key={g.id} className="card p-4 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-slate-700">{g.name}</span>
                {g.topic && <span className="text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full">{g.topic}</span>}
                {g.is_private ? <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Private</span> : null}
              </div>
              {g.description && <p className="text-xs text-slate-500 mt-1">{g.description}</p>}
              <div className="text-xs text-slate-400 mt-1">{g.member_count} member{g.member_count !== 1 ? 's' : ''}</div>
            </div>
            {myGroupIds.has(g.id)
              ? <Link to={`/groups/${g.id}`} className="btn-secondary btn-sm shrink-0">Open →</Link>
              : <button onClick={() => join(g.id)} className="btn-primary btn-sm shrink-0">Join</button>
            }
          </div>
        ))}
        {!loading && groups.length === 0 && (
          <p className="text-center text-slate-400 text-sm py-12">No groups found. Be the first to create one!</p>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-bold mb-4">Create a group</h2>
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
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer mb-4">
                <input type="checkbox" checked={form.is_private}
                  onChange={e => setForm(f => ({ ...f, is_private: e.target.checked }))} />
                Private group
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
