import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const BASE_NAV = [
  { to: '/',        icon: '🏠', label: 'Dashboard' },
  { to: '/chat',    icon: '🤖', label: 'AI Support' },
  { to: '/groups',  icon: '👥', label: 'Groups' },
  { to: '/mood',    icon: '📊', label: 'Mood Tracker' },
  { to: '/video',   icon: '📹', label: 'Video Session' },
]

const ADMIN_NAV = [
  { to: '/admin',   icon: '🛡️', label: 'Admin Panel', admin: true },
]

const BOTTOM_NAV = [
  { to: '/crisis',  icon: '🆘', label: 'Crisis Help', danger: true },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const NAV = [
    ...BASE_NAV,
    ...(user?.role === 'admin' ? ADMIN_NAV : []),
    ...BOTTOM_NAV,
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="text-brand-600 font-bold text-base">🌿 Knoomi</div>
          <div className="text-xs text-slate-400 mt-0.5">Mental Health Support</div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, icon, label, danger, admin }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  danger
                    ? 'text-red-600 hover:bg-red-50'
                    : admin
                    ? isActive
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-purple-600 hover:bg-purple-50'
                    : isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-100">
          <NavLink
            to="/profile"
            className="flex items-center gap-2.5 mb-2.5 rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-slate-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-700 truncate">{user?.username}</div>
              <div className="text-xs text-slate-400 capitalize">{user?.role}</div>
            </div>
          </NavLink>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors"
          >
            Sign out →
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}