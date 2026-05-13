import { useEffect, useState } from 'react'

import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'

export default function AttendanceAdmin() {
  const { user } = useAuth()
  const [attendance, setAttendance] = useState([])
  const [batches, setBatches] = useState([])
  const [interns, setInterns] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [markingAttendance, setMarkingAttendance] = useState({})
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])
  const [statusFilter, setStatusFilter] = useState('')
  
  const isAdmin = user?.role === 'ADMIN'
  const isTechLead = user?.role === 'TECHNICAL_LEAD'

  async function load() {
    if (!user?.id) return
    
    setLoading(true)
    try {
      const params = {
        limit: 500,
      }
      
      if (searchQuery) params.search = searchQuery
      if (batchFilter) params.batch_id = batchFilter
      if (dateFilter) params.date = dateFilter
      if (statusFilter) params.status = statusFilter
      
      const [attendanceList, batchList, internList] = await Promise.all([
        api.get('/attendance', { params }),
        // Backend filters batches for Tech Lead automatically
        api.get('/batches', { params: { limit: 500 } }),
        api.get('/profiles', { params: { role: 'INTERN', limit: 500 } }),
      ])
      
      console.log('📊 Attendance API Response:', attendanceList.data)
      console.log('👥 Interns API Response:', internList.data)
      console.log('📚 Batches API Response:', batchList.data)
      
      setAttendance(attendanceList.data || [])
      setBatches(batchList.data || [])
      setInterns(internList.data || [])
      setError('')
    } catch (err) {
      console.error('Failed to load attendance:', err)
      setError(err.response?.data?.detail || 'Failed to load attendance records.')
      setAttendance([])
      setBatches([])
      setInterns([])
    } finally {
      setLoading(false)
    }
  }

  async function markAttendance(internId, status) {
    const key = `${internId}-${dateFilter}`
    setMarkingAttendance(prev => ({ ...prev, [key]: true }))
    setError('')
    setSuccessMessage('')
    
    const payload = {
      user_id: internId,
      day: dateFilter,  // ✅ Changed from "date" to "day"
      status: status.toUpperCase(),  // ✅ Convert to uppercase (PRESENT, ABSENT, LATE)
    }
    
    console.log('📤 Marking attendance with payload:', payload)
    
    try {
      const response = await api.post('/attendance', payload)
      
      console.log('✅ Attendance marked successfully:', response.data)
      
      setSuccessMessage(`Attendance marked as ${status}`)
      setTimeout(() => setSuccessMessage(''), 3000)
      
      // Reload attendance data
      await load()
    } catch (err) {
      console.error('❌ Failed to mark attendance:', err)
      console.error('Error response:', err.response?.data)
      setError(err.response?.data?.detail || 'Failed to mark attendance.')
    } finally {
      setMarkingAttendance(prev => ({ ...prev, [key]: false }))
    }
  }

  function getAttendanceForIntern(internId) {
    if (!attendance || !Array.isArray(attendance)) {
      console.warn('⚠️ Attendance data is not an array:', attendance)
      return null
    }
    return attendance.find(a => a?.user_id === internId && a?.date === dateFilter)
  }

  function getBatchName(batchId) {
    if (!batchId) return 'Unassigned'
    if (!batches || !Array.isArray(batches)) {
      console.warn('⚠️ Batches data is not an array:', batches)
      return 'Unassigned'
    }
    const batch = batches.find(b => b?.id === batchId)
    return batch?.name || 'Unassigned'
  }

  useEffect(() => {
    load()
  }, [user, searchQuery, batchFilter, dateFilter, statusFilter])

  function clearFilters() {
    setSearchQuery('')
    setBatchFilter('')
    setDateFilter(new Date().toISOString().split('T')[0])
    setStatusFilter('')
  }

  const hasActiveFilters = searchQuery || batchFilter || dateFilter || statusFilter

  function getStatusBadge(status) {
    const styles = {
      present: 'bg-green-100 text-green-700 border-green-300',
      absent: 'bg-rose-100 text-rose-700 border-rose-300',
      late: 'bg-amber-100 text-amber-700 border-amber-300',
    }
    return styles[status?.toLowerCase()] || 'bg-slate-100 text-slate-700 border-slate-300'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Attendance</h1>
        <p className="text-sm text-slate-500 mt-2">
          {isAdmin ? 'Mark and view attendance records for all interns.' : 'Mark and view attendance records for interns in your batches.'}
        </p>
        <div className="mt-4">
          <a
            href="/attendance/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 rounded-md shadow-sm transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            View Analytics Dashboard
          </a>
        </div>
      </div>

      {error && <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>}
      {successMessage && <div className="card border border-green-200 bg-green-50 text-green-700">{successMessage}</div>}

      {/* Search and Filters */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Search & Filter</h2>
          {hasActiveFilters && (
            <button 
              onClick={clearFilters}
              className="text-sm text-brand-700 font-semibold hover:text-brand-800"
            >
              Clear All Filters
            </button>
          )}
        </div>
        
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
            <input
              type="text"
              className="input"
              placeholder="Search by intern name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Batch</label>
              <select 
                className="input" 
                value={batchFilter} 
                onChange={(e) => setBatchFilter(e.target.value)}
              >
                <option value="">All Batches</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>{batch.name}</option>
                ))}
              </select>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Date</label>
            <input
              type="date"
              className="input"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Status</label>
            <select 
              className="input" 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
            </select>
          </div>
        </div>
      </div>

      {/* Mark Attendance Section */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Mark Attendance for {dateFilter}</h2>
        <p className="text-sm text-slate-500 mb-4">Click on the status buttons to mark attendance for each intern.</p>
        
        {loading && (
          <div className="text-center py-8 text-slate-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            <p className="mt-2">Loading interns...</p>
          </div>
        )}
        
        {!loading && (
          <div className="overflow-x-auto">
            <table className="table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Intern Name</th>
                  <th className="th">Batch</th>
                  <th className="th">Current Status</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {interns
                  .filter(intern => {
                    if (!intern) return false
                    if (searchQuery && !intern.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false
                    if (batchFilter && intern.batch_id !== parseInt(batchFilter)) return false
                    return true
                  })
                  .map((intern) => {
                    if (!intern?.id) {
                      console.warn('⚠️ Invalid intern object:', intern)
                      return null
                    }
                    
                    const attendanceRecord = getAttendanceForIntern(intern.id)
                    const currentStatus = attendanceRecord?.status
                    const key = `${intern.id}-${dateFilter}`
                    const isMarking = markingAttendance[key]
                    
                    // Debug log
                    if (!intern.batch_id) {
                      console.warn('⚠️ Intern with missing batch_id:', {
                        id: intern.id,
                        name: intern.name,
                        batch_id: intern.batch_id,
                        full_record: intern
                      })
                    }
                    
                    return (
                      <tr key={intern.id}>
                        <td className="td font-medium">{intern.name || 'Unknown'}</td>
                        <td className="td">{getBatchName(intern.batch_id)}</td>
                        <td className="td">
                          {currentStatus ? (
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getStatusBadge(currentStatus)}`}>
                              {currentStatus}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-sm">Not marked</span>
                          )}
                        </td>
                        <td className="td">
                          <div className="flex gap-2">
                            <button
                              onClick={() => markAttendance(intern.id, 'present')}
                              disabled={isMarking || currentStatus === 'present'}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                currentStatus === 'present'
                                  ? 'bg-green-100 text-green-700 border border-green-300 cursor-not-allowed'
                                  : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed'
                              }`}
                            >
                              {isMarking ? '...' : 'Present'}
                            </button>
                            <button
                              onClick={() => markAttendance(intern.id, 'absent')}
                              disabled={isMarking || currentStatus === 'absent'}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                currentStatus === 'absent'
                                  ? 'bg-rose-100 text-rose-700 border border-rose-300 cursor-not-allowed'
                                  : 'bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed'
                              }`}
                            >
                              {isMarking ? '...' : 'Absent'}
                            </button>
                            <button
                              onClick={() => markAttendance(intern.id, 'late')}
                              disabled={isMarking || currentStatus === 'late'}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                currentStatus === 'late'
                                  ? 'bg-amber-100 text-amber-700 border border-amber-300 cursor-not-allowed'
                                  : 'bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed'
                              }`}
                            >
                              {isMarking ? '...' : 'Late'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                  .filter(Boolean)}
                {(!interns || interns.length === 0) && (
                  <tr>
                    <td className="td text-slate-500 text-center" colSpan="4">
                      No interns found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Attendance History */}
      <div className="card overflow-x-auto">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Attendance History</h2>
        
        {loading && (
          <div className="text-center py-8 text-slate-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            <p className="mt-2">Loading attendance records...</p>
          </div>
        )}
        
        {!loading && (
          <table className="table">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Intern Name</th>
                <th className="th">Batch</th>
                <th className="th">Date</th>
                <th className="th">Status</th>
                {isAdmin && <th className="th">Notes</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendance && Array.isArray(attendance) && attendance.map((record) => {
                if (!record) {
                  console.warn('⚠️ Invalid attendance record:', record)
                  return null
                }
                
                // Debug log for attendance records
                console.log('Attendance row:', record)
                
                if (!record.batch_name || record.batch_name === 'Unassigned') {
                  console.warn('⚠️ Attendance record with missing/invalid batch_name:', {
                    id: record.id,
                    intern_name: record.intern_name,
                    batch_name: record.batch_name,
                    user_id: record.user_id,
                    date: record.date,
                    full_record: record
                  })
                }
                
                return (
                  <tr key={record.id || `${record.user_id}-${record.date}`}>
                    <td className="td font-medium">{record.intern_name ?? 'Unknown'}</td>
                    <td className="td">{record.batch_name ?? 'Unassigned'}</td>
                    <td className="td">{record.date ?? '—'}</td>
                    <td className="td">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getStatusBadge(record.status)}`}>
                        {record.status ?? 'Unknown'}
                      </span>
                    </td>
                    {isAdmin && <td className="td text-sm text-slate-600">{record.notes ?? '—'}</td>}
                  </tr>
                )
              }).filter(Boolean)}
              {(!attendance || !Array.isArray(attendance) || attendance.length === 0) && (
                <tr>
                  <td className="td text-slate-500 text-center" colSpan={isAdmin ? 5 : 4}>
                    {hasActiveFilters ? 'No attendance records found matching your filters.' : 'No attendance records found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
