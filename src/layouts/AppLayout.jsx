import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { useAuth } from '../hooks/AuthContext'
import api from '../lib/api'

const NAV = {
  ADMIN: [
    { to: '/admin', label: 'Dashboard' },
    { to: '/admin/tls', label: 'Technical Leads' },
    { to: '/admin/interns', label: 'Interns' },
    { to: '/batches', label: 'Batches' },
    { to: '/tasks', label: 'Tasks' },
    { to: '/attendance', label: 'Attendance' },
    { to: '/submissions', label: 'Submissions' },
    { to: '/evaluations', label: 'Evaluations' },
    { to: '/notifications', label: 'Notifications' },
  ],
  TECHNICAL_LEAD: [
    { to: '/tl', label: 'Dashboard' },
    { to: '/tl/interns', label: 'Interns' },
    { to: '/tasks', label: 'Tasks' },
    { to: '/submissions', label: 'Submissions' },
    { to: '/evaluations', label: 'Evaluations' },
    { to: '/attendance', label: 'Attendance' },
    { to: '/notifications', label: 'Notifications' },
  ],
  INTERN: [
    { to: '/intern', label: 'Dashboard' },
    { to: '/my-updates', label: 'My Updates' },
    { to: '/my-scores', label: 'My Scores' },
    { to: '/notifications', label: 'Notifications' },
  ],
}


export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const items = NAV[user?.role] || []
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications', {
        params: { is_read: false, limit: 500 },
      })
      setUnreadCount(res.data?.length || 0)
    } catch (err) {
      // Silently fail - don't disrupt UI
      console.error('Failed to fetch unread count:', err)
      setUnreadCount(0)
    }
  }, [])

  useEffect(() => {
    const userId = user?.id
    if (userId) {
      fetchUnreadCount()
      // Refresh count every 30 seconds
      const interval = setInterval(fetchUnreadCount, 30000)
      // Listen for notification updates
      const handleNotificationUpdate = () => fetchUnreadCount()
      window.addEventListener('notificationUpdate', handleNotificationUpdate)
      
      return () => {
        clearInterval(interval)
        window.removeEventListener('notificationUpdate', handleNotificationUpdate)
      }
    }
  }, [user?.id, fetchUnreadCount])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="w-72 bg-gradient-to-b from-brand-700 via-brand-800 to-slate-950 text-white flex flex-col shadow-2xl">
        <div className="px-6 py-6 border-b border-white/10">
<Link to="/" className="block">
            <div className="text-xs uppercase tracking-[0.25em] text-brand-200 font-semibold">Knowledge Factory</div>
            <div className="text-2xl font-black mt-2">Dashboard</div>
            <div className="text-sm text-slate-200 mt-2">{user?.role?.replace('_', ' ')}</div>
          </Link>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin' || item.to === '/tl' || item.to === '/intern'}
              className={({ isActive }) =>
                `block px-4 py-2.5 rounded-lg text-sm font-medium transition relative ${
                  isActive ? 'bg-white text-brand-800' : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="flex items-center justify-between">
                {item.label}
                {item.to === '/notifications' && unreadCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full min-w-[20px] text-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-5 border-t border-white/10">
          <div className="bg-white/5 rounded-xl p-4 mb-3">
            <div className="font-semibold truncate">{user?.name}</div>
            <div className="text-xs text-slate-300 truncate mt-1">{user?.email}</div>
          </div>
          <div className="space-y-2">
            <Link
              to="/profile"
              className="block w-full bg-white/10 hover:bg-white/20 text-white font-semibold px-4 py-2.5 rounded-lg transition text-center"
            >
              Profile Settings
            </Link>
            <button
              onClick={handleLogout}
              className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold px-4 py-2.5 rounded-lg transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
