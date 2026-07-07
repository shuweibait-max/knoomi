import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate     = useNavigate()
  const [form, setForm]       = useState({ username: '', email: '', password: '', role: 'user' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
  e.preventDefault()
  if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
  setError(''); setLoading(true)
  try {
    await register(form.username, form.email, form.password, form.role)
 
    const pendingInvite = sessionStorage.getItem('pending_invite')
    if (pendingInvite) {
      sessionStorage.removeItem('pending_invite')
      navigate(`/invite/${pendingInvite}`)
    } else {
      navigate('/')
    }
  } catch (err) {
    setError(err.response?.data?.error || 'Registration failed.')
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
          <h1 className="text-2xl font-bold text-slate-800">Create your account</h1>
          <p className="text-slate-500 text-sm mt-1">Join Knoomi — it's free</p>
        </div>

        <div className="card p-6">
          {error && <div className="alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            {[
              { name: 'username', label: 'Username',    type: 'text',     placeholder: 'your_name' },
              { name: 'email',    label: 'Email',       type: 'email',    placeholder: 'you@example.com' },
              { name: 'password', label: 'Password',    type: 'password', placeholder: 'Min. 8 characters' },
            ].map(f => (
              <div key={f.name} className="form-group">
                <label className="label">{f.label}</label>
                <input name={f.name} type={f.type} className="input" placeholder={f.placeholder}
                  value={form[f.name]} onChange={handleChange} required />
              </div>
            ))}
            <div className="form-group">
              <label className="label">I am joining as</label>
              <select name="role" className="input" value={form.role} onChange={handleChange}>
                <option value="user">Someone seeking support</option>
                <option value="therapist">A therapist / counsellor</option>
              </select>
            </div>
            <button type="submit" className="btn-primary btn-full mt-2" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-600 font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
