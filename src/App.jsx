import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'

import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './hooks/AuthContext'
import AppLayout from './layouts/AppLayout'

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
      <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Loading...</p>
    </div>
  </div>
)

// Auth Pages
const LoginPage = lazy(() => import('./pages/LoginPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const SetPasswordPage = lazy(() => import('./pages/SetPasswordPage'))
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'))
const ProfileSettings = lazy(() => import('./pages/ProfileSettings'))

// Admin Pages
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const Announcements = lazy(() => import('./pages/admin/Announcements'))
const AttendanceAdmin = lazy(() => import('./pages/admin/AttendanceAdmin'))
const AttendanceDashboard = lazy(() => import('./pages/admin/AttendanceDashboard'))
const BatchManagement = lazy(() => import('./pages/admin/BatchManagement'))
const AdminInternManagement = lazy(() => import('./pages/admin/InternManagement'))
const TLManagement = lazy(() => import('./pages/admin/TLManagement'))
const UserArchive = lazy(() => import('./pages/admin/UserArchive'))
const WeeklyPlans = lazy(() => import('./pages/admin/WeeklyPlans'))

// Intern Pages
const InternDashboard = lazy(() => import('./pages/intern/InternDashboard'))
const MyScores = lazy(() => import('./pages/intern/MyScores'))
const MyUpdates = lazy(() => import('./pages/intern/MyUpdates'))

// TL Pages
const EvaluationsPage = lazy(() => import('./pages/tl/EvaluationsPage'))
const TLInternManagement = lazy(() => import('./pages/tl/InternManagement'))
const SubmissionsView = lazy(() => import('./pages/tl/SubmissionsView'))
const TLDashboard = lazy(() => import('./pages/tl/TLDashboard'))


function HomeRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />
  if (user?.role === 'TECHNICAL_LEAD') return <Navigate to="/tl" replace />
  if (user?.role === 'INTERN') return <Navigate to="/intern" replace />
  return <Navigate to="/login" replace />
}


function AR({ roles, children }) {
  return <ProtectedRoute roles={roles}>{children}</ProtectedRoute>
}


export default function App() {
  // Silent health warmup to reduce backend cold start impact
  useEffect(() => {
    api.get('/health').catch(() => { /* ignore error */ })
  }, [])

  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/set-password" element={<SetPasswordPage mode="activate" />} />
            <Route path="/reset-password" element={<SetPasswordPage mode="reset" />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />

            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<HomeRedirect />} />

              <Route path="/profile" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />

              <Route path="/admin" element={<AR roles={['ADMIN']}><AdminDashboard /></AR>} />
              <Route path="/admin/tls" element={<AR roles={['ADMIN']}><TLManagement /></AR>} />
              <Route path="/admin/interns" element={<AR roles={['ADMIN']}><AdminInternManagement /></AR>} />
              <Route path="/admin/archive" element={<AR roles={['ADMIN']}><UserArchive /></AR>} />
              <Route path="/batches" element={<AR roles={['ADMIN']}><BatchManagement /></AR>} />
              <Route path="/tasks" element={<AR roles={['ADMIN', 'TECHNICAL_LEAD']}><WeeklyPlans /></AR>} />
              <Route path="/attendance" element={<AR roles={['ADMIN', 'TECHNICAL_LEAD']}><AttendanceAdmin /></AR>} />
              <Route path="/attendance/dashboard" element={<AR roles={['ADMIN', 'TECHNICAL_LEAD']}><AttendanceDashboard /></AR>} />
              <Route path="/submissions" element={<AR roles={['ADMIN', 'TECHNICAL_LEAD']}><SubmissionsView /></AR>} />
              <Route path="/evaluations" element={<AR roles={['ADMIN', 'TECHNICAL_LEAD']}><EvaluationsPage /></AR>} />
              <Route path="/notifications" element={<ProtectedRoute><Announcements /></ProtectedRoute>} />

              <Route path="/tl" element={<AR roles={['TECHNICAL_LEAD']}><TLDashboard /></AR>} />
              <Route path="/tl/interns" element={<AR roles={['TECHNICAL_LEAD']}><TLInternManagement /></AR>} />

              <Route path="/intern" element={<AR roles={['INTERN']}><InternDashboard /></AR>} />
              <Route path="/my-updates" element={<AR roles={['INTERN']}><MyUpdates /></AR>} />
              <Route path="/my-scores" element={<AR roles={['INTERN']}><MyScores /></AR>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}

