import React from 'react'
import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'
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
  
  // Filter states - SAFE INITIALIZATION
  const [dateRange, setDateRange] = React.useState(() => {
    try {
      const end = new Date()
      const start = subDays(end, 30)
      return {
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd')
      }
    } catch (err) {
      console.error('❌ Error initializing dateRange:', err)
      // Fallback to manual date calculation
      const end = new Date()
      const start = new Date(end)
      start.setDate(start.getDate() - 30)
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
      }
    }
  })
  const [batchFilter, setBatchFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  const [internSearch, setInternSearch] = React.useState('')
  
  const isAdmin = user?.role === 'ADMIN'

  // Load data with proper error handling and debugging
  const loadData = React.useCallback(async () => {
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
      
      console.log('📊 Loading dashboard data with params:', params)
      
      const [attendanceRes, internsRes, batchesRes] = await Promise.all([
        api.get('/attendance', { params }),
        api.get('/profiles', { params: { role: 'INTERN', limit: 500 } }),
        api.get('/batches', { params: { limit: 500 } }),
      ])
      
      console.log('✅ Attendance Response:', attendanceRes.data)
      console.log('✅ Interns Response:', internsRes.data)
      console.log('✅ Batches Response:', batchesRes.data)
      
      // Validate and set data with fallbacks
      const validatedAttendance = Array.isArray(attendanceRes.data) ? attendanceRes.data : []
      const validatedInterns = Array.isArray(internsRes.data) ? internsRes.data : []
      const validatedBatches = Array.isArray(batchesRes.data) ? batchesRes.data : []
      
      console.log('📊 Validated data counts:', {
        attendance: validatedAttendance.length,
        interns: validatedInterns.length,
        batches: validatedBatches.length
      })
      
      // Log sample intern to see data structure
      if (validatedInterns.length > 0) {
        console.log('📋 Sample intern:', validatedInterns[0])
      }
      
      // Log sample batch to see data structure
      if (validatedBatches.length > 0) {
        console.log('📋 Sample batch:', validatedBatches[0])
      }
      
      setAttendanceData(validatedAttendance)
      setInterns(validatedInterns)
      setBatches(validatedBatches)
    } catch (err) {
      console.error('❌ Failed to load dashboard data:', err)
      setError(err.response?.data?.detail || 'Failed to load attendance dashboard.')
      setAttendanceData([])
      setInterns([])
      setBatches([])
    } finally {
      setLoading(false)
    }
  }, [user, dateRange.start, dateRange.end, batchFilter, statusFilter])

  React.useEffect(() => {
    loadData()
  }, [loadData])

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
    console.log('=== CENTRALIZED FILTERING PIPELINE ===')
    
    if (!Array.isArray(attendanceData)) {
      console.error('❌ attendanceData is not an array:', attendanceData)
      return []
    }
    
    let filtered = [...attendanceData]
    const debugCounts = { initial: filtered.length }
    
    console.log('Step 0 - Initial data:', debugCounts.initial, 'records')
    
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
      debugCounts.afterDate = filtered.length
      console.log('Step 1 - After date filter:', debugCounts.afterDate, 'records')
    } else {
      debugCounts.afterDate = filtered.length
      console.log('Step 1 - No date filter applied')
    }
    
    // STEP 2: Batch Filter (via intern batch_id)
    if (batchFilter) {
      console.log('=== BATCH FILTER STEP DETAILED ===')
      console.log('Filter value:', batchFilter, 'Type:', typeof batchFilter)
      
      // Log sample records before filtering
      if (filtered.length > 0) {
        const sampleRecord = filtered[0]
        const sampleIntern = internMap[sampleRecord.user_id]
        console.log('Sample record before batch filter:', {
          user_id: sampleRecord.user_id,
          intern: sampleIntern,
          intern_batch_id: sampleIntern?.batch_id,
          intern_batch_id_type: typeof sampleIntern?.batch_id
        })
      }
      
      filtered = filtered.filter(record => {
        if (!record || !record.user_id) return false
        
        const intern = internMap[record.user_id]
        if (!intern) {
          console.log('⚠️ No intern found for user_id:', record.user_id)
          return false
        }
        
        // PERMANENT RULE: Compare batch IDs only, handle type coercion
        const internBatchId = intern.batch_id
        const filterBatchId = batchFilter
        
        // Try multiple comparison strategies for robustness
        const exactMatch = internBatchId === filterBatchId
        const stringMatch = String(internBatchId) === String(filterBatchId)
        const numberMatch = Number(internBatchId) === Number(filterBatchId)
        
        const matches = exactMatch || stringMatch || numberMatch
        
        // Debug first few comparisons
        if (filtered.indexOf(record) < 3) {
          console.log('Batch comparison:', {
            internBatchId,
            filterBatchId,
            exactMatch,
            stringMatch,
            numberMatch,
            finalMatch: matches
          })
        }
        
        return matches
      })
      debugCounts.afterBatch = filtered.length
      console.log('Step 2 - After batch filter:', debugCounts.afterBatch, 'records', 
                  '(filtering for batch:', batchFilter, ')')
      
      if (debugCounts.afterBatch === 0 && debugCounts.afterDate > 0) {
        console.error('❌ BATCH FILTER ELIMINATED ALL RECORDS!')
        console.log('Available batch_ids in internMap:', 
          Object.values(internMap).slice(0, 5).map(i => ({ id: i.id, batch_id: i.batch_id })))
      }
    } else {
      debugCounts.afterBatch = filtered.length
      console.log('Step 2 - No batch filter applied')
    }
    
    // STEP 3: Status Filter
    if (statusFilter) {
      filtered = filtered.filter(record => {
        if (!record || !record.status) return false
        return record.status.toLowerCase() === statusFilter.toLowerCase()
      })
      debugCounts.afterStatus = filtered.length
      console.log('Step 3 - After status filter:', debugCounts.afterStatus, 'records',
                  '(filtering for status:', statusFilter, ')')
    } else {
      debugCounts.afterStatus = filtered.length
      console.log('Step 3 - No status filter applied')
    }
    
    // STEP 4: Intern Search Filter (name, email, or batch name)
    if (internSearch && internSearch.trim()) {
      const searchTerm = internSearch.trim().toLowerCase()
      
      filtered = filtered.filter(record => {
        if (!record || !record.user_id) return false
        
        const intern = internMap[record.user_id]
        if (!intern) return false
        
        const internName = (intern.name || '').toLowerCase()
        const internEmail = (intern.email || '').toLowerCase()
        const batch = batchMap[intern.batch_id]
        const batchName = (batch?.name || '').toLowerCase()
        
        return internName.includes(searchTerm) ||
               internEmail.includes(searchTerm) ||
               batchName.includes(searchTerm)
      })
      debugCounts.afterSearch = filtered.length
      console.log('Step 4 - After search filter:', debugCounts.afterSearch, 'records',
                  '(searching for:', searchTerm, ')')
    } else {
      debugCounts.afterSearch = filtered.length
      console.log('Step 4 - No search filter applied')
    }
    
    // Final summary
    console.log('=== FILTERING COMPLETE ===')
    console.log('Pipeline:', debugCounts)
    console.log('Final filtered records:', filtered.length)
    
    if (filtered.length === 0 && attendanceData.length > 0) {
      console.warn('⚠️ All records filtered out! Check filter values.')
    }
    
    return filtered
  }, [attendanceData, dateRange, batchFilter, statusFilter, internSearch, internMap, batchMap])

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
    
    if (statusFilter) {
      filters.push(`Status: ${statusFilter.toUpperCase()}`)
    }
    
    if (internSearch && internSearch.trim()) {
      filters.push(`Search: "${internSearch.trim()}"`)
    }
    
    return {
      hasFilters: filters.length > 0,
      summary: filters.join(' | '),
      count: filteredAttendanceData.length,
      total: attendanceData.length
    }
  }, [dateRange, batchFilter, statusFilter, internSearch, batches, filteredAttendanceData, attendanceData])

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
    const leaveToday = todayRecords.filter(r => r?.status?.toLowerCase() === 'leave').length
    
    const attendancePercentage = totalInterns > 0 
      ? ((presentToday + lateToday) / totalInterns * 100).toFixed(1)
      : 0
    
    return {
      totalInterns,
      presentToday,
      absentToday,
      lateToday,
      leaveToday,
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
          leave: 0,
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
          else if (status === 'leave') batchStatsMap[intern.batch_id].leave++
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
    const leave = (filteredAttendanceData || []).filter(r => r?.status?.toLowerCase() === 'leave').length
    
    const total = present + absent + late + leave
    
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
      { 
        name: 'Leave', 
        value: leave, 
        color: '#3b82f6',
        percentage: total > 0 ? ((leave / total) * 100).toFixed(1) : 0
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
          dateStatsMap[recordDate] = { date: recordDate, present: 0, absent: 0, late: 0, leave: 0 }
        }
        
        const status = record.status?.toLowerCase()
        if (status === 'present') dateStatsMap[recordDate].present++
        else if (status === 'absent') dateStatsMap[recordDate].absent++
        else if (status === 'late') dateStatsMap[recordDate].late++
        else if (status === 'leave') dateStatsMap[recordDate].leave++
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

  // DEBUG: Log all data when it changes
  React.useEffect(() => {
    console.log('=== DATA LOADED ===')
    console.log('Interns:', interns.length, interns)
    console.log('Batches:', batches.length, batches)
    console.log('Attendance:', attendanceData.length)
    
    if (interns.length > 0) {
      console.log('First intern structure:', interns[0])
      console.log('Intern batch_id type:', typeof interns[0]?.batch_id, interns[0]?.batch_id)
    }
    
    if (batches.length > 0) {
      console.log('First batch structure:', batches[0])
      console.log('Batch id type:', typeof batches[0]?.id, batches[0]?.id)
    }
  }, [interns, batches, attendanceData])

  // DEBUG: Log filter states with detailed batch analysis
  React.useEffect(() => {
    console.log('=== FILTER STATE DEBUG ===')
    console.log('batchFilter:', batchFilter, typeof batchFilter)
    console.log('internSearch:', internSearch)
    
    // Debug batch filtering issue
    if (batchFilter) {
      console.log('=== BATCH FILTER ANALYSIS ===')
      const selectedBatch = batches.find(b => String(b.id) === String(batchFilter))
      console.log('Selected batch object:', selectedBatch)
      
      // Count interns in this batch
      const internsInBatch = interns.filter(intern => {
        const internBatchId = intern.batch_id
        const matches = 
          internBatchId === batchFilter ||
          String(internBatchId) === String(batchFilter) ||
          Number(internBatchId) === Number(batchFilter)
        return matches
      })
      
      console.log('Total interns:', interns.length)
      console.log('Interns in selected batch:', internsInBatch.length)
      console.log('Sample intern batch_ids:', interns.slice(0, 3).map(i => ({ id: i.id, name: i.name, batch_id: i.batch_id })))
      
      if (internsInBatch.length === 0) {
        console.warn('⚠️ NO INTERNS FOUND IN BATCH!')
        console.log('Looking for batch_id:', batchFilter, typeof batchFilter)
        console.log('Available batch_ids in interns:', [...new Set(interns.map(i => i.batch_id))])
      }
      
      // Count attendance records for this batch
      const attendanceInBatch = attendanceData.filter(record => {
        const intern = internMap[record.user_id]
        if (!intern) return false
        
        const matches = 
          intern.batch_id === batchFilter ||
          String(intern.batch_id) === String(batchFilter) ||
          Number(intern.batch_id) === Number(batchFilter)
        return matches
      })
      
      console.log('Attendance records in batch:', attendanceInBatch.length)
    }
  }, [batchFilter, internSearch, batches, interns, attendanceData, internMap])







  // Export FILTERED data to CSV
  const exportToCSV = () => {
    console.log('=== CSV EXPORT ===')
    
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
      
      console.log('Exporting', filteredAttendanceData.length, 'filtered records')
      
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
      
      console.log('CSV Preview:', csvContent.substring(0, 200))
      console.log('Total rows:', dataRows.length)
      
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
      
      console.log('✅ CSV exported successfully')
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
    setStatusFilter('')
    setInternSearch('')
  }

  const hasActiveFilters = batchFilter || statusFilter || internSearch

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
              <select className="input" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
                <option value="">All Batches</option>
                {(batches || []).map(batch => (
                  <option key={batch.id} value={batch.id}>{batch.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
              <option value="leave">Leave</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search Intern</label>
            <input
              type="text"
              className="input"
              placeholder="Search by name..."
              value={internSearch}
              onChange={(e) => setInternSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <SummaryCard
          label="Total Interns"
          value={summaryMetrics.totalInterns}
          icon="👥"
          color="from-blue-500 to-blue-600"
        />
        <SummaryCard
          label="Present Today"
          value={summaryMetrics.presentToday}
          icon="✅"
          color="from-green-500 to-green-600"
        />
        <SummaryCard
          label="Absent Today"
          value={summaryMetrics.absentToday}
          icon="❌"
          color="from-rose-500 to-rose-600"
        />
        <SummaryCard
          label="Late Today"
          value={summaryMetrics.lateToday}
          icon="⏰"
          color="from-amber-500 to-amber-600"
        />
        <SummaryCard
          label="Attendance Rate"
          value={`${summaryMetrics.attendancePercentage}%`}
          icon="📊"
          color="from-purple-500 to-purple-600"
        />
      </section>

      {/* Charts Grid */}
      <section className="grid lg:grid-cols-2 gap-6">
        {/* Batch-wise Analytics */}
        <div className="card">
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
                <Bar dataKey="leave" fill="#3b82f6" name="Leave" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No batch data available" />
          )}
        </div>

        {/* Attendance Distribution - FIXED: Use Legend to avoid label overlap */}
        <div className="card">
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

        {/* Attendance Trends - FIXED: Use formatted dates */}
        <div className="card lg:col-span-2">
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
                  <linearGradient id="colorLeave" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
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
                <Area type="monotone" dataKey="leave" stroke="#3b82f6" fillOpacity={1} fill="url(#colorLeave)" name="Leave" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No trend data available" />
          )}
        </div>
      </section>

      {/* Attendance History Table */}
      <section className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Attendance History</h2>
          <div className="text-sm text-slate-600">
            Showing {filteredAttendanceData.length} record{filteredAttendanceData.length !== 1 ? 's' : ''}
          </div>
        </div>
        
        {filteredAttendanceData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b-2 border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Intern Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Batch</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAttendanceData
                  .sort((a, b) => {
                    const dateA = new Date(a.date || a.day)
                    const dateB = new Date(b.date || b.day)
                    return dateB - dateA // Most recent first
                  })
                  .slice(0, 100) // Limit to 100 most recent records for performance
                  .map((record, index) => {
                    const intern = internMap[record.user_id]
                    const batch = intern ? batchMap[intern.batch_id] : null
                    const recordDate = record.date || record.day
                    
                    // Format date
                    let formattedDate = 'N/A'
                    if (recordDate) {
                      try {
                        formattedDate = format(new Date(recordDate), 'MMM dd, yyyy')
                      } catch (err) {
                        formattedDate = String(recordDate)
                      }
                    }
                    
                    // Status badge color
                    let statusColor = 'bg-slate-100 text-slate-700'
                    const status = record.status?.toLowerCase()
                    if (status === 'present') statusColor = 'bg-green-100 text-green-700'
                    else if (status === 'absent') statusColor = 'bg-rose-100 text-rose-700'
                    else if (status === 'late') statusColor = 'bg-amber-100 text-amber-700'
                    else if (status === 'leave') statusColor = 'bg-blue-100 text-blue-700'
                    
                    return (
                      <tr key={`${record.user_id}-${recordDate}-${index}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-700">{formattedDate}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {record.intern_name || intern?.name || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {intern?.email || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {record.batch_name || batch?.name || 'Unassigned'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                            {record.status || 'Unknown'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
            
            {filteredAttendanceData.length > 100 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="font-semibold">Showing first 100 records</p>
                    <p className="text-xs mt-1">
                      You have {filteredAttendanceData.length} total records matching your filters. 
                      Use the date range filter above to narrow down results, or export to CSV to view all records.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState message="No attendance records found matching your filters" />
        )}
      </section>

    </div>
  )
}

// Reusable Components
function SummaryCard({ label, value, icon, color }) {
  return (
    <div className={`card bg-gradient-to-br ${color} text-white`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider opacity-90 font-semibold">{label}</div>
          <div className="text-3xl font-black mt-2">{value}</div>
        </div>
        <div className="text-4xl opacity-80">{icon}</div>
      </div>
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
