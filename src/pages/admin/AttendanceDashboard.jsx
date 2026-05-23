import React from 'react'
import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'
import { onEvent, EVENTS } from '../../utils/events'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts'
import { format, subDays } from 'date-fns'

// Color palette
const COLORS = {
  present: '#10b981',
  absent: '#ef4444',
  late: '#f59e0b',
  primary: '#0ea5e9',
  secondary: '#8b5cf6',
}

export default function AttendanceDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  
  // Data states
  const [attendanceData, setAttendanceData] = React.useState([])
  const [interns, setInterns] = React.useState([])
  const [batches, setBatches] = React.useState([])
  const [staticLoaded, setStaticLoaded] = React.useState(false)
  const [staticLoading, setStaticLoading] = React.useState(false)

  // Filter states
  const [dateRange, setDateRange] = React.useState(() => {
    const end = new Date()
    const start = subDays(end, 30)
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd')
    }
  })
  const [batchFilter, setBatchFilter] = React.useState('')
  const [internFilter, setInternFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  
  const isAdmin = user?.role === 'ADMIN'

  // Load static data once
  const loadStaticData = React.useCallback(async () => {
    if (!user?.id || staticLoaded) return
    
    setStaticLoading(true)
    try {
      const [internsRes, batchesRes] = await Promise.all([
        api.get('/profiles', { params: { role: 'INTERN', limit: 1000 } }),
        api.get('/batches', { params: { limit: 500 } }),
      ])
      
      setInterns(internsRes.data || [])
      setBatches(batchesRes.data || [])
      setStaticLoaded(true)
    } catch (err) {
      console.error('❌ Failed to load static data:', err)
    } finally {
      setStaticLoading(false)
    }
  }, [user, staticLoaded])

  // Load dynamic attendance data
  const loadAttendanceData = React.useCallback(async () => {
    if (!user?.id) return
    
    setLoading(true)
    setError('')
    
    try {
      const params = {
        limit: 5000,
        start_date: dateRange.start,
        end_date: dateRange.end,
      }
      
      if (batchFilter) params.batch_id = batchFilter
      if (statusFilter) params.status = statusFilter
      
      const { data } = await api.get('/attendance', { params })
      setAttendanceData(data || [])
    } catch (err) {
      console.error('❌ Failed to load dashboard data:', err)
      setError(err.response?.data?.detail || 'Failed to load attendance dashboard.')
    } finally {
      setLoading(false)
    }
  }, [user, dateRange.start, dateRange.end, batchFilter, statusFilter])

  React.useEffect(() => {
    loadStaticData()
  }, [loadStaticData])

  React.useEffect(() => {
    const timer = setTimeout(() => {
      loadAttendanceData()
    }, 500)
    return () => clearTimeout(timer)
  }, [loadAttendanceData])
  
  // Listen for batch/TL/intern updates from other pages
  React.useEffect(() => {
    const cleanupBatch = onEvent(EVENTS.BATCH_UPDATED, () => {
      loadStaticData()
      loadAttendanceData()
    })
    const cleanupTL = onEvent(EVENTS.TL_UPDATED, () => {
      loadStaticData()
      loadAttendanceData()
    })
    const cleanupIntern = onEvent(EVENTS.INTERN_UPDATED, () => {
      loadStaticData()
      loadAttendanceData()
    })
    
    return () => {
      cleanupBatch()
      cleanupTL()
      cleanupIntern()
    }
  }, [])

  // Create lookup maps for efficient data access
  const internMap = React.useMemo(() => {
    return Object.fromEntries((interns || []).map(intern => [intern.id, intern]))
  }, [interns])

  const batchMap = React.useMemo(() => {
    return Object.fromEntries((batches || []).map(batch => [batch.id, batch]))
  }, [batches])

  // PERMANENT CENTRALIZED FILTERING ARCHITECTURE
  // This is the SINGLE SOURCE OF TRUTH for all filtered data
  const filteredAttendanceData = React.useMemo(() => {
    if (!Array.isArray(attendanceData)) {
      return []
    }
    
    let filtered = [...attendanceData]
    
    // STEP 1: Date Range Filter
    if (dateRange.start || dateRange.end) {
      filtered = filtered.filter(record => {
        if (!record) return false
        
        const recordDate = record.date || record.day
        if (!recordDate) return false
        
        // Normalize dates to YYYY-MM-DD for reliable comparison
        const normalizedRecordDate = new Date(recordDate).toISOString().split('T')[0]
        
        if (dateRange.start && normalizedRecordDate < dateRange.start) return false
        if (dateRange.end && normalizedRecordDate > dateRange.end) return false
        
        return true
      })
    }
    
    // STEP 2: Batch Filter (via intern batch_id)
    if (batchFilter) {
      filtered = filtered.filter(record => {
        if (!record || !record.user_id) return false
        
        const intern = internMap[record.user_id]
        if (!intern) return false
        
        // Normalize ID comparison
        return String(intern.batch_id) === String(batchFilter)
      })
    }
    
    // STEP 3: Intern Filter (specific intern selected)
    if (internFilter) {
      filtered = filtered.filter(record => {
        if (!record || !record.user_id) return false
        
        // Normalize ID comparison
        return String(record.user_id) === String(internFilter)
      })
    }
    
    // STEP 4: Status Filter
    if (statusFilter) {
      filtered = filtered.filter(record => {
        if (!record || !record.status) return false
        return record.status.toLowerCase() === statusFilter.toLowerCase()
      })
    }
    
    return filtered
  }, [attendanceData, dateRange, batchFilter, internFilter, statusFilter, internMap, batchMap])

  // Active filter summary for UX clarity
  const activeFilterSummary = React.useMemo(() => {
    const filters = []
    
    if (dateRange.start || dateRange.end) {
      const start = dateRange.start || 'any'
      const end = dateRange.end || 'any'
      filters.push(`Date: ${start} to ${end}`)
    }
    
    if (batchFilter) {
      const batch = batches.find(b => String(b.id) === String(batchFilter))
      filters.push(`Batch: ${batch?.name || batchFilter}`)
    }
    
    if (internFilter) {
      const intern = interns.find(i => String(i.id) === String(internFilter))
      filters.push(`Intern: ${intern?.name || internFilter}`)
    }
    
    if (statusFilter) {
      filters.push(`Status: ${statusFilter.toUpperCase()}`)
    }
    
    return {
      hasFilters: filters.length > 0,
      summary: filters.join(' | '),
      count: filteredAttendanceData.length,
      total: attendanceData.length
    }
  }, [dateRange, batchFilter, internFilter, statusFilter, batches, interns, filteredAttendanceData, attendanceData])

  // Calculate summary metrics from FILTERED data
  const summaryMetrics = React.useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const todayRecords = (filteredAttendanceData || []).filter(r => {
      const recordDate = r?.date || r?.day
      return recordDate === today
    })
    
    // Count unique interns in filtered data
    const uniqueInternIds = new Set(filteredAttendanceData.map(r => r.user_id))
    const totalInterns = uniqueInternIds.size
    
    const presentToday = todayRecords.filter(r => r?.status?.toLowerCase() === 'present').length
    const absentToday = todayRecords.filter(r => r?.status?.toLowerCase() === 'absent').length
    const lateToday = todayRecords.filter(r => r?.status?.toLowerCase() === 'late').length
    
    const attendancePercentage = totalInterns > 0 
      ? ((presentToday + lateToday) / totalInterns * 100).toFixed(1)
      : 0
    
    return {
      totalInterns,
      presentToday,
      absentToday,
      lateToday,
      attendancePercentage
    }
  }, [filteredAttendanceData])

  // Batch-wise analytics from FILTERED data
  const batchAnalytics = React.useMemo(() => {
    try {
      const batchStatsMap = {}
      
      if (!Array.isArray(batches)) return []
      
      // Initialize batch stats
      batches.forEach(batch => {
        if (!batch?.id || !batch?.name) return
        batchStatsMap[batch.id] = {
          name: batch.name,
          present: 0,
          absent: 0,
          late: 0,
          total: 0
        }
      })
      
      // Count from FILTERED attendance
      if (!Array.isArray(filteredAttendanceData)) return []
      
      filteredAttendanceData.forEach(record => {
        if (!record?.user_id || !record?.status) return
        
        const intern = internMap[record.user_id]
        if (intern?.batch_id && batchStatsMap[intern.batch_id]) {
          const status = record.status.toLowerCase()
          if (status === 'present') batchStatsMap[intern.batch_id].present++
          else if (status === 'absent') batchStatsMap[intern.batch_id].absent++
          else if (status === 'late') batchStatsMap[intern.batch_id].late++
          batchStatsMap[intern.batch_id].total++
        }
      })
      
      return Object.values(batchStatsMap)
        .filter(batch => batch.total > 0)
        .map(batch => ({
          ...batch,
          percentage: ((batch.present + batch.late) / batch.total * 100).toFixed(1)
        }))
    } catch (err) {
      console.error('Error in batchAnalytics:', err)
      return []
    }
  }, [filteredAttendanceData, interns, batches, internMap])

  // Attendance distribution from FILTERED data
  const distributionData = React.useMemo(() => {
    const present = (filteredAttendanceData || []).filter(r => r?.status?.toLowerCase() === 'present').length
    const absent = (filteredAttendanceData || []).filter(r => r?.status?.toLowerCase() === 'absent').length
    const late = (filteredAttendanceData || []).filter(r => r?.status?.toLowerCase() === 'late').length
    
    const total = present + absent + late
    
    return [
      { 
        name: 'Present', 
        value: present, 
        color: COLORS.present,
        percentage: total > 0 ? ((present / total) * 100).toFixed(1) : 0
      },
      { 
        name: 'Absent', 
        value: absent, 
        color: COLORS.absent,
        percentage: total > 0 ? ((absent / total) * 100).toFixed(1) : 0
      },
      { 
        name: 'Late', 
        value: late, 
        color: COLORS.late,
        percentage: total > 0 ? ((late / total) * 100).toFixed(1) : 0
      },
    ].filter(item => item.value > 0)
  }, [filteredAttendanceData])

  // Attendance trends from FILTERED data
  const trendData = React.useMemo(() => {
    try {
      const dateStatsMap = {}
      
      if (!Array.isArray(filteredAttendanceData)) return []
      
      filteredAttendanceData.forEach(record => {
        if (!record) return
        
        const recordDate = record.date || record.day
        if (!recordDate) return
        
        if (!dateStatsMap[recordDate]) {
          dateStatsMap[recordDate] = { date: recordDate, present: 0, absent: 0, late: 0 }
        }
        
        const status = record.status?.toLowerCase()
        if (status === 'present') dateStatsMap[recordDate].present++
        else if (status === 'absent') dateStatsMap[recordDate].absent++
        else if (status === 'late') dateStatsMap[recordDate].late++
      })
      
      return Object.values(dateStatsMap)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(item => ({
          ...item,
          formattedDate: format(new Date(item.date), 'MMM dd')
        }))
    } catch (err) {
      console.error('Error in trendData:', err)
      return []
    }
  }, [filteredAttendanceData])









  // Export FILTERED data to CSV
  const exportToCSV = () => {
    if (!filteredAttendanceData || filteredAttendanceData.length === 0) {
      alert('No attendance data to export. Try adjusting your filters.')
      return
    }
    
    try {
      // Simple CSV escaping - wrap everything in quotes and escape internal quotes
      const escapeCSV = (value) => {
        if (value === null || value === undefined) return '""'
        const str = String(value)
        return `"${str.replace(/"/g, '""')}"`
      }
      
      // Headers
      const headers = ['Date', 'Intern Name', 'Email', 'Batch', 'Status']
      const headerRow = headers.map(h => escapeCSV(h)).join(',')
      
      // Data rows from FILTERED data
      const dataRows = filteredAttendanceData
        .filter(record => record)
        .map((record, index) => {
          const intern = internMap[record.user_id]
          const batch = intern ? batchMap[intern.batch_id] : null
          
          // Format date as YYYY-MM-DD
          let dateStr = 'N/A'
          const rawDate = record.date || record.day
          if (rawDate) {
            try {
              const d = new Date(rawDate)
              if (!isNaN(d.getTime())) {
                const year = d.getFullYear()
                const month = String(d.getMonth() + 1).padStart(2, '0')
                const day = String(d.getDate()).padStart(2, '0')
                dateStr = `${year}-${month}-${day}`
              } else {
                dateStr = String(rawDate)
              }
            } catch (err) {
              console.error('Date parse error:', rawDate, err)
              dateStr = String(rawDate)
            }
          }
          
          const row = [
            dateStr,
            record.intern_name || intern?.name || 'Unknown',
            intern?.email || 'N/A',
            record.batch_name || batch?.name || 'Unassigned',
            record.status || 'Unknown'
          ]
          
          return row.map(v => escapeCSV(v)).join(',')
        })
      
      // Combine
      const csvLines = [headerRow, ...dataRows]
      const csvContent = csvLines.join('\n')
      
      // Create blob with UTF-8 BOM
      const BOM = '\uFEFF'
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      // Filename
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      link.download = `attendance_${year}-${month}-${day}.csv`
      
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('❌ CSV export error:', err)
      alert('Failed to export CSV: ' + err.message)
    }
  }

  // Clear all filters
  const clearFilters = () => {
    try {
      const end = new Date()
      const start = subDays(end, 30)
      setDateRange({
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd')
      })
    } catch (err) {
      console.error('❌ Error in clearFilters:', err)
      // Fallback
      const end = new Date()
      const start = new Date(end)
      start.setDate(start.getDate() - 30)
      setDateRange({
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
      })
    }
    setBatchFilter('')
    setInternFilter('')
    setStatusFilter('')
  }

  const hasActiveFilters = batchFilter || internFilter || statusFilter

  // Loading skeleton
  if (loading && attendanceData.length === 0) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-slate-200 rounded-2xl"></div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-xl"></div>
            ))}
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="h-80 bg-slate-200 rounded-xl"></div>
            <div className="h-80 bg-slate-200 rounded-xl"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl bg-gradient-to-br from-cyan-600 via-blue-700 to-indigo-900 text-white p-8 shadow-2xl">
        <div className="text-xs uppercase tracking-[0.25em] text-cyan-200 font-semibold">
          {isAdmin ? 'Administrator' : 'Technical Lead'}
        </div>
        <h1 className="text-4xl font-black mt-3">Attendance Analytics Dashboard</h1>
        <p className="text-sm text-slate-200 mt-3 max-w-3xl">
          Comprehensive attendance insights with real-time analytics, trends, and batch-wise performance metrics.
        </p>
      </section>

      {error && (
        <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>
      )}

      {/* Active Filter Summary */}
      {activeFilterSummary.hasFilters && (
        <div className="card border-l-4 border-cyan-500 bg-cyan-50">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-cyan-900 mb-1">Active Filters</h3>
              <p className="text-sm text-cyan-700">{activeFilterSummary.summary}</p>
              <p className="text-xs text-cyan-600 mt-2">
                <span className="font-semibold">Results:</span> {activeFilterSummary.count} of {activeFilterSummary.total} records
                {activeFilterSummary.count === 0 && (
                  <span className="text-amber-600 font-semibold ml-2">⚠️ No records match current filters</span>
                )}
              </p>
            </div>
            <button
              onClick={clearFilters}
              className="ml-4 px-3 py-1.5 text-xs font-medium text-cyan-700 hover:text-cyan-900 hover:bg-cyan-100 rounded-md transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Filters Section */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Filters & Controls</h2>
          <div className="flex gap-2">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-all duration-200"
              >
                Clear Filters
              </button>
            )}
            <button
              onClick={exportToCSV}
              disabled={!filteredAttendanceData || filteredAttendanceData.length === 0}
              className="px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 rounded-md transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={activeFilterSummary.hasFilters 
                ? `Export ${filteredAttendanceData?.length || 0} filtered records` 
                : `Export all ${filteredAttendanceData?.length || 0} records`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
              {activeFilterSummary.hasFilters && (
                <span className="text-xs opacity-90">({filteredAttendanceData?.length || 0})</span>
              )}
            </button>
          </div>
        </div>
        
        <div className="grid md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
            <input
              type="date"
              className="input"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
            <input
              type="date"
              className="input"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            />
          </div>
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Batch</label>
              <select 
                className="input" 
                value={batchFilter} 
                onChange={(e) => {
                  setBatchFilter(e.target.value)
                  setInternFilter('')
                }}
              >
                <option value="">All Batches</option>
                {(batches || []).map(batch => (
                  <option key={batch.id} value={batch.id}>{batch.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Intern</label>
            <select 
              className="input" 
              value={internFilter} 
              onChange={(e) => setInternFilter(e.target.value)}
              disabled={isAdmin && !batchFilter}
            >
              <option value="">All Interns</option>
              {filteredInternsForDropdown.map(intern => (
                <option key={intern.id} value={intern.id}>{intern.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <SummaryCard
          label="Total Interns"
          value={summaryMetrics.totalInterns}
          gradient="from-blue-500/90 via-blue-600/90 to-blue-700/90"
          accentColor="bg-blue-400/20"
        />
        <SummaryCard
          label="Present Today"
          value={summaryMetrics.presentToday}
          gradient="from-emerald-500/90 via-emerald-600/90 to-emerald-700/90"
          accentColor="bg-emerald-400/20"
        />
        <SummaryCard
          label="Absent Today"
          value={summaryMetrics.absentToday}
          gradient="from-rose-500/90 via-rose-600/90 to-rose-700/90"
          accentColor="bg-rose-400/20"
        />
        <SummaryCard
          label="Late Today"
          value={summaryMetrics.lateToday}
          gradient="from-amber-500/90 via-amber-600/90 to-amber-700/90"
          accentColor="bg-amber-400/20"
        />
        <SummaryCard
          label="Attendance Rate"
          value={`${summaryMetrics.attendancePercentage}%`}
          gradient="from-purple-500/90 via-purple-600/90 to-purple-700/90"
          accentColor="bg-purple-400/20"
        />
      </section>

      {/* Charts Grid */}
      <section className="grid lg:grid-cols-2 gap-6">
        {/* Batch-wise Analytics */}
        <div className="relative overflow-hidden rounded-2xl bg-white shadow-lg border border-slate-200/60 transition-all duration-300 hover:shadow-xl">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-transparent to-transparent pointer-events-none"></div>
          
          <div className="relative p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Batch-wise Attendance</h2>
            {batchAnalytics.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={batchAnalytics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="present" fill={COLORS.present} name="Present" />
                  <Bar dataKey="absent" fill={COLORS.absent} name="Absent" />
                  <Bar dataKey="late" fill={COLORS.late} name="Late" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No batch data available" />
            )}
          </div>
        </div>

        {/* Attendance Distribution */}
        <div className="relative overflow-hidden rounded-2xl bg-white shadow-lg border border-slate-200/60 transition-all duration-300 hover:shadow-xl">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-transparent to-transparent pointer-events-none"></div>
          
          <div className="relative p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Attendance Distribution</h2>
            {distributionData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={false}
                      outerRadius={90}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {distributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name, props) => [`${value} (${props.payload.percentage}%)`, name]} />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      formatter={(value, entry) => `${value}: ${entry.payload.value} (${entry.payload.percentage}%)`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </>
            ) : (
              <EmptyState message="No distribution data available" />
            )}
          </div>
        </div>

        {/* Attendance Trends */}
        <div className="relative overflow-hidden rounded-2xl bg-white shadow-lg border border-slate-200/60 transition-all duration-300 hover:shadow-xl lg:col-span-2">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-transparent to-transparent pointer-events-none"></div>
          
          <div className="relative p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Attendance Trends Over Time</h2>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.present} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={COLORS.present} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorAbsent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.absent} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={COLORS.absent} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.late} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={COLORS.late} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="formattedDate" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="present" stroke={COLORS.present} fillOpacity={1} fill="url(#colorPresent)" name="Present" />
                  <Area type="monotone" dataKey="absent" stroke={COLORS.absent} fillOpacity={1} fill="url(#colorAbsent)" name="Absent" />
                  <Area type="monotone" dataKey="late" stroke={COLORS.late} fillOpacity={1} fill="url(#colorLate)" name="Late" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No trend data available" />
            )}
          </div>
        </div>
      </section>

    </div>
  )
}

// Reusable Components
function SummaryCard({ label, value, gradient, accentColor }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
      {/* Glassmorphism background with gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-95`}></div>
      
      {/* Glossy top reflection */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-transparent opacity-60"></div>
      
      {/* Subtle border */}
      <div className="absolute inset-0 rounded-2xl border border-white/20"></div>
      
      {/* Content */}
      <div className="relative px-6 py-5">
        {/* Accent decoration */}
        <div className={`absolute top-0 right-0 w-24 h-24 ${accentColor} rounded-full blur-3xl opacity-40 group-hover:opacity-60 transition-opacity duration-300`}></div>
        
        <div className="relative">
          <div className="text-xs uppercase tracking-wider text-white/80 font-semibold mb-2">
            {label}
          </div>
          <div className="text-4xl font-black text-white drop-shadow-lg">
            {value}
          </div>
        </div>
      </div>
      
      {/* Bottom shine effect */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
      <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <p className="text-sm font-medium">{message}</p>
    </div>
  )
}
