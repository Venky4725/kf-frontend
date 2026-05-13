import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'

export default function AttendanceAdmin() {
  const { user } = useAuth()
  
  // Data states
  const [attendance, setAttendance] = useState([])
  const [batches, setBatches] = useState([])
  const [interns, setInterns] = useState([])
  
  // UI states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [markingAttendance, setMarkingAttendance] = useState({})
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])
  const [statusFilter, setStatusFilter] = useState('')
  
  // Edit/Delete states
  const [editingRecord, setEditingRecord] = useState(null)
  const [editForm, setEditForm] = useState({ status: '', notes: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [deletingRecord, setDeletingRecord] = useState(null)
  
  const isAdmin = user?.role === 'ADMIN'
  const isTechLead = user?.role === 'TECHNICAL_LEAD'

  // Create lookup maps for efficient data mapping
  const internMap = useMemo(() => {
    return Object.fromEntries(interns.map(intern => [intern.id, intern]))
  }, [interns])

  const batchMap = useMemo(() => {
    return Object.fromEntries(batches.map(batch => [batch.id, batch]))
  }, [batches])

  // Load data with proper error handling
  const loadData = useCallback(async () => {
    if (!user?.id) return
    
    setLoading(true)
    setError('')
    
    try {
      const params = { limit: 500 }
      
      if (searchQuery) params.search = searchQuery
      if (batchFilter) params.batch_id = batchFilter
      if (dateFilter) params.date = dateFilter
      if (statusFilter) params.status = statusFilter
      
      const [attendanceRes, batchesRes, internsRes] = await Promise.all([
        api.get('/attendance', { params }),
        api.get('/batches', { params: { limit: 500 } }),
        api.get('/profiles', { params: { role: 'INTERN', limit: 500 } }),
      ])
      
      setAttendance(attendanceRes.data || [])
      setBatches(batchesRes.data || [])
      setInterns(internsRes.data || [])
    } catch (err) {
      console.error('Failed to load attendance:', err)
      setError(err.response?.data?.detail || 'Failed to load attendance records.')
      setAttendance([])
      setBatches([])
      setInterns([])
    } finally {
      setLoading(false)
    }
  }, [user, searchQuery, batchFilter, dateFilter, statusFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Mark attendance (create or update)
  const markAttendance = async (internId, status) => {
    const key = `${internId}-${dateFilter}`
    setMarkingAttendance(prev => ({ ...prev, [key]: true }))
    setError('')
    setSuccessMessage('')
    
    try {
      // Check if attendance already exists for this intern on this date
      const existingRecord = attendance.find(
        a => a.user_id === internId && a.date === dateFilter
      )
      
      if (existingRecord) {
        // Update existing attendance
        await api.put(`/attendance/${existingRecord.id}`, {
          status: status.toUpperCase(),
        })
        setSuccessMessage(`Attendance updated to ${status}`)
      } else {
        // Create new attendance
        await api.post('/attendance', {
          user_id: internId,
          day: dateFilter,
          status: status.toUpperCase(),
        })
        setSuccessMessage(`Attendance marked as ${status}`)
      }
      
      setTimeout(() => setSuccessMessage(''), 3000)
      await loadData()
    } catch (err) {
      console.error('Failed to mark attendance:', err)
      setError(err.response?.data?.detail || 'Failed to mark attendance.')
    } finally {
      setMarkingAttendance(prev => ({ ...prev, [key]: false }))
    }
  }

  // Get attendance for specific intern on selected date
  const getAttendanceForIntern = (internId) => {
    return attendance.find(a => a.user_id === internId && a.date === dateFilter)
  }

  // Open edit modal
  const openEditModal = (record) => {
    setEditingRecord(record)
    setEditForm({
      status: record.status || '',
      notes: record.notes || ''
    })
    setError('')
  }

  // Close edit modal
  const closeEditModal = () => {
    setEditingRecord(null)
    setEditForm({ status: '', notes: '' })
    setError('')
  }

  // Update attendance
  const updateAttendance = async (e) => {
    e.preventDefault()
    if (!editingRecord) return
    
    setEditLoading(true)
    setError('')
    
    try {
      await api.put(`/attendance/${editingRecord.id}`, {
        status: editForm.status.toUpperCase(),
        notes: editForm.notes || null,
      })
      
      setSuccessMessage('Attendance updated successfully')
      setTimeout(() => setSuccessMessage(''), 3000)
      closeEditModal()
      await loadData()
    } catch (err) {
      console.error('Failed to update attendance:', err)
      setError(err.response?.data?.detail || 'Failed to update attendance.')
    } finally {
      setEditLoading(false)
    }
  }

  // Delete attendance
  const deleteAttendance = async (recordId, internName, date) => {
    if (!window.confirm(`Delete attendance record for ${internName} on ${date}?\n\nThis action cannot be undone.`)) {
      return
    }
    
    setDeletingRecord(recordId)
    setError('')
    
    try {
      await api.delete(`/attendance/${recordId}`)
      setSuccessMessage('Attendance record deleted successfully')
      setTimeout(() => setSuccessMessage(''), 3000)
      await loadData()
    } catch (err) {
      console.error('Failed to delete attendance:', err)
      if (err.response?.status === 403) {
        setError('Access denied: You can only delete attendance records for interns in your assigned batches.')
      } else {
        setError(err.response?.data?.detail || 'Failed to delete attendance record.')
      }
    } finally {
      setDeletingRecord(null)
    }
  }

  // Clear filters
  const clearFilters = () => {
    setSearchQuery('')
    setBatchFilter('')
    setDateFilter(new Date().toISOString().split('T')[0])
    setStatusFilter('')
  }

  const hasActiveFilters = searchQuery || batchFilter || statusFilter

  // Get status badge styling
  const getStatusBadge = (status) => {
    const styles = {
      present: 'bg-green-100 text-green-700 border-green-300',
      absent: 'bg-rose-100 text-rose-700 border-rose-300',
      late: 'bg-amber-100 text-amber-700 border-amber-300',
    }
    return styles[status?.toLowerCase()] || 'bg-slate-100 text-slate-700 border-slate-300'
  }

  // Enhanced attendance records with proper data mapping
  const enhancedAttendance = useMemo(() => {
    return attendance.map(record => {
      const intern = internMap[record.user_id]
      const batch = intern ? batchMap[intern.batch_id] : null
      
      return {
        ...record,
        intern_name: intern?.name || record.intern_name || 'Unknown',
        intern_email: intern?.email || 'N/A',
        batch_name: batch?.name || record.batch_name || 'Unassigned',
        batch_id: intern?.batch_id || null,
      }
    })
  }, [attendance, internMap, batchMap])

  // Filtered interns for marking attendance
  const filteredInterns = useMemo(() => {
    return interns.filter(intern => {
      if (!intern) return false
      if (searchQuery && !intern.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (batchFilter && intern.batch_id !== parseInt(batchFilter)) return false
      return true
    })
  }, [interns, searchQuery, batchFilter])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-slate-900">Attendance Management</h1>
        <p className="text-sm text-slate-500 mt-2">
          {isAdmin ? 'Mark, edit, and manage attendance records for all interns.' : 'Mark and manage attendance records for interns in your batches.'}
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

      {/* Messages */}
      {error && (
        <div className="card border border-rose-200 bg-rose-50 text-rose-700">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="card border border-green-200 bg-green-50 text-green-700">
          {successMessage}
        </div>
      )}

      {/* Search and Filters */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Search & Filter</h2>
          {hasActiveFilters && (
            <button 
              onClick={clearFilters}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-all duration-200"
            >
              Clear Filters
            </button>
          )}
        </div>
        
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search Intern</label>
            <input
              type="text"
              className="input"
              placeholder="Search by name..."
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Date</label>
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
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Mark Attendance for {new Date(dateFilter).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Click on the status buttons to mark or update attendance for each intern.
        </p>
        
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600"></div>
            <p className="mt-2 text-slate-500">Loading interns...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Intern Name</th>
                  <th className="th">Email</th>
                  <th className="th">Batch</th>
                  <th className="th">Current Status</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInterns.map((intern) => {
                  const attendanceRecord = getAttendanceForIntern(intern.id)
                  const currentStatus = attendanceRecord?.status?.toLowerCase()
                  const key = `${intern.id}-${dateFilter}`
                  const isMarking = markingAttendance[key]
                  const batch = batchMap[intern.batch_id]
                  
                  return (
                    <tr key={intern.id}>
                      <td className="td font-medium">{intern.name}</td>
                      <td className="td text-sm text-slate-600">{intern.email}</td>
                      <td className="td">{batch?.name || 'Unassigned'}</td>
                      <td className="td">
                        {currentStatus ? (
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getStatusBadge(currentStatus)}`}>
                            {currentStatus.toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-sm">Not marked</span>
                        )}
                      </td>
                      <td className="td">
                        <div className="flex gap-2">
                          <button
                            onClick={() => markAttendance(intern.id, 'present')}
                            disabled={isMarking}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                              currentStatus === 'present'
                                ? 'bg-green-100 text-green-700 border border-green-300'
                                : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                          >
                            {isMarking ? '...' : 'Present'}
                          </button>
                          <button
                            onClick={() => markAttendance(intern.id, 'absent')}
                            disabled={isMarking}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                              currentStatus === 'absent'
                                ? 'bg-rose-100 text-rose-700 border border-rose-300'
                                : 'bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                          >
                            {isMarking ? '...' : 'Absent'}
                          </button>
                          <button
                            onClick={() => markAttendance(intern.id, 'late')}
                            disabled={isMarking}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                              currentStatus === 'late'
                                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                : 'bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                          >
                            {isMarking ? '...' : 'Late'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredInterns.length === 0 && (
                  <tr>
                    <td className="td text-slate-500 text-center" colSpan="5">
                      {searchQuery || batchFilter ? 'No interns found matching your filters.' : 'No interns found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Attendance History with Edit/Delete */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Attendance History</h2>
        
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600"></div>
            <p className="mt-2 text-slate-500">Loading attendance records...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Intern Name</th>
                  <th className="th">Email</th>
                  <th className="th">Batch</th>
                  <th className="th">Date</th>
                  <th className="th">Status</th>
                  {isAdmin && <th className="th">Notes</th>}
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enhancedAttendance.map((record) => (
                  <tr key={record.id}>
                    <td className="td font-medium">{record.intern_name}</td>
                    <td className="td text-sm text-slate-600">{record.intern_email}</td>
                    <td className="td">{record.batch_name}</td>
                    <td className="td">{record.date}</td>
                    <td className="td">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getStatusBadge(record.status)}`}>
                        {record.status?.toUpperCase() || 'UNKNOWN'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="td text-sm text-slate-600">
                        {record.notes || '—'}
                      </td>
                    )}
                    <td className="td">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(record)}
                          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-all duration-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteAttendance(record.id, record.intern_name, record.date)}
                          disabled={deletingRecord === record.id}
                          className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingRecord === record.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {enhancedAttendance.length === 0 && (
                  <tr>
                    <td className="td text-slate-500 text-center" colSpan={isAdmin ? 7 : 6}>
                      {hasActiveFilters || dateFilter ? 'No attendance records found matching your filters.' : 'No attendance records found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Attendance Modal */}
      {editingRecord && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Edit Attendance</h2>
            <p className="text-sm text-slate-500 mb-4">
              Editing attendance for <span className="font-semibold">{editingRecord.intern_name}</span> on {editingRecord.date}
            </p>
            
            {error && (
              <div className="mb-4 p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={updateAttendance} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Status *
                </label>
                <select
                  className="input"
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  required
                >
                  <option value="">Select status...</option>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                </select>
              </div>
              
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    className="input min-h-[80px] resize-y"
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="Add any notes about this attendance record..."
                    rows={3}
                  />
                </div>
              )}
              
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                  disabled={editLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary disabled:opacity-50"
                  disabled={editLoading}
                >
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
