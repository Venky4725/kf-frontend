import { useEffect, useState, useCallback, useMemo, useRef } from 'react'

import api from '../../lib/api'
import { validateEmail, validateName, validateTechStack, validateUUID } from '../../utils/validation'
import { emitTLUpdate, emitBatchUpdate, onEvent, EVENTS } from '../../utils/events'

const EMPTY_FORM = { name: '', email: '', tech_stack: '', batch_ids: [] }

export default function TLManagement() {
  const [tls, setTls] = useState([])
  const [batches, setBatches] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [editingForm, setEditingForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  
  // Track last request time to prevent stale re-fetches from overwriting fresh state
  const lastUpdateRef = useRef(0)

  // Handle multi-select for batches
  function handleBatchSelect(e, isEditing = false) {
    const selectedOptions = Array.from(e.target.selectedOptions, option => option.value)
    
    if (isEditing) {
      setEditingForm({ ...editingForm, batch_ids: selectedOptions })
    } else {
      setForm({ ...form, batch_ids: selectedOptions })
    }
  }

  const load = useCallback(async (signal) => {
    const requestId = Date.now()
    try {
      const { data } = await api.get('/profiles', { params: { role: 'TECHNICAL_LEAD', limit: 500 }, signal })
      
      // Only update if this is the latest request and no manual update has happened recently
      if (requestId >= lastUpdateRef.current) {
        setTls(data || [])
        setError('')
      }
    } catch (err) {
      if (err.name !== 'CanceledError') {
        console.error('❌ Failed to load technical leads:', err)
        setError(err.response?.data?.detail || 'Failed to load technical lead profiles.')
      }
    }
  }, [])

  const loadBatches = useCallback(async (signal) => {
    const requestId = Date.now()
    try {
      const { data } = await api.get('/batches', { params: { limit: 500 }, signal })
      
      if (requestId >= lastUpdateRef.current) {
        setBatches(data || [])
      }
    } catch (err) {
      if (err.name !== 'CanceledError') {
        console.error('❌ Failed to load batches:', err)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    loadBatches(controller.signal)
    return () => controller.abort()
  }, [load, loadBatches])
  
  // Listen for updates from other pages
  useEffect(() => {
    const refresh = () => {
      // Add a small delay to avoid race conditions with backend index/cache updates
      setTimeout(() => {
        load()
        loadBatches()
      }, 800)
    }
    const cleanupBatch = onEvent(EVENTS.BATCH_UPDATED, refresh)
    const cleanupTL = onEvent(EVENTS.TL_UPDATED, refresh)
    return () => {
      cleanupBatch()
      cleanupTL()
    }
  }, [load, loadBatches])

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
        batch_ids: form.batch_ids && form.batch_ids.length > 0 ? form.batch_ids : []
      }
      
      const { data: newProfile } = await api.post('/profiles', payload)
      
      // Update last update timestamp to ignore stale re-fetches
      lastUpdateRef.current = Date.now()
      
      // OPTIMISTIC UPDATE: Update local state immediately with returned data
      setTls(prev => [newProfile, ...prev])
      
      // Success - clear form
      setForm(EMPTY_FORM)
      setError('')
      setFieldErrors({})
      setSuccess('✅ Technical lead created successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Emit events to notify other pages
      emitTLUpdate()
      emitBatchUpdate()
    } catch (err) {
      console.error('❌ Failed to create technical lead:', err)
      const errorMsg = err.response?.data?.detail || 'Failed to create technical lead profile.'
      setError(`❌ ${errorMsg}`)
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
        batch_ids: editingForm.batch_ids && editingForm.batch_ids.length > 0 ? editingForm.batch_ids : [],
      }
      
      const { data: updatedProfile } = await api.put(`/profiles/${id}`, payload)
      
      // Update last update timestamp to ignore stale re-fetches
      lastUpdateRef.current = Date.now()
      
      // OPTIMISTIC UPDATE: Update local state immediately with returned data
      setTls(prev => prev.map(tl => tl.id === id ? updatedProfile : tl))
      
      // Success - clear editing state
      setEditingId(null)
      setEditingForm(EMPTY_FORM)
      setSuccess('✅ Technical lead updated successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Emit events to notify other pages
      emitTLUpdate()
      emitBatchUpdate()
    } catch (err) {
      console.error('❌ Failed to update technical lead:', err)
      const errorMsg = err.response?.data?.detail || 'Failed to update profile.'
      setError(`❌ ${errorMsg}`)
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
      
      // Immediate refetch to update UI
      load()
      loadBatches()
      
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
      
      // Immediate refetch to update UI
      load()
      loadBatches()
      
      // Emit events to notify other pages
      emitTLUpdate()
      emitBatchUpdate()
    } catch (err) {
      console.error('❌ Failed to activate profile:', err)
      const errorMsg = err.response?.data?.detail || 'Failed to activate profile.'
      setError(`❌ ${errorMsg}`)
    }
  }
  
  // Normalize TL profiles to strictly use `batches` arrays
  const normalizedTLs = useMemo(() => {
    return tls.map(tl => {
      let tlBatches = []
      
      // 1. Backend provided expanded batches
      if (tl.batches && Array.isArray(tl.batches)) {
        tlBatches = tl.batches
      } 
      // 2. Backend provided batch_ids
      else if (tl.batch_ids && Array.isArray(tl.batch_ids)) {
        tlBatches = tl.batch_ids
          .map(id => batches.find(b => String(b.id) === String(id)))
          .filter(Boolean)
      } 
      // 3. Derive from batches collection (if backend reverse relation is pending)
      else {
        tlBatches = batches.filter(b => 
          b.first_tech_lead_id === tl.id || 
          b.second_tech_lead_id === tl.id || 
          b.third_tech_lead_id === tl.id
        )
      }
      
      return { ...tl, batches: tlBatches }
    })
  }, [tls, batches])

  // Filter out inactive profiles
  const activeTLs = normalizedTLs.filter(tl => tl.is_active)

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
          
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
              Assign to Batches (Optional)
            </label>
            <select 
              className={`input min-h-[160px] w-full bg-white border-slate-200 focus:ring-2 focus:ring-cyan-500/20 transition-all ${fieldErrors.batch_ids ? 'border-red-500' : ''}`}
              multiple
              value={form.batch_ids} 
              onChange={(e) => handleBatchSelect(e, false)}
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id} className="py-1.5 px-2 cursor-pointer hover:bg-slate-50">
                  {b.name} — {b.tech_stack}
                </option>
              ))}
            </select>
            <div className="flex justify-between items-center mt-2">
              <p className="text-[11px] text-slate-500">
                <span className="font-semibold text-cyan-700">Tip:</span> Hold <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-sans text-[10px]">Ctrl</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-sans text-[10px]">Cmd</kbd> to select multiple batches
              </p>
              <p className="text-[11px] text-slate-400">
                {form.batch_ids.length} selected
              </p>
            </div>
            {fieldErrors.batch_ids && <p className="text-xs text-red-600 mt-1">{fieldErrors.batch_ids}</p>}
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
                <td className="td align-top">
                  {editingId === item.id ? (
                    <div className="min-w-[180px]">
                      <select 
                        className="input min-h-[120px] w-full bg-white text-sm" 
                        multiple
                        value={editingForm.batch_ids || []} 
                        onChange={(e) => handleBatchSelect(e, true)}
                      >
                        {batches.map((batch) => <option key={batch.id} value={batch.id} className="py-1">{batch.name}</option>)}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1 italic">Ctrl+Click to select</p>
                    </div>
                  ) : (
                    <div className="max-w-[200px] break-words">
                      {item.batches?.length ? item.batches.map(b => b.name).join(' / ') : 'Unassigned'}
                    </div>
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
                          
                          // Extract batch IDs for multi-select - HANDLES ALL BACKEND VARIATIONS
                          let batchIds = []
                          if (item.batches && Array.isArray(item.batches) && item.batches.length > 0) {
                            batchIds = item.batches.map(b => b.id)
                          } else if (item.batch_ids && Array.isArray(item.batch_ids) && item.batch_ids.length > 0) {
                            batchIds = item.batch_ids
                          } 
                          
                          setEditingForm({ 
                            name: item.name, 
                            email: item.email, 
                            tech_stack: item.tech_stack || '', 
                            batch_ids: batchIds 
                          })
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
