import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [form, setForm]       = useState({ email: '', password: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
  e.preventDefault()
  setError(''); setLoading(true)
  try {
    await login(form.email, form.password)
 
    // ─── NEW: handle pending invite ─────
    const pendingInvite = sessionStorage.getItem('pending_invite')
    if (pendingInvite) {
      sessionStorage.removeItem('pending_invite')
      navigate(`/invite/${pendingInvite}`)
    } else {
      navigate('/')
    }
    // ─── END NEW ─────
  } catch (err) {
    setError(err.response?.data?.error || 'Login failed. Please try again.')
  } finally { setLoading(false) }
}

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-600 mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Welcome back</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in to Knoomi</p>
        </div>

        <div className="card p-6">
          {error && <div className="alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label">Email</label>
              <input name="email" type="email" className="input" placeholder="you@example.com"
                value={form.email} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label className="label">Password</label>
              <input name="password" type="password" className="input" placeholder="••••••••"
                value={form.password} onChange={handleChange} required />
            </div>
            <button type="submit" className="btn-primary btn-full mt-2" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-4">
          No account?{' '}
          <Link to="/register" className="text-brand-600 font-semibold hover:underline">Create one</Link>
        </p>
        <div className="text-center mt-3">
          <Link to="/crisis" className="text-xs text-red-500 hover:underline">In crisis? Get help now</Link>
        </div>
      </div>
    </div>
  )
}
