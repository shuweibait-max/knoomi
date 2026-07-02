import { useState } from 'react'
import api from '../utils/api'

export default function VideoPage() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(false)
  const [ended,   setEnded]   = useState(false)

  const start = async () => {
    setLoading(true)
    try {
      const { data } = await api.post('/video/create', {})
      setSession(data)
    } catch (err) {
      alert('Could not create session: ' + (err.response?.data?.error || err.message))
    } finally { setLoading(false) }
  }

  const end = async () => {
    if (session) await api.patch(`/video/${session.id}/end`)
    setSession(null)
    setEnded(true)
  }

  const reset = () => setEnded(false)

  if (ended) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <div className="text-5xl">✅</div>
      <h2 className="text-xl font-bold text-slate-700">Session ended</h2>
      <p className="text-slate-400 text-sm">Thank you for taking care of yourself today.</p>
      <button onClick={reset} className="btn-primary">Start a new session</button>
    </div>
  )

  if (session) return (
    <div className="flex flex-col h-screen">
      <div className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between shrink-0">
        <div>
          <div className="font-bold text-slate-800 text-sm">Video Session</div>
          <div className="text-xs text-green-500">● Live · {session.room_name}</div>
        </div>
        <button onClick={end} className="btn-danger btn-sm">End session</button>
      </div>
      <div className="flex-1">
        <iframe src={session.daily_room_url}
          allow="camera; microphone; fullscreen; display-capture"
          className="w-full h-full border-0" title="Video session" />
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Video Sessions</h1>
        <p className="text-slate-500 text-sm mt-1">Connect face-to-face with a therapist</p>
      </div>

      <div className="card p-8 text-center mb-5">
        <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-brand-600">
            <path strokeLinecap="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-700 mb-2">Start a video session</h2>
        <p className="text-slate-400 text-sm mb-6 max-w-xs mx-auto">
          A private, secure room will be created. Share the link with your therapist.
        </p>
        <button onClick={start} disabled={loading} className="btn-primary px-8">
          {loading ? 'Creating room…' : 'Start session'}
        </button>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-slate-700 text-sm mb-3">Before your session</h3>
        <ul className="space-y-2">
          {['Find a quiet, private space','Test your camera and microphone',
            'Use headphones for better audio','Have water nearby',
            'Give yourself time after to decompress'].map(tip => (
            <li key={tip} className="text-sm text-slate-500">✅ {tip}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
