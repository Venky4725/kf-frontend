import React, { useEffect, useState, useMemo, useCallback } from 'react'
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
  
  // History filter states (separate from marking filters)
  const [historyStartDate, setHistoryStartDate] = useState('')
  const [historyEndDate, setHistoryEndDate] = useState('')
  const [historyBatchFilter, setHistoryBatchFilter] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState('')
  const [historySearchQuery, setHistorySearchQuery] = useState('')
  
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

  // Mark attendance (create or update) - ENHANCED ERROR HANDLING
  const markAttendance = async (internId, status) => {
    const key = `${internId}-${dateFilter}`
    setMarkingAttendance(prev => ({ ...prev, [key]: true }))
    setError('')
    setSuccessMessage('')
    
    try {
      // Check if attendance already exists for this intern on this date - FIXED: Handle both 'date' and 'day' fields
      const existingRecord = attendance.find(a => {
        const recordDate = a.date || a.day
        return a.user_id === internId && recordDate === dateFilter
      })
      
      if (existingRecord) {
        // Update existing attendance
        await api.put(`/attendance/${existingRecord.id}`, {
          status: status.toUpperCase(),
        })
        setSuccessMessage(`✅ Attendance updated to ${status.toUpperCase()}`)
      } else {
        // Create new attendance
        await api.post('/attendance', {
          user_id: internId,
          day: dateFilter,
          status: status.toUpperCase(),
        })
        setSuccessMessage(`✅ Attendance marked as ${status.toUpperCase()}`)
      }
      
      setTimeout(() => setSuccessMessage(''), 3000)
      
      // Refresh data to update UI
      await loadData()
    } catch (err) {
      console.error('❌ Failed to mark attendance:', err)
      
      // Differentiate error types
      if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('❌ Network error: Unable to connect to server. Please check your connection.')
      } else if (err.response?.status === 400) {
        const detail = err.response?.data?.detail || 'Invalid request'
        setError(`❌ Validation error: ${detail}`)
      } else if (err.response?.status === 422) {
        const detail = err.response?.data?.detail || 'Invalid data format'
        setError(`❌ Data error: ${detail}`)
      } else if (err.response?.status === 500) {
        const detail = err.response?.data?.detail || 'Server error'
        setError(`❌ Server error: ${detail}. Please try again or contact support.`)
      } else if (err.response?.status === 403) {
        setError('❌ Access denied: You do not have permission to mark attendance for this intern.')
      } else {
        setError(err.response?.data?.detail || '❌ Failed to mark attendance. Please try again.')
      }
    } finally {
      setMarkingAttendance(prev => ({ ...prev, [key]: false }))
    }
  }

  // Get attendance for specific intern on selected date - FIXED: Handle both 'date' and 'day' fields
  const getAttendanceForIntern = (internId) => {
    return attendance.find(a => {
      const recordDate = a.date || a.day
      return a.user_id === internId && recordDate === dateFilter
    })
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

  // Update attendance - ENHANCED ERROR HANDLING
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
      
      setSuccessMessage('✅ Attendance updated successfully')
      setTimeout(() => setSuccessMessage(''), 3000)
      closeEditModal()
      
      // Refresh data to update UI
      await loadData()
    } catch (err) {
      console.error('❌ Failed to update attendance:', err)
      
      // Differentiate error types
      if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('❌ Network error: Unable to connect to server.')
      } else if (err.response?.status === 400 || err.response?.status === 422) {
        const detail = err.response?.data?.detail || 'Invalid data'
        setError(`❌ Validation error: ${detail}`)
      } else if (err.response?.status === 500) {
        setError('❌ Server error: Please try again or contact support.')
      } else if (err.response?.status === 403) {
        setError('❌ Access denied: You cannot edit this attendance record.')
      } else if (err.response?.status === 404) {
        setError('❌ Attendance record not found.')
      } else {
        setError(err.response?.data?.detail || '❌ Failed to update attendance.')
      }
    } finally {
      setEditLoading(false)
    }
  }

  // Delete attendance - ENHANCED ERROR HANDLING
  const deleteAttendance = async (recordId, internName, date) => {
    if (!window.confirm(`Delete attendance record for ${internName} on ${date}?\n\nThis action cannot be undone.`)) {
      return
    }
    
    setDeletingRecord(recordId)
    setError('')
    
    try {
      await api.delete(`/attendance/${recordId}`)
      setSuccessMessage('✅ Attendance record deleted successfully')
      setTimeout(() => setSuccessMessage(''), 3000)
      
      // Refresh data to update UI
      await loadData()
    } catch (err) {
      console.error('❌ Failed to delete attendance:', err)
      
      // Differentiate error types
      if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('❌ Network error: Unable to connect to server.')
      } else if (err.response?.status === 403) {
        setError('❌ Access denied: You can only delete attendance records for interns in your assigned batches.')
      } else if (err.response?.status === 404) {
        setError('❌ Attendance record not found.')
      } else if (err.response?.status === 500) {
        setError('❌ Server error: Please try again or contact support.')
      } else {
        setError(err.response?.data?.detail || '❌ Failed to delete attendance record.')
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

  // Enhanced attendance records with SAFE data mapping - FIXED: Normalize date field
  const enhancedAttendance = useMemo(() => {
    if (!Array.isArray(attendance)) return []
    
    return attendance.map(record => {
      if (!record) return null
      
      const intern = internMap[record.user_id]
      const batch = intern ? batchMap[intern.batch_id] : null
      
      // Normalize date field - backend uses 'day', frontend expects 'date'
      const normalizedDate = record.date || record.day || 'N/A'
      
      return {
        ...record,
        date: normalizedDate, // Ensure 'date' field exists
        day: normalizedDate,  // Keep 'day' for compatibility
        intern_name: intern?.name || record.intern_name || 'Unknown',
        intern_email: intern?.email || 'N/A',
        batch_name: batch?.name || record.batch_name || 'Unassigned',
        batch_id: intern?.batch_id || null,
      }
    }).filter(Boolean) // Remove null entries
  }, [attendance, internMap, batchMap])
  
  // Filtered history records with separate controls
  const filteredHistoryRecords = useMemo(() => {
    let filtered = [...enhancedAttendance]
    
    // Date range filter
    if (historyStartDate || historyEndDate) {
      filtered = filtered.filter(record => {
        const recordDate = record.date
        if (!recordDate || recordDate === 'N/A') return false
        
        const normalized = new Date(recordDate).toISOString().split('T')[0]
        
        if (historyStartDate && normalized < historyStartDate) return false
        if (historyEndDate && normalized > historyEndDate) return false
        
        return true
      })
    }
    
    // Batch filter
    if (historyBatchFilter) {
      filtered = filtered.filter(record => {
        const batchId = record.batch_id
        const filterBatchId = historyBatchFilter
        
        const matches = 
          batchId === filterBatchId ||
          String(batchId) === String(filterBatchId) ||
          Number(batchId) === Number(filterBatchId)
        
        return matches
      })
    }
    
    // Status filter
    if (historyStatusFilter) {
      filtered = filtered.filter(record => {
        return record.status?.toLowerCase() === historyStatusFilter.toLowerCase()
      })
    }
    
    // Search filter
    if (historySearchQuery && historySearchQuery.trim()) {
      const searchTerm = historySearchQuery.trim().toLowerCase()
      filtered = filtered.filter(record => {
        const nameMatch = record.intern_name?.toLowerCase().includes(searchTerm)
        const emailMatch = record.intern_email?.toLowerCase().includes(searchTerm)
        const batchMatch = record.batch_name?.toLowerCase().includes(searchTerm)
        
        return nameMatch || emailMatch || batchMatch
      })
    }
    
    return filtered
  }, [enhancedAttendance, historyStartDate, historyEndDate, historyBatchFilter, historyStatusFilter, historySearchQuery])
  
  // Clear history filters
  const clearHistoryFilters = () => {
    setHistoryStartDate('')
    setHistoryEndDate('')
    setHistoryBatchFilter('')
    setHistoryStatusFilter('')
    setHistorySearchQuery('')
  }
  
  const hasHistoryFilters = historyStartDate || historyEndDate || historyBatchFilter || historyStatusFilter || historySearchQuery

  // Filtered interns for marking attendance - FIXED: Proper batch comparison
  const filteredInterns = useMemo(() => {
    return interns.filter(intern => {
      if (!intern) return false
      
      // Apply search filter
      if (searchQuery) {
        const matchesSearch = intern.name?.toLowerCase().includes(searchQuery.toLowerCase())
        if (!matchesSearch) return false
      }
      
      // Apply batch filter - FIXED: Handle type coercion properly
      if (batchFilter) {
        const internBatchId = intern.batch_id
        const filterBatchId = batchFilter
        
        // Try multiple comparison strategies
        const exactMatch = internBatchId === filterBatchId
        const stringMatch = String(internBatchId) === String(filterBatchId)
        const numberMatch = Number(internBatchId) === Number(filterBatchId)
        
        const matches = exactMatch || stringMatch || numberMatch
        
        if (!matches) return false
      }
      
      // Hide interns who already have attendance marked for selected date
      const hasAttendance = attendance.some(a => {
        const recordDate = a.date || a.day
        return a.user_id === intern.id && recordDate === dateFilter
      })
      
      // Only show interns without attendance for the selected date
      return !hasAttendance
    })
  }, [interns, searchQuery, batchFilter, attendance, dateFilter])

  // Already marked interns for the selected date - FIXED: Proper batch comparison
  const markedInterns = useMemo(() => {
    return interns.filter(intern => {
      if (!intern) return false
      
      // Apply search filter
      if (searchQuery && !intern.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false
      
      // Apply batch filter - FIXED: Handle type coercion properly
      if (batchFilter) {
        const internBatchId = intern.batch_id
        const filterBatchId = batchFilter
        
        const matches = 
          internBatchId === filterBatchId ||
          String(internBatchId) === String(filterBatchId) ||
          Number(internBatchId) === Number(filterBatchId)
        
        if (!matches) return false
      }
      
      // Only show interns who have attendance marked for selected date
      const hasAttendance = attendance.some(a => {
        const recordDate = a.date || a.day
        return a.user_id === intern.id && recordDate === dateFilter
      })
      
      return hasAttendance
    })
  }, [interns, searchQuery, batchFilter, attendance, dateFilter])

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
                      {markedInterns.length > 0 
                        ? `All ${markedInterns.length} intern(s) have attendance marked for this date. See "Already Marked" section below.`
                        : (searchQuery || batchFilter ? 'No interns found matching your filters.' : 'No interns found.')
                      }
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Already Marked Interns Section */}
      {markedInterns.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Already Marked for {new Date(dateFilter).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            These interns already have attendance marked for the selected date. You can update their status by clicking the buttons.
          </p>
          
          <div className="overflow-x-auto">
            <table className="table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Intern Name</th>
                  <th className="th">Email</th>
                  <th className="th">Batch</th>
                  <th className="th">Current Status</th>
                  <th className="th">Update Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {markedInterns.map((intern) => {
                  const attendanceRecord = getAttendanceForIntern(intern.id)
                  const currentStatus = attendanceRecord?.status?.toLowerCase()
                  const key = `${intern.id}-${dateFilter}`
                  const isMarking = markingAttendance[key]
                  const batch = batchMap[intern.batch_id]
                  
                  return (
                    <tr key={intern.id} className="bg-green-50/30">
                      <td className="td font-medium">{intern.name}</td>
                      <td className="td text-sm text-slate-600">{intern.email}</td>
                      <td className="td">{batch?.name || 'Unassigned'}</td>
                      <td className="td">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getStatusBadge(currentStatus)}`}>
                          {currentStatus?.toUpperCase() || 'UNKNOWN'}
                        </span>
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
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attendance History with Edit/Delete */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Attendance History</h2>
        
        {/* History Filters */}
        <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">History Filters</h3>
            {hasHistoryFilters && (
              <button 
                onClick={clearHistoryFilters}
                className="px-2 py-1 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-all"
              >
                Clear History Filters
              </button>
            )}
          </div>
          
          <div className="grid md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
              <input
                type="date"
                className="input text-sm"
                value={historyStartDate}
                onChange={(e) => setHistoryStartDate(e.target.value)}
                placeholder="From date..."
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
              <input
                type="date"
                className="input text-sm"
                value={historyEndDate}
                onChange={(e) => setHistoryEndDate(e.target.value)}
                placeholder="To date..."
              />
            </div>
            
            {isAdmin && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Batch</label>
                <select 
                  className="input text-sm" 
                  value={historyBatchFilter} 
                  onChange={(e) => setHistoryBatchFilter(e.target.value)}
                >
                  <option value="">All Batches</option>
                  {batches.map((batch) => (
                    <option key={batch.id} value={batch.id}>{batch.name}</option>
                  ))}
                </select>
              </div>
            )}
            
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select 
                className="input text-sm" 
                value={historyStatusFilter} 
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
              >
                <option value="">All Status</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Search</label>
              <input
                type="text"
                className="input text-sm"
                placeholder="Search intern..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          {hasHistoryFilters && (
            <div className="mt-3 text-xs text-slate-600">
              Showing <span className="font-semibold text-slate-900">{filteredHistoryRecords.length}</span> of{' '}
              <span className="font-semibold text-slate-900">{enhancedAttendance.length}</span> records
            </div>
          )}
        </div>
        
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
                {filteredHistoryRecords
                  .sort((a, b) => {
                    // Sort by date descending (most recent first)
                    const dateA = new Date(a.date)
                    const dateB = new Date(b.date)
                    return dateB - dateA
                  })
                  .slice(0, 100) // Limit to 100 records for performance
                  .map((record) => (
                  <tr key={record.id}>
                    <td className="td font-medium">{record.intern_name}</td>
                    <td className="td text-sm text-slate-600">{record.intern_email}</td>
                    <td className="td">{record.batch_name}</td>
                    <td className="td">
                      {record.date && record.date !== 'N/A' ? (
                        <span className="text-slate-900">
                          {new Date(record.date).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </span>
                      ) : (
                        <span className="text-slate-400">No date</span>
                      )}
                    </td>
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
                          onClick={() => {
                            const formattedDate = record.date && record.date !== 'N/A' 
                              ? new Date(record.date).toLocaleDateString('en-US', { 
                                  year: 'numeric', 
                                  month: 'short', 
                                  day: 'numeric' 
                                })
                              : record.date
                            deleteAttendance(record.id, record.intern_name, formattedDate)
                          }}
                          disabled={deletingRecord === record.id}
                          className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingRecord === record.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredHistoryRecords.length === 0 && (
                  <tr>
                    <td className="td text-slate-500 text-center" colSpan={isAdmin ? 7 : 6}>
                      {hasHistoryFilters ? 'No attendance records found matching your history filters.' : 'No attendance records found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {filteredHistoryRecords.length > 100 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="font-semibold">Showing first 100 records</p>
                    <p className="text-xs mt-1">
                      You have {filteredHistoryRecords.length} total records matching your filters. 
                      Use the date range filter above to narrow down results.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Attendance Modal */}
      {editingRecord && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Edit Attendance</h2>
            <p className="text-sm text-slate-500 mb-4">
              Editing attendance for <span className="font-semibold">{editingRecord.intern_name}</span> on{' '}
              {editingRecord.date && editingRecord.date !== 'N/A' ? (
                <span className="font-semibold">
                  {new Date(editingRecord.date).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </span>
              ) : (
                <span className="font-semibold">Unknown date</span>
              )}
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
