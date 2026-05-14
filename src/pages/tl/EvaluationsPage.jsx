import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'

const EMPTY_FORM = { intern_id: '', week_number: 1, score: 0, feedback: '' }

export default function EvaluationsPage() {
  const { user } = useAuth()
  const [interns, setInterns] = useState([])
  const [evaluations, setEvaluations] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [weekFilter, setWeekFilter] = useState('')
  const [internFilter, setInternFilter] = useState('')
  const [scoreMinFilter, setScoreMinFilter] = useState('')
  const [scoreMaxFilter, setScoreMaxFilter] = useState('')
  const [sortBy, setSortBy] = useState('newest') // newest, oldest, week_asc, week_desc, score_asc, score_desc, intern_asc, intern_desc
  
  // Edit Evaluation states (Admin and Technical Lead)
  const [editingEvaluation, setEditingEvaluation] = useState(null)
  const [editForm, setEditForm] = useState({ score: '', feedback: '', week_number: '' })
  const [editError, setEditError] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // CSV download states
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [selectedInterns, setSelectedInterns] = useState([])
  const [selectedWeeks, setSelectedWeeks] = useState([])

  const internMap = useMemo(() => Object.fromEntries(interns.map((intern) => [intern.id, intern])), [interns])

  // Filter and sort evaluations based on search, filters, and sorting
  const filteredAndSortedEvaluations = useMemo(() => {
    // Step 1: Filter
    let filtered = evaluations.filter((item) => {
      const internName = internMap[item.intern_id]?.name || ''
      
      // Search: intern name, feedback, or week number
      const matchesSearch = !searchQuery || 
        internName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.feedback && item.feedback.toLowerCase().includes(searchQuery.toLowerCase())) ||
        String(item.week_number).includes(searchQuery)
      
      // Week filter
      const matchesWeek = !weekFilter || item.week_number === Number(weekFilter)
      
      // Intern filter
      const matchesIntern = !internFilter || item.intern_id === internFilter
      
      // Score range filter
      const matchesScoreMin = !scoreMinFilter || item.score >= Number(scoreMinFilter)
      const matchesScoreMax = !scoreMaxFilter || item.score <= Number(scoreMaxFilter)
      
      return matchesSearch && matchesWeek && matchesIntern && matchesScoreMin && matchesScoreMax
    })
    
    // Step 2: Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          // Assuming evaluations have created_at or id for ordering
          return b.id - a.id
        case 'oldest':
          return a.id - b.id
        case 'week_asc':
          return a.week_number - b.week_number
        case 'week_desc':
          return b.week_number - a.week_number
        case 'score_asc':
          return a.score - b.score
        case 'score_desc':
          return b.score - a.score
        case 'intern_asc': {
          const nameA = internMap[a.intern_id]?.name || ''
          const nameB = internMap[b.intern_id]?.name || ''
          return nameA.localeCompare(nameB)
        }
        case 'intern_desc': {
          const nameA = internMap[a.intern_id]?.name || ''
          const nameB = internMap[b.intern_id]?.name || ''
          return nameB.localeCompare(nameA)
        }
        default:
          return 0
      }
    })
    
    return sorted
  }, [evaluations, searchQuery, weekFilter, internFilter, scoreMinFilter, scoreMaxFilter, sortBy, internMap])

  async function load() {
    if (!user?.id) return

    try {
      const [profiles, batches, evaluationList] = await Promise.all([
        api.get('/profiles', { params: { role: 'INTERN', limit: 500 } }),
        user?.role === 'TECHNICAL_LEAD'
          ? api.get('/batches', { params: { limit: 500 } })
          : Promise.resolve({ data: [] }),
        // DO NOT filter by reviewed_by - show all evaluations from assigned batches
        api.get('/evaluations', { params: { limit: 500 } }),
      ])

      if (user?.role === 'TECHNICAL_LEAD') {
        const allowedBatchIds = new Set((batches.data || []).map((batch) => batch.id))
        const filteredInterns = (profiles.data || []).filter((intern) => allowedBatchIds.has(intern.batch_id))
        setInterns(filteredInterns)
        
        // Filter evaluations to only show those for interns in assigned batches
        const allowedInternIds = new Set(filteredInterns.map(i => i.id))
        const filteredEvaluations = (evaluationList.data || []).filter(eval => 
          allowedInternIds.has(eval.intern_id)
        )
        setEvaluations(filteredEvaluations)
      } else {
        setInterns(profiles.data || [])
        setEvaluations(evaluationList.data || [])
      }
      setError('')
    } catch (err) {
      console.error('❌ Failed to load evaluations:', err)
      setError(err.response?.data?.detail || 'Failed to load evaluations.')
      setInterns([])
      setEvaluations([])
    }
  }

  useEffect(() => {
    load()
  }, [user])

  async function createEvaluation(event) {
    event.preventDefault()
    if (!user?.id) {
      setError('User not authenticated.')
      return
    }
    
    try {
      await api.post('/evaluations', {
        ...form,
        week_number: Number(form.week_number),
        score: Number(form.score),
        reviewed_by: user.id,
      })
      setForm(EMPTY_FORM)
      setError('')
      load()
    } catch (err) {
      console.error('Failed to create evaluation:', err)
      setError(err.response?.data?.detail || 'Failed to create evaluation.')
    }
  }

  function openEditModal(evaluation) {
    setEditingEvaluation(evaluation)
    setEditForm({
      score: evaluation.score,
      feedback: evaluation.feedback || '',
      week_number: evaluation.week_number
    })
    setEditError('')
  }

  function closeEditModal() {
    setEditingEvaluation(null)
    setEditForm({ score: '', feedback: '', week_number: '' })
    setEditError('')
  }

  async function updateEvaluation(event) {
    event.preventDefault()
    if (!editingEvaluation) return

    setEditLoading(true)
    setEditError('')

    try {
      // Build payload based on role
      const payload = {
        score: Number(editForm.score),
        feedback: editForm.feedback,
        week_number: Number(editForm.week_number)
      }
      
      // ADMIN can update all fields, TECHNICAL_LEAD is restricted by backend
      await api.put(`/evaluations/${editingEvaluation.id}`, payload)
      closeEditModal()
      load() // refresh the list
    } catch (err) {
      console.error('Failed to update evaluation:', err)
      setEditError(err.response?.data?.detail || 'Failed to update evaluation.')
    } finally {
      setEditLoading(false)
    }
  }

  async function deleteEvaluation(evaluationId, internName, weekNumber) {
    if (!window.confirm(`Delete evaluation for ${internName} (Week ${weekNumber})?

This action cannot be undone.`)) {
      return
    }
    
    try {
      // Backend enforces batch restrictions for TECHNICAL_LEAD
      await api.delete(`/evaluations/${evaluationId}`)
      setError('')
      load()
    } catch (err) {
      console.error('Failed to delete evaluation:', err)
      if (err.response?.status === 403) {
        setError('Access denied: You can only delete evaluations for interns in your assigned batches.')
      } else {
        setError(err.response?.data?.detail || 'Failed to delete evaluation.')
      }
    }
  }

  // Clear all filters and reset to default view
  function clearFilters() {
    setSearchQuery('')
    setWeekFilter('')
    setInternFilter('')
    setScoreMinFilter('')
    setScoreMaxFilter('')
    setSortBy('newest')
  }

  // Check if any filters are active
  const hasActiveFilters = searchQuery || weekFilter || internFilter || scoreMinFilter || scoreMaxFilter || sortBy !== 'newest'

  async function downloadCSV() {
    if (filteredAndSortedEvaluations.length === 0) {
      setError('No evaluations to download. Please adjust your filters.')
      return
    }
    
    setDownloadLoading(true)
    setError('')
    
    try {
      const params = new URLSearchParams()
      
      // Add filters
      if (selectedInterns.length > 0) {
        params.append('intern_ids', selectedInterns.join(','))
      }
      if (selectedWeeks.length > 0) {
        params.append('week_numbers', selectedWeeks.join(','))
      }
      
      // DO NOT filter by reviewed_by - TL should export all evaluations from assigned batches
      
      const response = await api.get(`/evaluations/export?${params.toString()}`, {
        responseType: 'blob'
      })
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0]
      link.setAttribute('download', `evaluations_${timestamp}.csv`)
      
      document.body.appendChild(link)
      link.click()
      
      // Cleanup
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('❌ Failed to download CSV:', err)
      if (err.response?.status === 404) {
        setError('No evaluations found matching your filters.')
      } else {
        setError(err.response?.data?.detail || 'Failed to download CSV file.')
      }
    } finally {
      setDownloadLoading(false)
    }
  }

  // Get unique weeks from evaluations
  const availableWeeks = useMemo(() => {
    const weeks = new Set(evaluations.map(e => e.week_number))
    return Array.from(weeks).sort((a, b) => a - b)
  }, [evaluations])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Evaluations</h1>
        <p className="text-sm text-slate-500 mt-2">Record weekly scores and written feedback for interns.</p>
      </div>

      {error && <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>}

      {/* 1. Record New Evaluation Form (TOP) */}
      <form onSubmit={createEvaluation} className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Record New Evaluation</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Select Intern *
            </label>
            <select 
              className="input" 
              value={form.intern_id} 
              onChange={(e) => setForm({ ...form, intern_id: e.target.value })} 
              required
            >
              <option value="">Choose an intern...</option>
              {interns.map((intern) => (
                <option key={intern.id} value={intern.id}>{intern.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Week Number *
            </label>
            <input 
              className="input" 
              type="number" 
              min="1" 
              max="52"
              placeholder="e.g., 1, 2, 3..."
              value={form.week_number} 
              onChange={(e) => setForm({ ...form, week_number: e.target.value })} 
              required 
            />
            <p className="text-xs text-slate-500 mt-1">Enter week 1-52</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Score (0-5) *
            </label>
            <input 
              className="input" 
              type="number" 
              min="0" 
              max="5" 
              step="0.1" 
              placeholder="e.g., 4.5"
              value={form.score} 
              onChange={(e) => setForm({ ...form, score: e.target.value })} 
              required 
            />
            <p className="text-xs text-slate-500 mt-1">0.0 to 5.0 scale</p>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Feedback (Optional)
          </label>
          <textarea 
            className="input min-h-[80px] resize-y" 
            placeholder="Write your feedback for the intern's performance this week..."
            value={form.feedback} 
            onChange={(e) => setForm({ ...form, feedback: e.target.value })}
            rows={3}
          />
        </div>
        
        <button className="btn-primary w-full" type="submit">
          Save Evaluation
        </button>
      </form>

      {/* 2. Search, Filters, and Sorting */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Search, Filter & Sort Evaluations</h2>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-all duration-200 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear All
            </button>
          )}
        </div>
        
        {/* Search and Basic Filters */}
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
            <input
              type="text"
              className="input"
              placeholder="Name, feedback, week..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Intern</label>
            <select className="input" value={internFilter} onChange={(e) => setInternFilter(e.target.value)}>
              <option value="">All Interns</option>
              {interns.map((intern) => (
                <option key={intern.id} value={intern.id}>{intern.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Week</label>
            <select className="input" value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)}>
              <option value="">All Weeks</option>
              {availableWeeks.map((week) => (
                <option key={week} value={week}>Week {week}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sort By</label>
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="week_desc">Week (High to Low)</option>
              <option value="week_asc">Week (Low to High)</option>
              <option value="score_desc">Score (High to Low)</option>
              <option value="score_asc">Score (Low to High)</option>
              <option value="intern_asc">Intern (A to Z)</option>
              <option value="intern_desc">Intern (Z to A)</option>
            </select>
          </div>
        </div>
        
        {/* Score Range Filter */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Minimum Score</label>
            <input
              type="number"
              className="input"
              placeholder="e.g., 3.0"
              value={scoreMinFilter}
              onChange={(e) => setScoreMinFilter(e.target.value)}
              min="0"
              max="5"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Maximum Score</label>
            <input
              type="number"
              className="input"
              placeholder="e.g., 5.0"
              value={scoreMaxFilter}
              onChange={(e) => setScoreMaxFilter(e.target.value)}
              min="0"
              max="5"
              step="0.1"
            />
          </div>
        </div>
        
        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              <span className="font-semibold">🔍 Active Filters:</span> Showing {filteredAndSortedEvaluations.length} of {evaluations.length} evaluations
            </p>
          </div>
        )}
      </div>

      {/* 3. Evaluations Table - Results appear immediately after filters */}
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            All Evaluations
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({filteredAndSortedEvaluations.length} {filteredAndSortedEvaluations.length === 1 ? 'result' : 'results'})
            </span>
          </h2>
        </div>
        
        {filteredAndSortedEvaluations.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-slate-600 font-medium mb-2">
              {evaluations.length === 0 ? 'No evaluations recorded yet' : 'No evaluations match your filters'}
            </p>
            <p className="text-sm text-slate-400 mb-4">
              {evaluations.length === 0 
                ? 'Start by recording your first evaluation above.' 
                : 'Try adjusting your search or filter criteria.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 rounded-md shadow-sm transition-all duration-200"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <table className="table">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Intern</th>
                <th className="th">Week</th>
                <th className="th">Score</th>
                <th className="th">Feedback</th>
                {(user?.role === 'ADMIN' || user?.role === 'TECHNICAL_LEAD') && <th className="th">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedEvaluations.map((item) => (
              <tr key={item.id}>
                <td className="td">{internMap[item.intern_id]?.name || item.intern_id}</td>
                <td className="td">{item.week_number}</td>
                <td className="td font-semibold">{item.score}</td>
                <td className="td">{item.feedback || '—'}</td>
                {(user?.role === 'ADMIN' || user?.role === 'TECHNICAL_LEAD') && (
                  <td className="td space-x-2">
                    <button
                      onClick={() => openEditModal(item)}
                      className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-all duration-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteEvaluation(item.id, internMap[item.intern_id]?.name || 'Unknown', item.week_number)}
                      className="px-3 py-1.5 text-sm font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-all duration-200"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 4. CSV Export Section - Moved after results for better UX flow */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Export Evaluations (CSV)</h2>
          <p className="text-sm text-slate-500 mt-1">Download filtered evaluations as a CSV file</p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Interns (Optional)</label>
            <select 
              multiple 
              className="input min-h-[100px]" 
              value={selectedInterns}
              onChange={(e) => setSelectedInterns(Array.from(e.target.selectedOptions, option => option.value))}
            >
              {interns.map((intern) => (
                <option key={intern.id} value={intern.id}>{intern.name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Weeks (Optional)</label>
            <select 
              multiple 
              className="input min-h-[100px]" 
              value={selectedWeeks}
              onChange={(e) => setSelectedWeeks(Array.from(e.target.selectedOptions, option => option.value))}
            >
              {availableWeeks.map((week) => (
                <option key={week} value={week}>Week {week}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={downloadCSV}
              disabled={downloadLoading || filteredAndSortedEvaluations.length === 0}
              className="btn-primary w-full disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {downloadLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Downloading...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download CSV
                </>
              )}
            </button>
          </div>
        </div>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-700">
            <span className="font-semibold">💡 Tip:</span> Leave filters empty to download all evaluations. 
            The CSV will include: Intern Name, Week Number, Score, Feedback, and Date.
          </p>
        </div>
      </div>

      {/* Edit Evaluation Modal (Admin and Technical Lead) */}
      {editingEvaluation && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Edit Evaluation</h2>
            <p className="text-sm text-slate-500 mb-4">
              Updating evaluation for <span className="font-semibold">{internMap[editingEvaluation.intern_id]?.name || 'Unknown'}</span> (Week {editingEvaluation.week_number})
            </p>
            
            {user?.role === 'TECHNICAL_LEAD' && (
              <div className="mb-4 p-3 rounded bg-blue-50 border border-blue-200 text-blue-700 text-sm">
                <span className="font-semibold">ℹ️ Note:</span> You can only edit/delete evaluations for interns in your assigned batches. You can modify week number, score, and feedback only.
              </div>
            )}
            
            {editError && (
              <div className="mb-4 p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                {editError}
              </div>
            )}

            <form onSubmit={updateEvaluation} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Week Number *
                  </label>
                  <input 
                    className="input" 
                    type="number" 
                    min="1" 
                    max="52" 
                    value={editForm.week_number} 
                    onChange={(e) => setEditForm({ ...editForm, week_number: e.target.value })} 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Score (0-5) *
                  </label>
                  <input 
                    className="input" 
                    type="number" 
                    min="0" 
                    max="5" 
                    step="0.1" 
                    value={editForm.score} 
                    onChange={(e) => setEditForm({ ...editForm, score: e.target.value })} 
                    required 
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Feedback (Optional)
                </label>
                <textarea 
                  className="input min-h-[80px] resize-y" 
                  value={editForm.feedback} 
                  onChange={(e) => setEditForm({ ...editForm, feedback: e.target.value })}
                  rows={3}
                />
              </div>
              
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