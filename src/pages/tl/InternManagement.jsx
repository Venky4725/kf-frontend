import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'
import { emitInternUpdate, onEvent, EVENTS } from '../../utils/events'

const EMPTY_FORM = { name: '', email: '', tech_stack: '', batch_name: '' }

export default function InternManagement() {
  const { user } = useAuth()
  const [interns, setInterns] = useState([])
  const [batches, setBatches] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingForm, setEditingForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  
  // Create form
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  
  // CSV upload
  const [csvFile, setCsvFile] = useState(null)
  const [uploadLoading, setUploadLoading] = useState(false)

  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')

  async function loadBatches() {
    try {
      const { data } = await api.get('/batches', { params: { limit: 500 } })
      setBatches(data)
    } catch (err) {
      console.error('❌ Failed to load batches:', err)
    }
  }

  const load = async () => {
    if (!user?.id) return
    
    setLoading(true)
    try {
      const params = {
        role: 'INTERN',
        limit: 500,
      }

      if (searchQuery) params.search_name = searchQuery
      if (batchFilter) params.batch_id = batchFilter
      if (sortBy) params.sort_by = sortBy
      if (sortOrder) params.sort_order = sortOrder

      const { data: profilesData } = await api.get('/profiles', { params })
      
      // Filter to only show interns in Tech Lead's batches
      const allowedBatchIds = new Set(batches.map((batch) => batch.id))
      const filteredInterns = (profilesData || []).filter((intern) => allowedBatchIds.has(intern.batch_id))
      
      setInterns(filteredInterns)
      setError('')
    } catch (err) {
      console.error('Failed to load interns:', err)
      setError(err.response?.data?.detail || 'Failed to load assigned interns.')
      setInterns([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBatches()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      load()
    }, 300)
    return () => clearTimeout(timer)
  }, [user, searchQuery, batchFilter, sortBy, sortOrder, batches.length])

  async function saveProfile(id) {
    try {
      const payload = {
        name: editingForm.name,
        email: editingForm.email,
        tech_stack: editingForm.tech_stack || null,
        batch_name: editingForm.batch_name || null,
      }
      
      await api.put(`/profiles/${id}`, payload)
      
      // Update local state immediately for better UX
      setInterns(prev =>
        prev.map(intern =>
          intern.id === id ? { ...intern, ...payload } : intern
        )
      )
      
      setEditingId(null)
      setEditingForm(EMPTY_FORM)
      setError('')
      setSuccess('Intern profile updated successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Refresh data from backend to ensure consistency
      await load()
      
      // Emit event to notify other pages
      emitInternUpdate()
    } catch (err) {
      console.error('Failed to save profile:', err)
      if (err.response?.status === 403) {
        setError('Access denied: You can only edit interns in your assigned batches.')
      } else {
        setError(err.response?.data?.detail || 'Failed to update intern profile.')
      }
    }
  }

  async function deleteProfile(id, internName) {
    if (!window.confirm(`Delete intern profile for ${internName}?\n\nThis action cannot be undone.`)) return
    
    try {
      await api.delete(`/profiles/${id}`)
      
      // Update local state immediately
      setInterns(prev => prev.filter(intern => intern.id !== id))
      
      setError('')
      setSuccess(`Intern profile for ${internName} deleted successfully!`)
      setTimeout(() => setSuccess(''), 3000)
      
      // Refresh data from backend
      await load()
      
      // Emit event to notify other pages
      emitInternUpdate()
    } catch (err) {
      console.error('Failed to delete profile:', err)
      if (err.response?.status === 403) {
        setError('Access denied: You can only delete interns in your assigned batches.')
      } else {
        setError(err.response?.data?.detail || 'Failed to delete intern profile.')
      }
    }
  }

  async function deactivateIntern(id, internName) {
    if (!window.confirm(`Deactivate ${internName}?\n\nThis will prevent them from logging in.`)) return
    
    try {
      await api.patch(`/profiles/${id}/deactivate`)
      
      setError('')
      setSuccess(`${internName} has been deactivated successfully!`)
      setTimeout(() => setSuccess(''), 3000)
      
      // Refresh data from backend
      await load()
      
      // Emit event to notify other pages
      emitInternUpdate()
    } catch (err) {
      console.error('Failed to deactivate intern:', err)
      if (err.response?.status === 403) {
        setError('Access denied: You can only deactivate interns in your assigned batches.')
      } else {
        setError(err.response?.data?.detail || 'Failed to deactivate intern.')
      }
    }
  }

  async function activateIntern(id, internName) {
    if (!window.confirm(`Activate ${internName}?\n\nThis will allow them to log in again.`)) return
    
    try {
      await api.patch(`/profiles/${id}/activate`)
      
      setError('')
      setSuccess(`${internName} has been activated successfully!`)
      setTimeout(() => setSuccess(''), 3000)
      
      // Refresh data from backend
      await load()
      
      // Emit event to notify other pages
      emitInternUpdate()
    } catch (err) {
      console.error('Failed to activate intern:', err)
      if (err.response?.status === 403) {
        setError('Access denied: You can only activate interns in your assigned batches.')
      } else {
        setError(err.response?.data?.detail || 'Failed to activate intern.')
      }
    }
  }

  async function createIntern(event) {
    event.preventDefault()
    
    // Validate batch name
    if (!createForm.batch_name || !createForm.batch_name.trim()) {
      setError('Batch name is required.')
      return
    }
    
    try {
      const payload = {
        name: createForm.name,
        email: createForm.email,
        role: 'INTERN',
        tech_stack: createForm.tech_stack || null,
        batch_name: createForm.batch_name.trim(),
      }
      
      await api.post('/profiles', payload)
      
      setCreateForm(EMPTY_FORM)
      setError('')
      setSuccess('Intern created successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Refresh data
      await load()
      
      // Emit event to notify other pages
      emitInternUpdate()
    } catch (err) {
      console.error('Failed to create intern:', err)
      if (err.response?.status === 403) {
        setError('Access denied: You can only create interns in your assigned batches.')
      } else {
        setError(err.response?.data?.detail || 'Failed to create intern profile.')
      }
    }
  }

  async function handleCsvUpload() {
    if (!csvFile) {
      setError('Please select a CSV file to upload.')
      return
    }
    
    setUploadLoading(true)
    setError('')
    
    try {
      const formData = new FormData()
      formData.append('file', csvFile)
      
      const response = await api.post('/profiles/upload-csv', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      
      const { created, skipped, errors } = response.data
      
      setCsvFile(null)
      
      // Build success message
      let message = `CSV Upload Complete: ${created} created`
      if (skipped > 0) message += `, ${skipped} skipped`
      
      // Show errors if any
      if (errors && errors.length > 0) {
        console.warn('CSV upload errors:', errors)
        message += `\n\nErrors:\n${errors.join('\n')}`
        setError(message)
      } else {
        setSuccess(message)
        setTimeout(() => setSuccess(''), 5000)
      }
      
      // Refresh data
      await load()
    } catch (err) {
      console.error('Failed to upload CSV:', err)
      if (err.response?.status === 403) {
        setError('Access denied: You can only upload interns for your assigned batches.')
      } else {
        setError(err.response?.data?.detail || 'Failed to upload CSV file.')
      }
    } finally {
      setUploadLoading(false)
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.csv')) {
        setError('Please select a valid CSV file.')
        return
      }
      setCsvFile(file)
      setError('')
    }
  }

  // Role-based access control
  function canEditIntern(intern) {
    if (!user) return false
    
    // ADMIN can edit all interns
    if (user?.role === 'ADMIN') return true
    
    // TECHNICAL_LEAD can edit only interns in their assigned batches
    if (user?.role === 'TECHNICAL_LEAD') {
      // Check if intern's batch is in the Tech Lead's assigned batches
      const allowedBatchIds = new Set(batches.map((batch) => batch.id))
      return allowedBatchIds.has(intern.batch_id)
    }
    
    return false
  }

  const batchMap = useMemo(() => Object.fromEntries(batches.map((batch) => [batch.id, batch])), [batches])

  function batchName(batchId) {
    if (!batchId) return 'Unassigned'
    
    const batchName = batchMap[batchId]?.name
    
    if (!batchName) {
      console.warn('⚠️ Batch not found for batch_id:', batchId, 'Available batches:', batches)
      return 'Unassigned'
    }
    
    return batchName
  }

  function clearFilters() {
    setSearchQuery('')
    setBatchFilter('')
    setSortBy('name')
    setSortOrder('asc')
  }

  const hasActiveFilters = searchQuery || batchFilter || sortBy !== 'name' || sortOrder !== 'asc'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Assigned Interns</h1>
        <p className="text-sm text-slate-500 mt-2">Manage intern profiles across the batches currently assigned to you.</p>
      </div>

      {error && <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>}
      {success && <div className="card border border-green-200 bg-green-50 text-green-700" style={{ whiteSpace: 'pre-line' }}>{success}</div>}

      {/* Create Intern Form */}
      <form onSubmit={createIntern} className="card space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Add New Intern</h2>
        <div className="grid md:grid-cols-4 gap-4">
          <input
            className="input"
            placeholder="Name *"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            required
          />
          <input
            className="input"
            type="email"
            placeholder="Email *"
            value={createForm.email}
            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder="Tech Stack (e.g., Python Full Stack, MERN Stack)"
            value={createForm.tech_stack}
            onChange={(e) => setCreateForm({ ...createForm, tech_stack: e.target.value })}
          />
          <input
            className="input"
            placeholder="Batch Name *"
            value={createForm.batch_name}
            onChange={(e) => setCreateForm({ ...createForm, batch_name: e.target.value })}
            required
          />
        </div>
        <button className="btn-primary w-full" type="submit">
          Create Intern
        </button>
      </form>

      {/* CSV Upload Section */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Bulk Upload (CSV)</h2>
          <p className="text-sm text-slate-500 mt-1">Upload a CSV file to create multiple interns at once</p>
        </div>
        
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-700 mb-2">Required CSV Format:</p>
          <code className="text-xs text-slate-600 bg-white px-2 py-1 rounded border border-slate-200 block">
            name,email,tech_stack,batch_name
          </code>
          <p className="text-xs text-slate-500 mt-2">
            <span className="font-semibold text-slate-700">Example:</span> John Doe,john@example.com,Full Stack,KF-Cohort-5
          </p>
          <div className="mt-3 pt-3 border-t border-slate-300">
            <p className="text-xs font-semibold text-rose-700 mb-1">⚠️ Important:</p>
            <ul className="text-xs text-slate-600 space-y-1 ml-4 list-disc">
              <li><span className="font-semibold">name</span> and <span className="font-semibold">email</span> are required</li>
              <li><span className="font-semibold">batch_name</span> is required</li>
              <li><span className="font-semibold">tech_stack</span> is optional</li>
              <li>First row must be the header row</li>
            </ul>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-brand-50 file:text-brand-700
                hover:file:bg-brand-100
                cursor-pointer"
            />
          </div>
          <button
            onClick={handleCsvUpload}
            disabled={!csvFile || uploadLoading}
            className="px-6 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:bg-slate-400 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {uploadLoading ? 'Uploading...' : 'Upload CSV'}
          </button>
        </div>
        
        {csvFile && (
          <div className="text-sm text-slate-600">
            Selected file: <span className="font-medium">{csvFile.name}</span>
          </div>
        )}
      </div>

      {/* Search and Filters Section */}
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
              placeholder="Search interns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
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
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sort By</label>
            <select 
              className="input" 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="name">Name</option>
              <option value="email">Email</option>
              <option value="tech_stack">Tech Stack</option>
              <option value="created_at">Created Date</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Order</label>
            <select 
              className="input" 
              value={sortOrder} 
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
      </div>

      {/* Interns Table */}
      <div className="card overflow-x-auto">
        {loading && (
          <div className="text-center py-8 text-slate-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            <p className="mt-2">Loading interns...</p>
          </div>
        )}
        
        {!loading && (
          <table className="table">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Name</th>
                <th className="th">Email</th>
                <th className="th">Tech Stack</th>
                <th className="th">Batch</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {interns.map((item) => {
                const canEdit = canEditIntern(item)
                
                // Temporary debug info
                const debugInfo = {
                  userRole: user?.role,
                  batchesCount: batches.length,
                  internBatchId: item.batch_id,
                  canEdit
                }
                
                return (
                  <tr key={item.id}>
                    <td className="td">
                      {editingId === item.id ? (
                        <input 
                          className="input" 
                          value={editingForm.name} 
                          onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })} 
                        />
                      ) : (
                        <span className="font-medium">{item.name}</span>
                      )}
                    </td>
                    <td className="td">
                      {editingId === item.id ? (
                        <input 
                          className="input" 
                          type="email" 
                          value={editingForm.email} 
                          onChange={(e) => setEditingForm({ ...editingForm, email: e.target.value })} 
                        />
                      ) : item.email}
                    </td>
                    <td className="td">
                      {editingId === item.id ? (
                        <input 
                          className="input" 
                          placeholder="e.g., Python Full Stack, MERN Stack"
                          value={editingForm.tech_stack || ''} 
                          onChange={(e) => setEditingForm({ ...editingForm, tech_stack: e.target.value })} 
                        />
                      ) : (item.tech_stack || '—')}
                    </td>
                    <td className="td">
                      {editingId === item.id ? (
                        <input 
                          className="input" 
                          value={editingForm.batch_name || ''} 
                          onChange={(e) => setEditingForm({ ...editingForm, batch_name: e.target.value })}
                          placeholder="Batch name"
                        />
                      ) : batchName(item.batch_id)}
                    </td>
                    <td className="td space-x-3">
                      {editingId === item.id ? (
                        <>
                          <button 
                            className="text-sm text-brand-700 font-semibold" 
                            onClick={() => saveProfile(item.id)}
                          >
                            Save
                          </button>
                          <button 
                            className="text-sm text-slate-500" 
                            onClick={() => {
                              setEditingId(null)
                              setEditingForm(EMPTY_FORM)
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {canEdit ? (
                            <>
                              <button 
                                className="text-sm text-brand-700 font-semibold" 
                                onClick={() => {
                                  setEditingId(item.id)
                                  setEditingForm({
                                    name: item.name,
                                    email: item.email,
                                    tech_stack: item.tech_stack || '',
                                    batch_name: batchName(item.batch_id) || '',
                                  })
                                }}
                              >
                                Edit
                              </button>
                              {item.is_active ? (
                                <button 
                                  className="text-sm text-amber-700 font-semibold" 
                                  onClick={() => deactivateIntern(item.id, item.name)}
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button 
                                  className="text-sm text-green-700 font-semibold" 
                                  onClick={() => activateIntern(item.id, item.name)}
                                >
                                  Activate
                                </button>
                              )}
                              <button 
                                className="text-sm text-rose-700 font-semibold" 
                                onClick={() => deleteProfile(item.id, item.name)}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <span className="text-sm text-slate-400 italic" title={JSON.stringify(debugInfo)}>
                              No access (hover for debug)
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
              {interns.length === 0 && (
                <tr>
                  <td className="td text-slate-500 text-center" colSpan={5}>
                    {hasActiveFilters ? 'No interns found matching your filters.' : 'No interns are assigned to your batches.'}
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
