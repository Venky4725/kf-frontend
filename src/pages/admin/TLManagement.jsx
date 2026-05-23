import { useEffect, useState } from 'react'

import api from '../../lib/api'
import { validateEmail, validateName, validateTechStack, validateUUID } from '../../utils/validation'
import { emitTLUpdate, emitBatchUpdate, onEvent, EVENTS } from '../../utils/events'

const EMPTY_FORM = { name: '', email: '', tech_stack: '', batch_id: '' }

export default function TLManagement() {
  const [tls, setTls] = useState([])
  const [batches, setBatches] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [editingForm, setEditingForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  async function load() {
    try {
      const { data } = await api.get('/profiles', { params: { role: 'TECHNICAL_LEAD', limit: 500 } })
      setTls(data)
      setError('')
    } catch (err) {
      console.error('❌ Failed to load technical leads:', err)
      
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
        setError(err.response?.data?.detail || 'Failed to load technical lead profiles.')
      }
    }
  }

  async function loadBatches() {
    try {
      const { data } = await api.get('/batches', { params: { limit: 500 } })
      setBatches(data)
    } catch (err) {
      console.error('❌ Failed to load batches:', err)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadBatches() }, [])
  
  // Listen for batch updates from other pages
  useEffect(() => {
    const cleanup = onEvent(EVENTS.BATCH_UPDATED, () => {
      loadBatches()
    })
    return cleanup
  }, [])

  async function createProfile(event) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    
    // Validate all fields
    const errors = {}
    
    const nameValidation = validateName(form.name)
    if (!nameValidation.valid) {
      errors.name = nameValidation.error
    }
    
    const emailValidation = validateEmail(form.email)
    if (!emailValidation.valid) {
      errors.email = emailValidation.error
    }
    
    const techStackValidation = validateTechStack(form.tech_stack)
    if (!techStackValidation.valid) {
      errors.tech_stack = techStackValidation.error
    }
    
    const batchIdValidation = validateUUID(form.batch_id, 'Batch')
    if (!batchIdValidation.valid) {
      errors.batch_id = batchIdValidation.error
    }
    
    // If there are validation errors, show them and stop
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError('⚠️ Please fix the validation errors above')
      return
    }
    
    // Trim and normalize email
    const normalizedEmail = form.email.trim().toLowerCase()
    
    // Check if email already exists in TL list (client-side validation)
    const emailExistsInTLs = tls.some(tl => tl.email.toLowerCase() === normalizedEmail)
    if (emailExistsInTLs) {
      setFieldErrors({ email: `A technical lead with this email already exists` })
      setError(`❌ A technical lead with email "${normalizedEmail}" already exists in the system.`)
      return
    }
    
    try {
      const payload = {
        name: form.name.trim(),
        email: normalizedEmail,
        tech_stack: form.tech_stack.trim() || null,
        role: 'TECHNICAL_LEAD',
        batch_id: form.batch_id || null
      }
      
      await api.post('/profiles', payload)
      
      // Success - clear form and reload
      setForm(EMPTY_FORM)
      setError('')
      setFieldErrors({})
      setSuccess('✅ Technical lead created successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Immediate refetch to update UI - refresh both TLs and batches
      await Promise.all([load(), loadBatches()])
      
      // Emit events to notify other pages
      emitTLUpdate()
      emitBatchUpdate()
    } catch (err) {
      console.error('❌ Failed to create technical lead:', err)
      
      // Extract error message from backend
      const errorMsg = err.response?.data?.detail || 'Failed to create technical lead profile.'
      
      // Handle different error types
      if (err.response?.status === 409) {
        setError(`❌ ${errorMsg}`)
      } else if (err.response?.status === 400) {
        setError(`⚠️ ${errorMsg}`)
      } else {
        setError(`❌ ${errorMsg}`)
      }
    }
  }

  async function saveProfile(id) {
    setError('')
    setSuccess('')
    setFieldErrors({})
    
    // Validate all fields
    const errors = {}
    
    const nameValidation = validateName(editingForm.name)
    if (!nameValidation.valid) {
      errors.name = nameValidation.error
    }
    
    const emailValidation = validateEmail(editingForm.email)
    if (!emailValidation.valid) {
      errors.email = emailValidation.error
    }
    
    const techStackValidation = validateTechStack(editingForm.tech_stack)
    if (!techStackValidation.valid) {
      errors.tech_stack = techStackValidation.error
    }
    
    const batchIdValidation = validateUUID(editingForm.batch_id, 'Batch')
    if (!batchIdValidation.valid) {
      errors.batch_id = batchIdValidation.error
    }
    
    // If there are validation errors, show them and stop
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError('⚠️ Please fix the validation errors above')
      return
    }
    
    // Trim and normalize email
    const normalizedEmail = editingForm.email.trim().toLowerCase()
    
    // Get the original profile being edited
    const originalProfile = tls.find(tl => tl.id === id)
    
    // Only check for duplicates if email is actually changing
    if (originalProfile && normalizedEmail !== originalProfile.email.toLowerCase()) {
      const emailExists = tls.some(tl => tl.id !== id && tl.email.toLowerCase() === normalizedEmail)
      if (emailExists) {
        setFieldErrors({ email: `A technical lead with this email already exists` })
        setError(`❌ A technical lead with email "${normalizedEmail}" already exists in the system.`)
        return
      }
    }
    
    try {
      const payload = {
        name: editingForm.name.trim(),
        email: normalizedEmail,
        tech_stack: editingForm.tech_stack?.trim() || null,
        batch_id: editingForm.batch_id || null,
      }
      
      await api.put(`/profiles/${id}`, payload)
      
      // Success - clear editing state and reload
      setEditingId(null)
      setEditingForm(EMPTY_FORM)
      setError('')
      setFieldErrors({})
      setSuccess('✅ Technical lead updated successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Immediate refetch to update UI - refresh both TLs and batches
      await Promise.all([load(), loadBatches()])
      
      // Emit events to notify other pages
      emitTLUpdate()
      emitBatchUpdate()
    } catch (err) {
      console.error('❌ Failed to update technical lead:', err)
      
      // Extract error message from backend
      const errorMsg = err.response?.data?.detail || 'Failed to update profile.'
      
      // Handle different error types
      if (err.response?.status === 409) {
        setError(`❌ ${errorMsg}`)
      } else if (err.response?.status === 400) {
        setError(`⚠️ ${errorMsg}`)
      } else {
        setError(`❌ ${errorMsg}`)
      }
    }
  }

  async function deactivateProfile(id) {
    const tl = tls.find(t => t.id === id)
    if (!tl) return
    
    if (!window.confirm(`Deactivate ${tl.name}?\n\nThey will not be able to login, but all data will be preserved.\nYou can reactivate them later if needed.`)) return
    
    try {
      await api.patch(`/profiles/${id}/deactivate`)
      setError('')
      setSuccess('✅ Technical lead deactivated successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Immediate refetch to update UI - refresh both TLs and batches
      await Promise.all([load(), loadBatches()])
      
      // Emit events to notify other pages
      emitTLUpdate()
      emitBatchUpdate()
    } catch (err) {
      console.error('❌ Failed to deactivate profile:', err)
      const errorMsg = err.response?.data?.detail || 'Failed to deactivate profile.'
      setError(`❌ ${errorMsg}`)
    }
  }
  
  async function activateProfile(id) {
    const tl = tls.find(t => t.id === id)
    if (!tl) return
    
    if (!window.confirm(`Activate ${tl.name}?\n\nThey will be able to login again.`)) return
    
    try {
      await api.patch(`/profiles/${id}/activate`)
      setError('')
      setSuccess('✅ Technical lead activated successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Immediate refetch to update UI - refresh both TLs and batches
      await Promise.all([load(), loadBatches()])
      
      // Emit events to notify other pages
      emitTLUpdate()
      emitBatchUpdate()
    } catch (err) {
      console.error('❌ Failed to activate profile:', err)
      const errorMsg = err.response?.data?.detail || 'Failed to activate profile.'
      setError(`❌ ${errorMsg}`)
    }
  }
  
  // Filter out inactive profiles
  const activeTLs = tls.filter(tl => tl.is_active)

  function batchName(item) {
    // Check if the profile has multiple batches (returned by some APIs)
    if (item.batches && Array.isArray(item.batches) && item.batches.length > 0) {
      return item.batches.map(b => b.name).join(', ')
    }
    
    // Fallback to single batch_id
    if (!item.batch_id) return 'Unassigned'
    
    // Normalize ID for comparison (handle both string and number)
    const normalizedId = String(item.batch_id)
    const batch = batches.find((b) => String(b.id) === normalizedId)
    
    return batch?.name || 'Unassigned'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Technical Leads</h1>
        <p className="text-sm text-slate-500 mt-2">Create and maintain technical lead profiles in the current MVP.</p>
      </div>

      {error && <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>}
      {success && <div className="card border border-green-200 bg-green-50 text-green-700">{success}</div>}

      <form onSubmit={createProfile} className="card space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <input 
              className={`input ${fieldErrors.name ? 'border-red-500' : ''}`}
              placeholder="Name *" 
              value={form.name} 
              onChange={(e) => { 
                setForm({ ...form, name: e.target.value }); 
                setError(''); 
                setFieldErrors({ ...fieldErrors, name: null });
              }} 
              required 
            />
            {fieldErrors.name && <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>}
          </div>
          
          <div>
            <input 
              className={`input ${fieldErrors.email ? 'border-red-500' : ''}`}
              placeholder="Email * (e.g., user@example.com)" 
              type="email" 
              value={form.email} 
              onChange={(e) => { 
                setForm({ ...form, email: e.target.value }); 
                setError(''); 
                setFieldErrors({ ...fieldErrors, email: null });
              }} 
              required 
            />
            {fieldErrors.email && <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>}
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <input 
              className={`input ${fieldErrors.tech_stack ? 'border-red-500' : ''}`}
              placeholder="Tech stack (optional)" 
              value={form.tech_stack} 
              onChange={(e) => { 
                setForm({ ...form, tech_stack: e.target.value }); 
                setError(''); 
                setFieldErrors({ ...fieldErrors, tech_stack: null });
              }} 
            />
            {fieldErrors.tech_stack && <p className="text-xs text-red-600 mt-1">{fieldErrors.tech_stack}</p>}
          </div>
          
          <div>
            <select 
              className={`input ${fieldErrors.batch_id ? 'border-red-500' : ''}`}
              value={form.batch_id} 
              onChange={(e) => { 
                setForm({ ...form, batch_id: e.target.value }); 
                setError(''); 
                setFieldErrors({ ...fieldErrors, batch_id: null });
              }}
            >
              <option value="">Assign to batch (optional)...</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.tech_stack})</option>
              ))}
            </select>
            {fieldErrors.batch_id && <p className="text-xs text-red-600 mt-1">{fieldErrors.batch_id}</p>}
          </div>
        </div>
        
        <button className="btn-primary w-full md:w-auto" type="submit">Create Technical Lead</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Name</th>
              <th className="th">Email</th>
              <th className="th">Tech Stack</th>
              <th className="th">Batch</th>
              <th className="th w-64">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activeTLs.map((item) => (
              <tr key={item.id}>
                <td className="td">
                  {editingId === item.id ? (
                    <input className="input" value={editingForm.name} onChange={(e) => { setEditingForm({ ...editingForm, name: e.target.value }); setError(''); setFieldErrors({}); }} />
                  ) : (
                    <div className="flex items-center gap-2">
                      {item.name}
                    </div>
                  )}
                </td>
                <td className="td">
                  {editingId === item.id ? (
                    <input className="input" type="email" value={editingForm.email} onChange={(e) => { setEditingForm({ ...editingForm, email: e.target.value }); setError(''); }} />
                  ) : item.email}
                </td>
                <td className="td">
                  {editingId === item.id ? (
                    <input className="input" value={editingForm.tech_stack || ''} onChange={(e) => { setEditingForm({ ...editingForm, tech_stack: e.target.value }); setError(''); }} />
                  ) : (item.tech_stack || '—')}
                </td>
                <td className="td">
                  {editingId === item.id ? (
                    <select className="input" value={editingForm.batch_id || ''} onChange={(e) => { setEditingForm({ ...editingForm, batch_id: e.target.value }); setError(''); }}>
                      <option value="">Unassigned</option>
                      {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
                    </select>
                  ) : (
                    batchName(item)
                  )}
                </td>
                <td className="td">
                  {editingId === item.id ? (
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <button 
                        className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 rounded-md shadow-sm transition-all duration-200"
                        onClick={() => saveProfile(item.id)}
                      >
                        Save
                      </button>
                      <button 
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md shadow-sm transition-all duration-200"
                        onClick={() => { 
                          setEditingId(null); 
                          setEditingForm(EMPTY_FORM); 
                          setError(''); 
                          setFieldErrors({}); 
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <button 
                        className="px-4 py-2 text-sm font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-md transition-all duration-200"
                        onClick={() => {
                          setEditingId(item.id)
                          setEditingForm({ name: item.name, email: item.email, tech_stack: item.tech_stack || '', batch_id: item.batch_id || '' })
                          setError('')
                          setFieldErrors({})
                        }}
                      >
                        Edit
                      </button>
                      
                      <button 
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-all duration-200"
                        onClick={() => deactivateProfile(item.id)}
                        title="Deactivate user (they cannot login but data is preserved)"
                      >
                        Deactivate
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {activeTLs.length === 0 && (
              <tr><td className="td text-slate-500" colSpan={5}>No active technical lead profiles found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
