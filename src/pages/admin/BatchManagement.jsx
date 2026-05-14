import { useEffect, useState, useMemo } from 'react'

import api from '../../lib/api'
import { formatTechLeads } from '../../utils/formatters'

const EMPTY_FORM = { name: '', tech_stack: '', start_date: '', team_lead_ids: [] }

export default function BatchManagement() {
  const [batches, setBatches] = useState([])
  const [tls, setTls] = useState([])
  const [form, setForm] = useState({ ...EMPTY_FORM, start_date: new Date().toISOString().slice(0, 10) })
  const [editingId, setEditingId] = useState(null)
  const [editingForm, setEditingForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)

  // Create TL lookup map for efficient access
  const tlMap = useMemo(() => {
    return Object.fromEntries(tls.map(tl => [tl.id, tl]))
  }, [tls])

  async function load() {
    setLoading(true)
    try {
      const [batchList, tlProfiles] = await Promise.all([
        api.get('/batches', { params: { limit: 500 } }),
        api.get('/profiles', { params: { role: 'TECHNICAL_LEAD', limit: 500 } }),
      ])
      
      setBatches(batchList.data || [])
      setTls(tlProfiles.data || [])
      setError('')
    } catch (err) {
      console.error('❌ Failed to load batches:', err)
      
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
        setError(err.response?.data?.detail || 'Failed to load batches.')
      }
      
      setBatches([])
      setTls([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function createBatch(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    
    try {
      const payload = {
        name: form.name.trim(),
        tech_stack: form.tech_stack.trim(),
        start_date: form.start_date,
        team_lead_ids: form.team_lead_ids.length > 0 ? form.team_lead_ids : null,
      }
      
      await api.post('/batches', payload)
      
      setForm({ ...EMPTY_FORM, start_date: new Date().toISOString().slice(0, 10) })
      setSuccess('✅ Batch created successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Immediate refetch to update UI
      await load()
    } catch (err) {
      console.error('❌ Failed to create batch:', err)
      const errorMsg = err.response?.data?.detail || 'Failed to create batch.'
      setError(`❌ ${errorMsg}`)
    }
  }

  async function saveBatch(id) {
    setError('')
    setSuccess('')
    
    try {
      const payload = {
        name: editingForm.name.trim(),
        tech_stack: editingForm.tech_stack.trim(),
        start_date: editingForm.start_date,
        team_lead_ids: editingForm.team_lead_ids && Array.isArray(editingForm.team_lead_ids) && editingForm.team_lead_ids.length > 0 ? editingForm.team_lead_ids : null,
      }
      
      // DEBUG: Log the payload being sent
      if (process.env.NODE_ENV === 'development') {
        console.log('Sending batch update payload:', payload)
      }
      
      await api.put(`/batches/${id}`, payload)
      
      setEditingId(null)
      setEditingForm(EMPTY_FORM)
      setSuccess('✅ Batch updated successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Immediate refetch to update UI
      await load()
    } catch (err) {
      console.error('❌ Failed to update batch:', err)
      const errorMsg = err.response?.data?.detail || 'Failed to update batch.'
      setError(`❌ ${errorMsg}`)
    }
  }

  async function deleteBatch(id) {
    if (!window.confirm('Delete this batch? This will unassign all interns and tech leads.')) return
    
    setError('')
    
    try {
      await api.delete(`/batches/${id}`)
      setSuccess('✅ Batch deleted successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Immediate refetch to update UI
      await load()
    } catch (err) {
      console.error('❌ Failed to delete batch:', err)
      const errorMsg = err.response?.data?.detail || 'Failed to delete batch.'
      setError(`❌ ${errorMsg}`)
    }
  }

  // Format tech leads for display - USE ENRICHED BACKEND FIELDS
  function formatBatchTechLeads(batch) {
    if (!batch) return 'Unassigned'
    
    // PRIORITY 1: Use enriched tech_leads_display field from backend (NEW)
    if (batch.tech_leads_display && typeof batch.tech_leads_display === 'string' && batch.tech_leads_display.trim()) {
      return batch.tech_leads_display
    }
    
    // PRIORITY 2: Use technical_lead array from backend (NEW)
    if (batch.technical_lead && Array.isArray(batch.technical_lead) && batch.technical_lead.length > 0) {
      const names = batch.technical_lead
        .map(tl => tl?.name)
        .filter(Boolean)
      return names.length > 0 ? names.join(' / ') : 'Unassigned'
    }
    
    // PRIORITY 3: Use tech_leads array from backend
    if (batch.tech_leads && Array.isArray(batch.tech_leads) && batch.tech_leads.length > 0) {
      const names = batch.tech_leads
        .map(tl => tl?.name)
        .filter(Boolean)
      return names.length > 0 ? names.join(' / ') : 'Unassigned'
    }
    
    // FALLBACK: Use team_lead_ids with local lookup (legacy) - NORMALIZE IDs
    if (batch.team_lead_ids && Array.isArray(batch.team_lead_ids) && batch.team_lead_ids.length > 0) {
      const names = batch.team_lead_ids
        .map(id => {
          // Normalize ID for comparison
          const normalizedId = String(id)
          const tl = tls.find(t => String(t.id) === normalizedId)
          return tl?.name
        })
        .filter(Boolean)
      return names.length > 0 ? names.join(' / ') : 'Unassigned'
    }
    
    // LEGACY: Single tech lead ID - NORMALIZE ID
    if (batch.team_lead_id) {
      const normalizedId = String(batch.team_lead_id)
      const tl = tls.find(t => String(t.id) === normalizedId)
      return tl?.name || 'Unassigned'
    }
    
    // Final fallback to prevent displaying "Unassigned" when data already exists
    if (batch.technical_lead && Array.isArray(batch.technical_lead) && batch.technical_lead.length > 0) {
      return batch.technical_lead.map(tl => tl?.name).filter(Boolean).join(' / ')
    }
    
    return 'Unassigned'
  }

  // Handle multi-select for tech leads
  function handleTechLeadSelect(e, isEditing = false) {
    const selectedOptions = Array.from(e.target.selectedOptions, option => option.value)
    
    if (isEditing) {
      setEditingForm({ ...editingForm, team_lead_ids: selectedOptions })
    } else {
      setForm({ ...form, team_lead_ids: selectedOptions })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Batches</h1>
        <p className="text-sm text-slate-500 mt-2">Create batches and assign technical leads to them.</p>
      </div>

      {error && <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>}
      {success && <div className="card border border-green-200 bg-green-50 text-green-700">{success}</div>}

      <form onSubmit={createBatch} className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Create New Batch</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Batch Name *</label>
            <input 
              className="input" 
              placeholder="e.g., KF-Cohort-5" 
              value={form.name} 
              onChange={(e) => setForm({ ...form, name: e.target.value })} 
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tech Stack *</label>
            <input 
              className="input" 
              placeholder="e.g., Full Stack" 
              value={form.tech_stack} 
              onChange={(e) => setForm({ ...form, tech_stack: e.target.value })} 
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date *</label>
            <input 
              className="input" 
              type="date" 
              value={form.start_date} 
              onChange={(e) => setForm({ ...form, start_date: e.target.value })} 
              required 
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Assign Technical Leads (Optional)
          </label>
          <select 
            className="input min-h-[100px]" 
            multiple
            value={form.team_lead_ids} 
            onChange={(e) => handleTechLeadSelect(e, false)}
          >
            {tls.map((tl) => (
              <option key={tl.id} value={tl.id}>{tl.name} ({tl.email})</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Hold Ctrl/Cmd to select multiple tech leads
          </p>
        </div>
        <button className="btn-primary w-full" type="submit">Create Batch</button>
      </form>

      <div className="card overflow-x-auto">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">All Batches</h2>
        
        {loading ? (
          <div className="text-center py-8 text-slate-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            <p className="mt-2">Loading batches...</p>
          </div>
        ) : (
          <table className="table">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Name</th>
                <th className="th">Tech Stack</th>
                <th className="th">Start Date</th>
                <th className="th">Technical Leads</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((item) => (
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
                        value={editingForm.tech_stack} 
                        onChange={(e) => setEditingForm({ ...editingForm, tech_stack: e.target.value })} 
                      />
                    ) : item.tech_stack}
                  </td>
                  <td className="td">
                    {editingId === item.id ? (
                      <input 
                        className="input" 
                        type="date" 
                        value={editingForm.start_date} 
                        onChange={(e) => setEditingForm({ ...editingForm, start_date: e.target.value })} 
                      />
                    ) : item.start_date}
                  </td>
                  <td className="td">
                    {editingId === item.id ? (
                      <select 
                        className="input min-h-[80px]" 
                        multiple
                        value={editingForm.team_lead_ids || []} 
                        onChange={(e) => handleTechLeadSelect(e, true)}
                      >
                        {tls.map((tl) => (
                          <option key={tl.id} value={tl.id}>{tl.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-medium">{formatBatchTechLeads(item)}</span>
                    )}
                  </td>
                  <td className="td space-x-3">
                    {editingId === item.id ? (
                      <>
                        <button 
                          className="text-sm text-brand-700 font-semibold" 
                          onClick={() => saveBatch(item.id)}
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
                        <button 
                          className="text-sm text-brand-700 font-semibold" 
                          onClick={() => {
                            setEditingId(item.id)
                            setEditingForm({
                              name: item.name,
                              tech_stack: item.tech_stack,
                              start_date: item.start_date,
                              team_lead_ids: item.team_lead_ids || 
                                (item.team_lead_id ? [item.team_lead_id] : []) ||
                                (item.technical_lead && Array.isArray(item.technical_lead) 
                                  ? item.technical_lead.map(tl => tl.id) 
                                  : []) ||
                                (item.technical_leads && Array.isArray(item.technical_leads) 
                                  ? item.technical_leads.map(tl => tl.id) 
                                  : []),
                            })
                          }}
                        >
                          Edit
                        </button>
                        <button 
                          className="text-sm text-rose-700 font-semibold" 
                          onClick={() => deleteBatch(item.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td className="td text-slate-500 text-center" colSpan={5}>
                    No batches found. Create your first batch above.
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
