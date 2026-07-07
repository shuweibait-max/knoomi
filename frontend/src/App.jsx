import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout      from './components/shared/Layout'
import LoginPage    from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import Dashboard    from './pages/DashboardPage'
import AIChatPage   from './pages/AIChatPage'
import GroupsPage   from './pages/GroupsPage'
import GroupRoom    from './pages/GroupRoomPage'
import MoodPage     from './pages/MoodPage'
import VideoPage    from './pages/VideoPage'
import CrisisPage   from './pages/CrisisPage'
import ProfilePage  from './pages/ProfilePage'
import AdminDashboardPage  from './pages/AdminDashboardPage'
import AdminUserDetailPage from './pages/AdminUserDetailPage'
import InvitePage from './pages/InvitePage'


function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="flex items-center justify-center h-screen text-slate-400 text-sm">
      Loading…
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return !user ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/crisis"   element={<CrisisPage standalone />} />

          {/* Protected */}
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index              element={<Dashboard />} />
            <Route path="chat"        element={<AIChatPage />} />
            <Route path="groups"      element={<GroupsPage />} />
            <Route path="groups/:id"  element={<GroupRoom />} />
            <Route path="mood"        element={<MoodPage />} />
            <Route path="video"       element={<VideoPage />} />
            <Route path="crisis"      element={<CrisisPage />} />
            <Route path="profile"     element={<ProfilePage />} />
            <Route path="admin"           element={<AdminDashboardPage />} />
            <Route path="admin/users/:id" element={<AdminUserDetailPage />} />
            <Route path="/invite/:code" element={<InvitePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
