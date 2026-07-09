import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'

const ROLE_BADGE = {
  owner:  { icon: '👑', label: 'Owner', color: 'bg-amber-50 text-amber-700' },
  admin:  { icon: '🛡️', label: 'Admin', color: 'bg-blue-50 text-blue-700' },
  member: { icon: '', label: 'Member', color: 'bg-slate-50 text-slate-500' },
}

export default function GroupManageModal({ group, currentUserId, myRole, onClose, onGroupUpdated, onGroupDeleted }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('members')

  // ─── Members tab state ───────────────────────────
  const [members, setMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [actionError, setActionError] = useState('')

  // ─── Settings tab state ──────────────────────────
  const [form, setForm] = useState({
    name: group.name, description: group.description || '',
    topic: group.topic, is_private: !!group.is_private,
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState({ type: '', text: '' })
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const canManage = ['owner', 'admin'].includes(myRole)
  const isOwner   = myRole === 'owner'

  const loadMembers = () => {
    setLoadingMembers(true)
    api.get(`/groups/${group.id}/members`)
      .then(r => setMembers(r.data))
      .catch(() => {})
      .finally(() => setLoadingMembers(false))
  }

  useEffect(() => { loadMembers() }, [])

  const canKick = (member) => {
    if (member.user_id === currentUserId) return false
    if (member.role === 'owner') return false
    if (myRole === 'owner') return true
    if (myRole === 'admin' && member.role === 'member') return true
    return false
  }

  const kick = async (member) => {
    if (!confirm(`Remove ${member.username} from ${group.name}?`)) return
    setActionError('')
    try {
      await api.delete(`/groups/${group.id}/members/${member.user_id}`)
      setMembers(m => m.filter(x => x.user_id !== member.user_id))
    } catch (err) {
      setActionError(err.response?.data?.error || 'Could not remove member')
    }
  }

  const changeRole = async (member, newRole) => {
    setActionError('')
    try {
      await api.patch(`/groups/${group.id}/members/${member.user_id}/role`, { role: newRole })
      setMembers(m => m.map(x => x.user_id === member.user_id ? { ...x, role: newRole } : x))
    } catch (err) {
      setActionError(err.response?.data?.error || 'Could not change role')
    }
  }

  const saveSettings = async e => {
    e.preventDefault()
    setSavingSettings(true); setSettingsMsg({ type: '', text: '' })
    try {
      const { data } = await api.patch(`/groups/${group.id}`, form)
      setSettingsMsg({ type: 'success', text: '✓ Group updated' })
      onGroupUpdated?.(data)
    } catch (err) {
      setSettingsMsg({ type: 'error', text: err.response?.data?.error || 'Update failed' })
    } finally { setSavingSettings(false) }
  }

  const deleteGroup = async () => {
    setDeleting(true)
    try {
      await api.delete(`/groups/${group.id}`)
      onGroupDeleted?.()
      navigate('/groups')
    } catch (err) {
      setSettingsMsg({ type: 'error', text: err.response?.data?.error || 'Delete failed' })
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="px-6 pt-5 pb-0 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">{group.name}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
          </div>
          <div className="flex border-b border-slate-200">
            <button onClick={() => setTab('members')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'members' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}>
              Members ({members.length})
            </button>
            {canManage && (
              <button onClick={() => setTab('settings')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'settings' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}>
                Settings
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {tab === 'members' && (
            <div>
              {actionError && <div className="alert-error mb-3">{actionError}</div>}
              {loadingMembers && <p className="text-slate-400 text-sm text-center py-6">Loading…</p>}
              <div className="space-y-2">
                {members.map(m => {
                  const badge = ROLE_BADGE[m.role] || ROLE_BADGE.member
                  return (
                    <div key={m.user_id} className="flex items-center justify-between gap-3 py-1.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {m.username?.[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-700 truncate flex items-center gap-1.5">
                            {m.username}
                            {m.user_id === currentUserId && <span className="text-xs text-slate-400">(you)</span>}
                          </div>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${badge.color}`}>
                            {badge.icon} {badge.label}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isOwner && m.role !== 'owner' && (
                          <select
                            value={m.role}
                            onChange={e => changeRole(m, e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white">
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                        {canKick(m) && (
                          <button onClick={() => kick(m)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1">
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'settings' && canManage && (
            <div>
              {settingsMsg.text && (
                <div className={settingsMsg.type === 'error' ? 'alert-error' : 'alert-success'}>
                  {settingsMsg.text}
                </div>
              )}
              <form onSubmit={saveSettings}>
                <div className="form-group">
                  <label className="label">Group name</label>
                  <input className="input" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="label">Description</label>
                  <textarea className="input" rows={3} value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="label">Topic</label>
                  <select className="input" value={form.topic}
                    onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}>
                    {['Anxiety','Depression','Grief','Stress','Relationships','Addiction','General'].map(t => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer mb-4">
                  <input type="checkbox" checked={form.is_private}
                    onChange={e => setForm(f => ({ ...f, is_private: e.target.checked }))} />
                  Private group
                </label>
                <button type="submit" className="btn-primary btn-full" disabled={savingSettings}>
                  {savingSettings ? 'Saving…' : 'Save changes'}
                </button>
              </form>

              {isOwner && (
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">Danger zone</p>
                  {!confirmDelete ? (
                    <button onClick={() => setConfirmDelete(true)}
                      className="btn-danger btn-full">
                      Delete this group
                    </button>
                  ) : (
                    <div className="border border-red-200 rounded-lg p-3 bg-red-50">
                      <p className="text-sm text-red-700 mb-3">
                        This permanently deletes <strong>{group.name}</strong> and all its messages. This can't be undone.
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDelete(false)} className="btn-secondary flex-1 btn-sm">Cancel</button>
                        <button onClick={deleteGroup} disabled={deleting} className="btn-danger flex-1 btn-sm">
                          {deleting ? 'Deleting…' : 'Yes, delete forever'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
