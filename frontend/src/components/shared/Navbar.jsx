import { useLocation } from 'react-router-dom'

const PAGE_TITLES = {
  '/':        'Dashboard',
  '/chat':    'AI Support',
  '/groups':  'Groups',
  '/mood':    'Mood Tracker',
  '/video':   'Video Session',
  '/crisis':  'Crisis Help',
  '/profile': 'My Profile',
}

export default function Navbar() {
  const location = useLocation()

  const title = Object.entries(PAGE_TITLES).find(([path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  )?.[1] ?? 'Knoomi'

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center px-6 shrink-0">
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
    </header>
  )
}
