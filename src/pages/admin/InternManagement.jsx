import { useEffect, useState, useCallback } from 'react'

import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'
import { emitInternUpdate, onEvent, EVENTS } from '../../utils/events'

const EMPTY_FORM = { name: '', email: '', tech_stack: '', batch_id: '' }

export default function InternManagement() {
  const { user } = useAuth()
  const [interns, setInterns] = useState([])
  const [batches, setBatches] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [editingForm, setEditingForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  
  // CSV upload
  const [csvFile, setCsvFile] = useState(null)
  const [uploadLoading, setUploadLoading] = useState(false)

  // Filter states
  const [nameFilter, setNameFilter] = useState('')
  const [emailFilter, setEmailFilter] = useState('')
  const [techStackFilter, setTechStackFilter] = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [sortOption, setSortOption] = useState('name_asc')

  async function loadBatches() {
    try {
      const { data } = await api.get('/batches', { params: { limit: 500 } })
      setBatches(data)
    } catch (err) {
      console.error('❌ Failed to load batches:', err)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        role: 'INTERN',
        limit: 500,
      }

      if (nameFilter) params.search_name = nameFilter
      if (emailFilter) params.search_email = emailFilter
      if (techStackFilter) params.tech_stack = techStackFilter
      if (batchFilter) params.batch_id = batchFilter

      // Parse sort option
      const [sortBy, sortOrder] = sortOption.split('_')
      if (sortBy) params.sort_by = sortBy
      if (sortOrder) params.sort_order = sortOrder

      const { data } = await api.get('/profiles', { params })
      setInterns(data)
      setError('')
    } catch (err) {
      console.error('❌ Failed to load interns:', err)
      
      // Detect CORS/Network failures
      if (!err.response) {
        if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
          setError('❌ Backend connection failed. Please check if the server is running and CORS is configured.')
        } else if (err.message?.includes('CORS')) {
          setError('❌ CORS error: Backend is blocking requests from this origin.')
        } else {
          setError('❌ Network error: Unable to reach the backend server.')
        }
      } else {
        setError(err.response?.data?.detail || 'Failed to load intern profiles.')
      }
    } finally {
      setLoading(false)
    }
  }, [nameFilter, emailFilter, techStackFilter, batchFilter, sortOption])

  useEffect(() => { loadBatches() }, [])

  useEffect(() => {
    // Debounce for text inputs
    const timer = setTimeout(() => {
      load()
    }, 300)

    return () => clearTimeout(timer)
  }, [load])

  async function createProfile(event) {
    event.preventDefault()
    
    // Clear previous errors
    setError('')
    setSuccess('')
    
    // Validate required fields with detailed messages
    if (!form.name.trim()) {
      setError('❌ Name is required.')
      return
    }
    
    if (!form.email.trim()) {
      setError('❌ Email is required.')
      return
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(form.email.trim())) {
      setError('❌ Please enter a valid email address.')
      return
    }
    
    // Validate batch selection
    if (!form.batch_id) {
      setError('❌ Please select a batch.')
      return
    }
    
    try {
      // Backend accepts both 'batch' and 'batch_id' - send batch_id
      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        tech_stack: form.tech_stack.trim() || null,
        role: 'INTERN',
        batch_id: form.batch_id,
      }
      
      const response = await api.post('/profiles', payload)
      
      setForm(EMPTY_FORM)
      setError('')
      setSuccess('✅ Intern profile created successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Immediate refetch to update UI
      await load()
      
      // Emit event to notify other pages
      emitInternUpdate()
    } catch (err) {
      console.error('❌ Failed to create intern:', err)
      
      // Detect CORS/Network failures
      if (!err.response) {
        if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
          setError('❌ Backend connection failed. Please check if the server is running and CORS is configured.')
          return
        }
        if (err.message?.includes('CORS')) {
          setError('❌ CORS error: Backend is blocking requests from this origin. Contact your administrator.')
          return
        }
        setError('❌ Network error: Unable to reach the backend server.')
        return
      }
      
      // Extract human-readable error message
      let errorMsg = 'Failed to create intern profile.'
      
      if (err.response?.data) {
        const errorData = err.response.data
        
        // Handle different error response formats
        if (typeof errorData === 'string') {
          errorMsg = errorData
        } else if (errorData.detail) {
          // FastAPI detail field
          if (typeof errorData.detail === 'string') {
            errorMsg = errorData.detail
          } else if (Array.isArray(errorData.detail)) {
            // Validation errors array
            errorMsg = errorData.detail.map(e => e.msg || e.message || JSON.stringify(e)).join('; ')
          } else if (typeof errorData.detail === 'object') {
            errorMsg = JSON.stringify(errorData.detail)
          }
        } else if (errorData.message) {
          errorMsg = errorData.message
        }
      }
      
      // Handle specific error cases
      if (err.response?.status === 409) {
        setError('❌ An intern with this email already exists.')
      } else if (err.response?.status === 400) {
        setError(`❌ Validation error: ${errorMsg}`)
      } else if (err.response?.status === 403) {
        setError('❌ Access denied: You can only create interns in your assigned batches.')
      } else {
        setError(`❌ ${errorMsg}`)
      }
    }
  }

  async function saveProfile(id) {
    setError('')
    setSuccess('')
    
    try {
      const payload = {
        name: editingForm.name.trim(),
        email: editingForm.email.trim().toLowerCase(),
        tech_stack: editingForm.tech_stack?.trim() || null,
        batch_id: editingForm.batch_id ? editingForm.batch_id : null,
      }
      
      await api.put(`/profiles/${id}`, payload)
      
      setEditingId(null)
      setEditingForm(EMPTY_FORM)
      setSuccess('✅ Intern profile updated successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Immediate refetch to update UI
      await load()
      
      // Emit event to notify other pages
      emitInternUpdate()
    } catch (err) {
      console.error('❌ Failed to update intern:', err)
      
      // Extract human-readable error message
      let errorMsg = 'Failed to update intern profile.'
      
      if (err.response?.data) {
        const errorData = err.response.data
        
        if (typeof errorData === 'string') {
          errorMsg = errorData
        } else if (errorData.detail) {
          if (typeof errorData.detail === 'string') {
            errorMsg = errorData.detail
          } else if (Array.isArray(errorData.detail)) {
            errorMsg = errorData.detail.map(e => e.msg || e.message || JSON.stringify(e)).join('; ')
          } else if (typeof errorData.detail === 'object') {
            errorMsg = JSON.stringify(errorData.detail)
          }
        } else if (errorData.message) {
          errorMsg = errorData.message
        }
      }
      
      if (err.response?.status === 403) {
        setError('❌ Access denied: You can only edit interns in your assigned batches.')
      } else {
        setError(`❌ ${errorMsg}`)
      }
    }
  }

  async function deleteProfile(id) {
    if (!window.confirm('Delete this intern profile?')) return
    
    setError('')
    
    try {
      await api.delete(`/profiles/${id}`)
      setSuccess('✅ Intern profile deleted successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Immediate refetch to update UI
      await load()
      
      // Emit event to notify other pages
      emitInternUpdate()
    } catch (err) {
      console.error('❌ Failed to delete intern:', err)
      
      if (err.response?.status === 403) {
        setError('❌ Access denied: You can only delete interns in your assigned batches.')
      } else {
        const errorMsg = err.response?.data?.detail || 'Failed to delete intern profile.'
        setError(`❌ ${errorMsg}`)
      }
    }
  }

  async function deactivateIntern(id, internName) {
    if (!window.confirm(`Deactivate ${internName}?\n\nThis will prevent them from logging in.`)) return
    
    setError('')
    
    try {
      await api.patch(`/profiles/${id}/deactivate`)
      setSuccess(`✅ ${internName} has been deactivated successfully!`)
      setTimeout(() => setSuccess(''), 3000)
      
      // Immediate refetch to update UI
      await load()
      
      // Emit event to notify other pages
      emitInternUpdate()
    } catch (err) {
      console.error('❌ Failed to deactivate intern:', err)
      
      if (err.response?.status === 403) {
        setError('❌ Access denied.')
      } else {
        const errorMsg = err.response?.data?.detail || 'Failed to deactivate intern.'
        setError(`❌ ${errorMsg}`)
      }
    }
  }

  async function activateIntern(id, internName) {
    if (!window.confirm(`Activate ${internName}?\n\nThis will allow them to log in again.`)) return
    
    setError('')
    
    try {
      await api.patch(`/profiles/${id}/activate`)
      setSuccess(`✅ ${internName} has been activated successfully!`)
      setTimeout(() => setSuccess(''), 3000)
      
      // Immediate refetch to update UI
      await load()
      
      // Emit event to notify other pages
      emitInternUpdate()
    } catch (err) {
      console.error('❌ Failed to activate intern:', err)
      
      if (err.response?.status === 403) {
        setError('❌ Access denied.')
      } else {
        const errorMsg = err.response?.data?.detail || 'Failed to activate intern.'
        setError(`❌ ${errorMsg}`)
      }
    }
  }

  async function handleCsvUpload() {
    if (!csvFile) {
      setError('❌ Please select a CSV file to upload.')
      return
    }
    
    setUploadLoading(true)
    setError('')
    setSuccess('')
    
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
      
      // Build detailed success message
      let message = `✅ CSV Upload Complete:\n• ${created} intern(s) created`
      if (skipped > 0) message += `\n• ${skipped} skipped (already exist)`
      
      // Show errors if any
      if (errors && errors.length > 0) {
        const errorList = errors.slice(0, 5).join('\n• ')
        const remaining = errors.length > 5 ? `\n• ...and ${errors.length - 5} more errors` : ''
        setError(`⚠️ Upload completed with errors:\n• ${errorList}${remaining}`)
      } else {
        setSuccess(message)
        setTimeout(() => setSuccess(''), 5000)
      }
      
      // Immediate refetch to update UI
      await load()
      
      // Reset file input
      const fileInput = document.querySelector('input[type="file"]')
      if (fileInput) fileInput.value = ''
      
    } catch (err) {
      console.error('❌ Failed to upload CSV:', err)
      
      // Extract human-readable error message
      let errorMsg = 'Failed to upload CSV file. Please check the file format.'
      
      if (err.response?.data) {
        const errorData = err.response.data
        
        if (typeof errorData === 'string') {
          errorMsg = errorData
        } else if (errorData.detail) {
          if (typeof errorData.detail === 'string') {
            errorMsg = errorData.detail
          } else if (Array.isArray(errorData.detail)) {
            errorMsg = errorData.detail.map(e => e.msg || e.message || JSON.stringify(e)).join('; ')
          } else if (typeof errorData.detail === 'object') {
            errorMsg = JSON.stringify(errorData.detail)
          }
        } else if (errorData.message) {
          errorMsg = errorData.message
        }
      }
      
      if (err.response?.status === 403) {
        setError('❌ Access denied: You can only upload interns for your assigned batches.')
      } else if (err.response?.status === 400) {
        setError(`❌ Invalid CSV format: ${errorMsg}`)
      } else {
        setError(`❌ ${errorMsg}`)
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

  function batchName(batchId) {
    if (!batchId) return 'Unassigned'
    
    // Normalize ID for comparison (handle both string and number)
    const normalizedId = String(batchId)
    const batch = batches.find((b) => String(b.id) === normalizedId)
    
    return batch?.name || 'Unassigned'
  }

  // Role-based access control
  function canEditIntern(intern) {
    if (!user) return false
    
    // ADMIN can edit all interns
    if (user?.role === 'ADMIN') return true
    
    // TECHNICAL_LEAD can edit only interns in their batches
    if (user?.role === 'TECHNICAL_LEAD' && intern.batch_id === user.batch_id) return true
    
    // INTERN can edit only their own profile (but this page is not for interns)
    if (user?.role === 'INTERN' && intern.id === user.id) return true
    
    return false
  }

  function clearFilters() {
    setNameFilter('')
    setEmailFilter('')
    setTechStackFilter('')
    setBatchFilter('')
    setSortOption('name_asc')
  }

  const hasActiveFilters = nameFilter || emailFilter || techStackFilter || batchFilter || sortOption !== 'name_asc'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Intern Profiles</h1>
        <p className="text-sm text-slate-500 mt-2">Manage intern profiles and assign them to batches.</p>
      </div>

      {error && <div className="card border border-rose-200 bg-rose-50 text-rose-700" style={{ whiteSpace: 'pre-line' }}>{error}</div>}
      {success && <div className="card border border-green-200 bg-green-50 text-green-700" style={{ whiteSpace: 'pre-line' }}>{success}</div>}

      <form onSubmit={createProfile} className="card grid md:grid-cols-5 gap-4">
        <input 
          className="input" 
          placeholder="Name *" 
          value={form.name} 
          onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(''); }} 
          required 
        />
        <input 
          className="input" 
          placeholder="Email *" 
          type="email" 
          value={form.email} 
          onChange={(e) => { setForm({ ...form, email: e.target.value }); setError(''); }} 
          required 
        />
        <input 
          className="input" 
          placeholder="Tech stack" 
          value={form.tech_stack} 
          onChange={(e) => { setForm({ ...form, tech_stack: e.target.value }); setError(''); }} 
        />
        <select 
          className="input" 
          value={form.batch_id} 
          onChange={(e) => { setForm({ ...form, batch_id: e.target.value }); setError(''); }}
          required
        >
          <option value="">Select Batch *</option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
            </option>
          ))}
        </select>
        <button className="btn-primary" type="submit">Create Intern</button>
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

      {/* Filter Section */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Filter & Sort</h2>
          {hasActiveFilters && (
            <button 
              onClick={clearFilters}
              className="text-sm text-brand-700 font-semibold hover:text-brand-800"
            >
              Clear All Filters
            </button>
          )}
        </div>
        
        <div className="grid md:grid-cols-5 gap-4">
          <input 
            className="input" 
            placeholder="Search by name..." 
            value={nameFilter} 
            onChange={(e) => setNameFilter(e.target.value)}
          />
          <input 
            className="input" 
            placeholder="Search by email..." 
            value={emailFilter} 
            onChange={(e) => setEmailFilter(e.target.value)}
          />
          <input 
            className="input" 
            placeholder="Filter by tech stack..." 
            value={techStackFilter} 
            onChange={(e) => setTechStackFilter(e.target.value)}
          />
          <select 
            className="input" 
            value={batchFilter} 
            onChange={(e) => setBatchFilter(e.target.value)}
          >
            <option value="">All batches</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>{batch.name}</option>
            ))}
          </select>
          <select 
            className="input" 
            value={sortOption} 
            onChange={(e) => setSortOption(e.target.value)}
          >
            <option value="name_asc">Name A-Z</option>
            <option value="name_desc">Name Z-A</option>
            <option value="email_asc">Email A-Z</option>
            <option value="email_desc">Email Z-A</option>
            <option value="tech_stack_asc">Tech Stack A-Z</option>
            <option value="tech_stack_desc">Tech Stack Z-A</option>
            <option value="batch_asc">Batch A-Z</option>
            <option value="batch_desc">Batch Z-A</option>
          </select>
        </div>
      </div>

      {/* Results Section */}
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
                
                return (
                  <tr key={item.id}>
                    <td className="td">
                      {editingId === item.id ? (
                        <input 
                          className="input" 
                          value={editingForm.name} 
                          onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })} 
                        />
                      ) : item.name}
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
                          value={editingForm.tech_stack || ''} 
                          onChange={(e) => setEditingForm({ ...editingForm, tech_stack: e.target.value })} 
                        />
                      ) : (item.tech_stack || '—')}
                    </td>
                    <td className="td">
                      {editingId === item.id ? (
                        <select 
                          className="input" 
                          value={editingForm.batch_id || ''} 
                          onChange={(e) => setEditingForm({ ...editingForm, batch_id: e.target.value })}
                        >
                          <option value="">No batch</option>
                          {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
                        </select>
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
                                    batch_id: item.batch_id || '',
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
                                onClick={() => deleteProfile(item.id)}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <span className="text-sm text-slate-400 italic">No access</span>
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
                    {hasActiveFilters ? 'No interns found matching your filters.' : 'No intern profiles found.'}
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
