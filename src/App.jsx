import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './hooks/AuthContext'
import AppLayout from './layouts/AppLayout'

import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import SetPasswordPage from './pages/SetPasswordPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import ProfileSettings from './pages/ProfileSettings'

import AdminDashboard from './pages/admin/AdminDashboard'
import Announcements from './pages/admin/Announcements'
import AttendanceAdmin from './pages/admin/AttendanceAdmin'
import AttendanceDashboard from './pages/admin/AttendanceDashboard'
import BatchManagement from './pages/admin/BatchManagement'
import AdminInternManagement from './pages/admin/InternManagement'
import TLManagement from './pages/admin/TLManagement'
import UserArchive from './pages/admin/UserArchive'
import WeeklyPlans from './pages/admin/WeeklyPlans'

import InternDashboard from './pages/intern/InternDashboard'
import MyScores from './pages/intern/MyScores'
import MyUpdates from './pages/intern/MyUpdates'

import EvaluationsPage from './pages/tl/EvaluationsPage'
import TLInternManagement from './pages/tl/InternManagement'
import SubmissionsView from './pages/tl/SubmissionsView'
import TLDashboard from './pages/tl/TLDashboard'


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
  return (
    <AuthProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </AuthProvider>
  )
}
