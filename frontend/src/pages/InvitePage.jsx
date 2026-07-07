import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../utils/api'

export default function InvitePage() {
  const { code }   = useParams()
  const { user }   = useAuth()
  const navigate   = useNavigate()

  const [group, setGroup]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    // If not logged in, save the invite and redirect to login
    if (!user) {
      sessionStorage.setItem('pending_invite', code)
      navigate('/login')
      return
    }

    api.get(`/groups/invite/${code}`)
      .then(r => setGroup(r.data))
      .catch(err => setError(err.response?.data?.error || 'Invalid invite link'))
      .finally(() => setLoading(false))
  }, [code, user])

  const join = async () => {
    setJoining(true)
    try {
      const { data } = await api.post(`/groups/invite/${code}/join`)
      navigate(`/groups/${data.group_id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not join')
      setJoining(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
      Loading invite…
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-3">🚫</div>
        <h1 className="text-lg font-bold text-slate-800 mb-2">Invite unavailable</h1>
        <p className="text-sm text-slate-500 mb-5">{error}</p>
        <Link to="/groups" className="btn-primary btn-full">Browse public groups</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-brand-50 to-slate-100">
      <div className="card p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">👋</div>
          <p className="text-xs text-slate-400 uppercase font-semibold tracking-widest">You've been invited to</p>
          <h1 className="text-xl font-bold text-slate-800 mt-2">{group.name}</h1>
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            {group.topic && <span className="text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full">{group.topic}</span>}
            {group.is_private ? <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">🔒 Private</span> : null}
            <span className="text-xs text-slate-400">{group.member_count} member{group.member_count !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {group.description && (
          <p className="text-sm text-slate-600 text-center mb-6 italic">"{group.description}"</p>
        )}

        <div className="text-xs text-slate-400 text-center mb-6">
          Created by <span className="font-semibold text-slate-600">{group.created_by_name}</span>
        </div>

        {group.is_member ? (
          <>
            <div className="alert-info mb-4 text-center">You're already a member of this group.</div>
            <Link to={`/groups/${group.id}`} className="btn-primary btn-full">Open group →</Link>
          </>
        ) : (
          <div className="flex gap-2">
            <Link to="/groups" className="btn-secondary flex-1 text-center">Cancel</Link>
            <button onClick={join} disabled={joining} className="btn-primary flex-1">
              {joining ? 'Joining…' : 'Accept & Join'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
