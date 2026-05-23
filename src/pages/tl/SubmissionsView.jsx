import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'

export default function SubmissionsView() {
  const { user } = useAuth()
  const [interns, setInterns] = useState([])
  const [batches, setBatches] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [filters, setFilters] = useState({ batch_id: '', user_id: '', submitted_for: '' })
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('submitted_for')
  const [sortOrder, setSortOrder] = useState('desc')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)

  const internMap = useMemo(() => Object.fromEntries(interns.map((intern) => [intern.id, intern])), [interns])
  const batchMap = useMemo(() => Object.fromEntries(batches.map((batch) => [batch.id, batch])), [batches])
  
  // Filter interns by selected batch
  const filteredInterns = useMemo(() => {
    if (!filters.batch_id) return interns
    return interns.filter(intern => String(intern.batch_id) === String(filters.batch_id))
  }, [interns, filters.batch_id])

  // Load interns and batches once on mount
  useEffect(() => {
    async function loadData() {
      const userId = user?.id
      if (!userId) return
      
      try {
        const [profiles, batchesRes] = await Promise.all([
          api.get('/profiles', { params: { role: 'INTERN', limit: 500 } }),
          api.get('/batches', { params: { limit: 500 } }),
        ])
        
        // For Tech Lead, filter to assigned batches only
        if (user?.role === 'TECHNICAL_LEAD') {
          const allowedBatchIds = new Set(batchesRes.data.map((batch) => batch.id))
          setBatches(batchesRes.data)
          setInterns(profiles.data.filter((intern) => allowedBatchIds.has(intern.batch_id)))
        } else {
          setBatches(batchesRes.data)
          setInterns(profiles.data)
        }
      } catch (err) {
        console.error('❌ Failed to load data:', err)
        setError(err.response?.data?.detail || 'Failed to load data.')
      }
    }
    loadData()
  }, [user?.id, user?.role])

  // Load submissions after interns are loaded
  useEffect(() => {
    async function loadSubmissions() {
      if (interns.length === 0) return  // Wait for interns to load first
      
      setLoading(true)
      try {
        const params = { limit: 500 }
        if (filters.user_id) params.user_id = filters.user_id
        if (filters.submitted_for) params.submitted_for = filters.submitted_for
        if (searchQuery) params.search = searchQuery
        if (sortBy) {
          params.sort_by = sortBy
          params.order = sortOrder
        }
        
        const { data } = await api.get('/submissions', { params })
        
        // Filter to allowed interns only (batch-scoped)
        const allowedIds = new Set(interns.map((intern) => intern.id))
        let filtered = data.filter((item) => allowedIds.size === 0 || allowedIds.has(item.user_id))
        
        // Apply batch filter if selected
        if (filters.batch_id) {
          filtered = filtered.filter(item => {
            const intern = internMap[item.user_id]
            if (!intern) return false
            return String(intern.batch_id) === String(filters.batch_id)
          })
        }
        
        setSubmissions(filtered || [])
        setError('')
      } catch (err) {
        console.error('❌ Failed to load submissions:', err)
        setError(err.response?.data?.detail || 'Failed to load submissions.')
        setSubmissions([])
      } finally {
        setLoading(false)
      }
    }

    const timer = setTimeout(() => {
      loadSubmissions()
    }, 300)
    
    return () => clearTimeout(timer)
  }, [filters.user_id, filters.submitted_for, filters.batch_id, searchQuery, sortBy, sortOrder, interns, internMap])

  async function deleteSubmission(id) {
    if (!window.confirm('Delete this submission?')) return
    
    try {
      await api.delete(`/submissions/${id}`)
      setSuccess('Submission deleted successfully.')
      setTimeout(() => setSuccess(''), 3000)
      // Reload submissions
      const params = { limit: 500 }
      if (filters.user_id) params.user_id = filters.user_id
      if (filters.submitted_for) params.submitted_for = filters.submitted_for
      const { data } = await api.get('/submissions', { params })
      const allowedIds = new Set(interns.map((intern) => intern.id))
      const filtered = data.filter((item) => allowedIds.size === 0 || allowedIds.has(item.user_id))
      setSubmissions(filtered)
    } catch (err) {
      console.error('Failed to delete submission:', err)
      if (err.response?.status === 403) {
        setError('Access denied.')
      } else {
        setError(err.response?.data?.detail || 'Failed to delete submission.')
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Submissions</h1>
        <p className="text-sm text-slate-500 mt-2">Review daily updates submitted by interns.</p>
      </div>

      {error && <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>}
      {success && <div className="card border border-green-200 bg-green-50 text-green-700">{success}</div>}

      {/* Search and Filters */}
      <div className="card">
        <div className="grid md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
            <input
              type="text"
              className="input"
              placeholder="Search submissions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Batch</label>
            <select 
              className="input" 
              value={filters.batch_id} 
              onChange={(e) => {
                setFilters({ ...filters, batch_id: e.target.value, user_id: '' })
              }}
            >
              <option value="">All batches</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>{batch.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Intern</label>
            <select 
              className="input" 
              value={filters.user_id} 
              onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
            >
              <option value="">All interns</option>
              {filteredInterns.map((intern) => (
                <option key={intern.id} value={intern.id}>{intern.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Date</label>
            <input 
              className="input" 
              type="date" 
              value={filters.submitted_for} 
              onChange={(e) => setFilters({ ...filters, submitted_for: e.target.value })} 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sort By</label>
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="submitted_for">Date</option>
              <option value="created_at">Created</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="card text-slate-500">Loading submissions...</div>
        ) : submissions.length === 0 ? (
          <div className="card text-slate-500">No submissions found.</div>
        ) : (
          submissions.map((item) => {
            const intern = internMap[item.user_id]
            const batchName = intern ? batchMap[intern.batch_id]?.name || 'Unassigned' : 'Unknown'
            
            return (
              <div key={item.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {item.submitted_by_name || intern?.name || item.user_id}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Batch: {batchName}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400">{item.submitted_for}</div>
                    </div>
                    <div className="text-sm text-slate-700 mt-3 whitespace-pre-wrap">{item.content}</div>
                  </div>
                  <button
                    onClick={() => deleteSubmission(item.id)}
                    className="px-3 py-1.5 text-sm font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-all duration-200 shrink-0"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
