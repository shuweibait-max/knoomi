import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../utils/api'

export default function ProfilePage() {
  const { user, updateUser } = useAuth()

  // ─── Profile info ─────────────────────────────────────
  const [form, setForm]                   = useState({ username: user?.username || '', email: user?.email || '' })
  const [profileMsg, setProfileMsg]       = useState({ type: '', text: '' })
  const [savingProfile, setSavingProfile] = useState(false)

  // ─── Password ─────────────────────────────────────────
  const [pwForm, setPwForm]     = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwMsg, setPwMsg]       = useState({ type: '', text: '' })
  const [savingPw, setSavingPw] = useState(false)

  // Refresh from server on mount to ensure latest data
  useEffect(() => {
    api.get('/auth/me').then(r => {
      updateUser(r.data)
      setForm({ username: r.data.username, email: r.data.email })
    }).catch(() => {})
  }, [])

  const updateProfile = async e => {
    e.preventDefault()
    setSavingProfile(true); setProfileMsg({ type: '', text: '' })
    try {
      const { data } = await api.put('/auth/profile', form)
      updateUser(data)
      setProfileMsg({ type: 'success', text: '✓ Profile updated' })
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.error || 'Update failed' })
    } finally { setSavingProfile(false) }
  }

  const updatePassword = async e => {
    e.preventDefault()
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match' })
      return
    }
    setSavingPw(true); setPwMsg({ type: '', text: '' })
    try {
      await api.put('/auth/password', {
        currentPassword: pwForm.currentPassword,
        newPassword:     pwForm.newPassword,
      })
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPwMsg({ type: 'success', text: '✓ Password updated' })
    } catch (err) {
      setPwMsg({ type: 'error', text: err.response?.data?.error || 'Update failed' })
    } finally { setSavingPw(false) }
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Profile Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account and preferences</p>
      </div>

      {/* ─── Profile info card ─────────────────────────── */}
      <div className="card p-6 mb-5">
        <h2 className="font-semibold text-slate-700 mb-4">Account Information</h2>
        {profileMsg.text && (
          <div className={profileMsg.type === 'error' ? 'alert-error' : 'alert-success'}>
            {profileMsg.text}
          </div>
        )}
        <form onSubmit={updateProfile}>
          <div className="form-group">
            <label className="label">Username</label>
            <input className="input" value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <button type="submit" className="btn-primary" disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      {/* ─── Password card ────────────────────────────── */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-700 mb-4">Change Password</h2>
        {pwMsg.text && (
          <div className={pwMsg.type === 'error' ? 'alert-error' : 'alert-success'}>
            {pwMsg.text}
          </div>
        )}
        <form onSubmit={updatePassword}>
          <div className="form-group">
            <label className="label">Current password</label>
            <input type="password" className="input" value={pwForm.currentPassword}
              onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="label">New password (min 8 characters)</label>
            <input type="password" className="input" value={pwForm.newPassword}
              onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="label">Confirm new password</label>
            <input type="password" className="input" value={pwForm.confirmPassword}
              onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))} required />
          </div>
          <button type="submit" className="btn-primary" disabled={savingPw}>
            {savingPw ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>
    </div>
  )
}
