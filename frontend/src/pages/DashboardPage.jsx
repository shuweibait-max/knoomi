import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLatestMood, useMyGroups } from '../hooks/useFetch'

const MOOD_LABEL = {1:'Very low',2:'Low',3:'Low',4:'Below avg',5:'Neutral',6:'Okay',7:'Good',8:'Good',9:'Great',10:'Excellent'}
const moodColor  = s => s >= 7 ? 'text-green-600' : s >= 4 ? 'text-amber-500' : 'text-red-600'

const ACTION_ICONS = {
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-brand-600">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  ),
  groups: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-brand-600">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  ),
  mood: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-brand-600">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-brand-600">
      <path strokeLinecap="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  ),
}

const ACTIONS = [
<<<<<<< HEAD
  { to: '/chat',   iconKey: 'chat',   title: 'Talk to AI',     desc: 'Chat with Knoomi AI' },
=======
  { to: '/chat',   iconKey: 'chat',   title: 'Talk to AI',     desc: 'Chat with MindBridge AI' },
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48
  { to: '/groups', iconKey: 'groups', title: 'Group Therapy',  desc: 'Join a support group' },
  { to: '/mood',   iconKey: 'mood',   title: 'Log Mood',       desc: 'Track how you feel' },
  { to: '/video',  iconKey: 'video',  title: 'Video Session',  desc: 'Meet with a therapist' },
]

export default function DashboardPage() {
  const { user }                  = useAuth()
  const { data: mood }            = useLatestMood()
  const { data: groups = [], loading }     = useMyGroups()
  const hour    = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-7">
        <h1 className="text-xl font-bold text-slate-800">{greeting}, {user?.username}</h1>
        <p className="text-slate-500 text-sm mt-1">How are you feeling today?</p>
      </div>

      {/* Mood snapshot */}
      {mood ? (
        <div className="card p-5 mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Last check-in</div>
            <div className={`text-2xl font-bold ${moodColor(mood.score)}`}>
              {mood.score}/10 — {MOOD_LABEL[mood.score]}
            </div>
            {mood.note && <div className="text-sm text-slate-400 mt-1">"{mood.note}"</div>}
          </div>
          <Link to="/mood" className="btn-secondary btn-sm shrink-0">Log today →</Link>
        </div>
      ) : (
        <div className="card p-5 mb-6 flex items-center justify-between gap-4 bg-brand-50 border-brand-200">
          <div>
            <div className="font-semibold text-brand-700">Start tracking your mood</div>
            <div className="text-sm text-brand-500 mt-0.5">Daily check-ins help you spot patterns</div>
          </div>
          <Link to="/mood" className="btn-primary btn-sm shrink-0">Log now →</Link>
        </div>
      )}

      {/* Quick actions */}
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Quick actions</p>
      <div className="grid grid-cols-2 gap-3 mb-7">
        {ACTIONS.map(({ to, iconKey, title, desc }) => (
          <Link key={to} to={to}
            className="card p-5 hover:border-brand-300 hover:shadow-md transition-all block">
            <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center mb-3">
              {ACTION_ICONS[iconKey]}
            </div>
            <div className="font-semibold text-slate-700 text-sm">{title}</div>
            <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
          </Link>
        ))}
      </div>

      {/* My groups */}
      {!loading && groups && groups.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">My groups</p>
          <div className="space-y-2 mb-6">
            {groups.map(g => (
              <Link key={g.id} to={`/groups/${g.id}`}
                className="card p-4 flex items-center justify-between hover:border-brand-300 transition-colors">
                <div>
                  <div className="font-semibold text-sm text-slate-700">{g.name}</div>
                  <div className="text-xs text-slate-400">{g.topic || 'General'} · {g.member_count} members</div>
                </div>
                <span className="text-slate-300 text-sm">→</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Crisis banner */}
      <div className="rounded-xl bg-red-50 border border-red-100 p-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-red-700 text-sm">Need immediate help?</div>
          <div className="text-xs text-red-400 mt-0.5">Crisis resources are always available</div>
        </div>
        <Link to="/crisis" className="btn-danger btn-sm shrink-0">Get help</Link>
      </div>
    </div>
  )
}
