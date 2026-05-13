import { useEffect, useMemo, useState, useCallback } from 'react'
import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts'
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns'

// Color palette
const COLORS = {
  present: '#10b981',
  absent: '#ef4444',
  late: '#f59e0b',
  primary: '#0ea5e9',
  secondary: '#8b5cf6',
}

const CHART_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

export default function AttendanceDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Data states
  const [attendanceData, setAttendanceData] = useState([])
  const [interns, setInterns] = useState([])
  const [batches, setBatches] = useState([])
  
  // Filter states
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  })
  const [batchFilter, setBatchFilter] = useState('')
  const [techStackFilter, setTechStackFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [internSearch, setInternSearch] = useState('')
  const [selectedIntern, setSelectedIntern] = useState('')
  
  const isAdmin = user?.role === 'ADMIN'

  // Load data
  const loadData = useCallback(async () => {
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
      
      const [attendanceRes, internsRes, batchesRes] = await Promise.all([
        api.get('/attendance', { params }),
        api.get('/profiles', { params: { role: 'INTERN', limit: 500 } }),
        api.get('/batches', { params: { limit: 500 } }),
      ])
      
      setAttendanceData(attendanceRes.data || [])
      setInterns(internsRes.data || [])
      setBatches(batchesRes.data || [])
    } catch (err) {
      console.error('Failed to load dashboard data:', err)
      setError(err.response?.data?.detail || 'Failed to load attendance dashboard.')
    } finally {
      setLoading(false)
    }
  }, [user, dateRange, batchFilter, statusFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const todayRecords = attendanceData.filter(r => r.date === today)
    
    const totalInterns = interns.length
    const presentToday = todayRecords.filter(r => r.status?.toLowerCase() === 'present').length
    const absentToday = todayRecords.filter(r => r.status?.toLowerCase() === 'absent').length
    const lateToday = todayRecords.filter(r => r.status?.toLowerCase() === 'late').length
    
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
  }, [attendanceData, interns])

  // Batch-wise analytics
  const batchAnalytics = useMemo(() => {
    const batchMap = {}
    
    batches.forEach(batch => {
      batchMap[batch.id] = {
        name: batch.name,
        present: 0,
        absent: 0,
        late: 0,
        total: 0
      }
    })
    
    attendanceData.forEach(record => {
      const intern = interns.find(i => i.id === record.user_id)
      if (intern && intern.batch_id && batchMap[intern.batch_id]) {
        const status = record.status?.toLowerCase()
        if (status === 'present') batchMap[intern.batch_id].present++
        else if (status === 'absent') batchMap[intern.batch_id].absent++
        else if (status === 'late') batchMap[intern.batch_id].late++
        batchMap[intern.batch_id].total++
      }
    })
    
    return Object.values(batchMap).map(batch => ({
      ...batch,
      percentage: batch.total > 0 
        ? ((batch.present + batch.late) / batch.total * 100).toFixed(1)
        : 0
    }))
  }, [attendanceData, interns, batches])

  // Attendance distribution (pie chart data)
  const distributionData = useMemo(() => {
    const present = attendanceData.filter(r => r.status?.toLowerCase() === 'present').length
    const absent = attendanceData.filter(r => r.status?.toLowerCase() === 'absent').length
    const late = attendanceData.filter(r => r.status?.toLowerCase() === 'late').length
    
    return [
      { name: 'Present', value: present, color: COLORS.present },
      { name: 'Absent', value: absent, color: COLORS.absent },
      { name: 'Late', value: late, color: COLORS.late },
    ]
  }, [attendanceData])

  // Attendance trends (line chart data)
  const trendData = useMemo(() => {
    const dateMap = {}
    
    attendanceData.forEach(record => {
      if (!dateMap[record.date]) {
        dateMap[record.date] = { date: record.date, present: 0, absent: 0, late: 0 }
      }
      const status = record.status?.toLowerCase()
      if (status === 'present') dateMap[record.date].present++
      else if (status === 'absent') dateMap[record.date].absent++
      else if (status === 'late') dateMap[record.date].late++
    })
    
    return Object.values(dateMap).sort((a, b) => new Date(a.date) - new Date(b.date))
  }, [attendanceData])

  // Individual intern analytics
  const individualInternData = useMemo(() => {
    if (!selectedIntern) return null
    
    const internRecords = attendanceData.filter(r => r.user_id === parseInt(selectedIntern))
    const present = internRecords.filter(r => r.status?.toLowerCase() === 'present').length
    const absent = internRecords.filter(r => r.status?.toLowerCase() === 'absent').length
    const late = internRecords.filter(r => r.status?.toLowerCase() === 'late').length
    const total = internRecords.length
    
    const percentage = total > 0 ? ((present + late) / total * 100).toFixed(1) : 0
    
    const trendData = internRecords
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(r => ({
        date: r.date,
        status: r.status?.toLowerCase() === 'present' ? 1 : 0
      }))
    
    return {
      present,
      absent,
      late,
      total,
      percentage,
      trendData
    }
  }, [selectedIntern, attendanceData])

  // Filtered interns for search
  const filteredInterns = useMemo(() => {
    return interns.filter(intern => 
      intern.name?.toLowerCase().includes(internSearch.toLowerCase())
    )
  }, [interns, internSearch])

  // Export functions
  const exportToCSV = () => {
    const headers = ['Date', 'Intern Name', 'Batch', 'Status']
    const rows = attendanceData.map(record => {
      const intern = interns.find(i => i.id === record.user_id)
      const batch = batches.find(b => b.id === intern?.batch_id)
      return [
        record.date,
        record.intern_name || intern?.name || 'Unknown',
        record.batch_name || batch?.name || 'Unassigned',
        record.status
      ]
    })
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `attendance_${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    window.URL.revokeObjectURL(url)
  }

  const clearFilters = () => {
    setDateRange({
      start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
      end: format(new Date(), 'yyyy-MM-dd')
    })
    setBatchFilter('')
    setTechStackFilter('')
    setStatusFilter('')
    setInternSearch('')
    setSelectedIntern('')
  }

  const hasActiveFilters = batchFilter || techStackFilter || statusFilter || internSearch || selectedIntern

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
              className="px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 rounded-md transition-all duration-200 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
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
                {batches.map(batch => (
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
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No batch data available" />
          )}
        </div>

        {/* Attendance Distribution */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Attendance Distribution</h2>
          {distributionData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No distribution data available" />
          )}
        </div>

        {/* Attendance Trends */}
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
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
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
      </section>

      {/* Individual Intern Analytics */}
      <section className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Individual Intern Analytics</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Select Intern</label>
            <select
              className="input"
              value={selectedIntern}
              onChange={(e) => setSelectedIntern(e.target.value)}
            >
              <option value="">Choose an intern...</option>
              {filteredInterns.map(intern => (
                <option key={intern.id} value={intern.id}>{intern.name}</option>
              ))}
            </select>
          </div>
          
          {individualInternData && (
            <>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{individualInternData.present}</div>
                  <div className="text-xs text-slate-600">Present</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-rose-600">{individualInternData.absent}</div>
                  <div className="text-xs text-slate-600">Absent</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-600">{individualInternData.late}</div>
                  <div className="text-xs text-slate-600">Late</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{individualInternData.percentage}%</div>
                  <div className="text-xs text-slate-600">Rate</div>
                </div>
              </div>
              
              <div className="md:col-span-2">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Attendance Trend</h3>
                {individualInternData.trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={individualInternData.trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={[0, 1]} ticks={[0, 1]} />
                      <Tooltip />
                      <Line type="monotone" dataKey="status" stroke={COLORS.primary} strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState message="No trend data for selected intern" />
                )}
              </div>
            </>
          )}
        </div>
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
