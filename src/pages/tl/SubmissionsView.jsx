import { useEffect, useMemo, useState, useCallback } from 'react'

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

  // Pagination states
  const [skip, setSkip] = useState(0)
  const [limit] = useState(20)
  const [hasMore, setHasMore] = useState(true)

  const internMap = useMemo(() => Object.fromEntries(interns.map((intern) => [intern.id, intern])), [interns])
  const batchMap = useMemo(() => Object.fromEntries(batches.map((batch) => [batch.id, batch])), [batches])
  
  // Filter interns by selected batch
  const filteredInterns = useMemo(() => {
    if (!filters.batch_id) return interns
    return interns.filter(intern => String(intern.batch_id) === String(filters.batch_id))
  }, [interns, filters.batch_id])

  // Load interns and batches once on mount
  useEffect(() => {
    const controller = new AbortController()
    
    async function loadData() {
      const userId = user?.id
      if (!userId) return
      
      try {
        const [profiles, batchesRes] = await Promise.all([
          api.get('/profiles', { params: { role: 'INTERN', limit: 500 }, signal: controller.signal }),
          api.get('/batches', { params: { limit: 500 }, signal: controller.signal }),
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
        if (err.name !== 'CanceledError') {
          console.error('❌ Failed to load data:', err)
          setError(err.response?.data?.detail || 'Failed to load data.')
        }
      }
    }
    loadData()
    return () => controller.abort()
  }, [user?.id, user?.role])

  // Load submissions
  const loadSubmissions = useCallback(async (isLoadMore = false) => {
    if (interns.length === 0) return
    
    setLoading(true)
    const currentSkip = isLoadMore ? skip + limit : 0
    
    try {
      console.time('🚀 Submissions Fetch')
      const params = { 
        limit: limit,
        skip: currentSkip
      }
      if (filters.user_id) params.user_id = filters.user_id
      if (filters.submitted_for) params.submitted_for = filters.submitted_for
      if (searchQuery) params.search = searchQuery
      if (sortBy) {
        params.sort_by = sortBy
        params.order = sortOrder
      }
      
      const { data } = await api.get('/submissions', { params })
      
      // Filter to allowed interns only (batch-scoped) if not done by backend
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

      if (isLoadMore) {
        setSubmissions(prev => [...prev, ...filtered])
      } else {
        setSubmissions(filtered)
      }
      
      setSkip(currentSkip)
      setHasMore(data.length === limit)
      setError('')
    } catch (err) {
      console.error('❌ Failed to load submissions:', err)
      setError(err.response?.data?.detail || 'Failed to load submissions.')
    } finally {
      setLoading(false)
      console.timeEnd('🚀 Submissions Fetch')
    }
  }, [interns, filters, searchQuery, sortBy, sortOrder, skip, limit, internMap])

  useEffect(() => {
    const timer = setTimeout(() => {
      setSkip(0)
      loadSubmissions(false)
    }, 300)
    
    return () => clearTimeout(timer)
  }, [filters.user_id, filters.submitted_for, filters.batch_id, searchQuery, sortBy, sortOrder, interns.length])

  async function deleteSubmission(id) {
    if (!window.confirm('Delete this submission?')) return
    
    try {
      await api.delete(`/submissions/${id}`)
      setSuccess('Submission deleted successfully.')
      setTimeout(() => setSuccess(''), 3000)
      
      // Refresh current view
      setSubmissions(prev => prev.filter(s => s.id !== id))
    } catch (err) {
      console.error('Failed to delete submission:', err)
      setError(err.response?.data?.detail || 'Failed to delete submission.')
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
        {loading && submissions.length === 0 ? (
          <div className="card text-slate-500 italic">Loading submissions...</div>
        ) : submissions.length === 0 ? (
          <div className="card text-slate-500">No submissions found.</div>
        ) : (
          <>
            {submissions.map((item) => {
              const intern = internMap[item.user_id]
              const batchName = intern ? batchMap[intern.batch_id]?.name || 'Unassigned' : 'Unknown'
              
              return (
                <div key={item.id} className="card hover:shadow-md transition-shadow">
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
                        <div className="text-xs text-slate-400 font-medium px-2 py-1 bg-slate-50 rounded border border-slate-100">{item.submitted_for}</div>
                      </div>
                      <div className="text-sm text-slate-700 mt-3 whitespace-pre-wrap leading-relaxed">{item.content}</div>
                    </div>
                    <button
                      onClick={() => deleteSubmission(item.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all shrink-0"
                      title="Delete Submission"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                  </div>
                </div>
              )
            })}
            
            {hasMore && (
              <div className="text-center pt-4">
                <button 
                  onClick={() => loadSubmissions(true)}
                  disabled={loading}
                  className="text-sm font-bold text-brand-700 hover:text-brand-800 transition-colors py-2.5 px-8 rounded-xl bg-white border border-brand-200 shadow-sm"
                >
                  {loading ? 'Loading...' : 'Load More Submissions'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
