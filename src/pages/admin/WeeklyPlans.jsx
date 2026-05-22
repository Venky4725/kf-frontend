import { useEffect, useState, useMemo } from 'react'
import React from 'react'

import api from '../../lib/api'
import { onEvent, EVENTS } from '../../utils/events'
import { useAuth } from '../../hooks/AuthContext'

const EMPTY_FORM = { title: '', description: '', batch_id: '', due_date: '', assigned_to: '', priority: 'MEDIUM', status: 'PENDING' }

const STATUS_OPTIONS = [
  { label: 'Pending', value: 'PENDING', color: 'bg-amber-100 text-amber-700' },
  { label: 'In Progress', value: 'IN_PROGRESS', color: 'bg-indigo-100 text-indigo-700' },
  { label: 'Completed', value: 'COMPLETED', color: 'bg-emerald-100 text-emerald-700' },
]

const getErrorMessage = (error) => {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (Array.isArray(error)) return error.map(e => e.msg || e.detail || JSON.stringify(e)).join(", ");
  if (error.msg) return error.msg;
  if (error.detail) {
    if (typeof error.detail === 'string') return error.detail;
    if (Array.isArray(error.detail)) return getErrorMessage(error.detail);
    return JSON.stringify(error.detail);
  }
  return JSON.stringify(error);
};

function TaskDescription({ text }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return <p className="text-slate-400 italic text-sm">No description provided.</p>
  const limit = 250
  const isLong = text.length > limit
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600 leading-relaxed whitespace-normal break-words break-anywhere">
        {expanded || !isLong ? text : `${text.substring(0, limit)}...`}
      </p>
      {isLong && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs font-bold text-brand-600 hover:text-brand-700 uppercase tracking-wider">
          {expanded ? 'Show Less' : 'Read More'}
        </button>
      )}
    </div>
  )
}

export default function WeeklyPlans() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [batches, setBatches] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [interns, setInterns] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [isBulk, setIsBulk] = useState(false)
  const [importMode, setImportMode] = useState('SIMPLE') // 'SIMPLE' or 'ROADMAP'
  const [bulkInput, setBulkInput] = useState('')
  const [previewTasks, setPreviewTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingForm, setEditingForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Updated Filter States
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [selectedBatch, setSelectedBatch] = useState('')

  // Parsing Logic
  useEffect(() => {
    if (!bulkInput.trim()) {
      setPreviewTasks([])
      return
    }

    const lines = bulkInput.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    let parsed = []

    if (importMode === 'SIMPLE') {
      parsed = lines.map(line => ({
        title: line,
        description: form.description || '',
        due_date: form.due_date || null
      }))
    } else {
      // Roadmap Parser (Pipe or Tab separated)
      // Format: Day & Date | Topic | Activities | Outcome
      parsed = lines.map(line => {
        const parts = line.split(/[|\t]/).map(p => p.trim())
        if (parts.length >= 2) {
          // Attempt to extract date from parts[0]
          let dateStr = parts[0]
          let extractedDate = null
          
          // Basic date extraction (e.g., "Thu Apr 2" or "Apr 2")
          const dateMatch = dateStr.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+/i)
          if (dateMatch) {
            const d = new Date(`${dateMatch[0]} ${new Date().getFullYear()}`)
            if (!isNaN(d.getTime())) {
              extractedDate = d.toISOString().split('T')[0]
            }
          }

          return {
            title: parts[1] || 'Untitled Task',
            description: parts.slice(2).join(' | ') || form.description || '',
            due_date: extractedDate || form.due_date || null
          }
        }
        return null
      }).filter(t => t !== null)
    }

    setPreviewTasks(parsed)
  }, [bulkInput, importMode, form.due_date, form.description])

  const filteredInterns = React.useMemo(() => {
    if (!form.batch_id) return []
    return interns.filter(intern => String(intern.batch_id) === String(form.batch_id))
  }, [interns, form.batch_id])

  async function load() {
    try {
      const params = { limit: 500 }
      if (selectedBatch) params.batch_id = selectedBatch
      const [taskList, batchList, userList, internList] = await Promise.all([
        api.get('/tasks', { params }),
        api.get('/batches', { params: { limit: 500 } }),
        api.get('/profiles', { params: { limit: 500 } }),
        api.get('/profiles', { params: { role: 'INTERN', limit: 500 } }),
      ])
      setTasks(taskList.data || [])
      setBatches(batchList.data || [])
      setAllUsers(userList.data || [])
      setInterns(internList.data || [])
      setError('')
    } catch (err) {
      console.error('❌ Failed to load tasks:', err)
      setError(getErrorMessage(err.response?.data?.detail || 'Failed to load tasks.'))
      setTasks([]); setBatches([]); setAllUsers([]); setInterns([])
    }
  }

  useEffect(() => { load() }, [selectedBatch])
  
  useEffect(() => {
    const cleanupBatch = onEvent(EVENTS.BATCH_UPDATED, load)
    const cleanupTL = onEvent(EVENTS.TL_UPDATED, load)
    const cleanupIntern = onEvent(EVENTS.INTERN_UPDATED, load)
    return () => { cleanupBatch(); cleanupTL(); cleanupIntern() }
  }, [])

  // Date Logic for Grouping
  const dateInfo = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    return { today: now, tomorrow }
  }, [])

  const filteredTasks = useMemo(() => {
    let result = [...tasks]

    // 1. Search filter (Intern Name or Task Title)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t => 
        t.title.toLowerCase().includes(q) || 
        (t.assigned_to_name && t.assigned_to_name.toLowerCase().includes(q))
      )
    }

    // 2. Date Filter
    if (dateFilter) {
      result = result.filter(t => t.due_date === dateFilter)
    }

    // Default sorting for consistency
    result.sort((a, b) => {
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date) - new Date(b.due_date)
    })

    return result
  }, [tasks, searchQuery, dateFilter])

  const groupedTasks = useMemo(() => {
    const groups = {}
    const { today, tomorrow } = dateInfo
    const todayStr = today.toISOString().split('T')[0]
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    filteredTasks.forEach(task => {
      let label = 'No Due Date'
      if (task.due_date) {
        if (task.due_date === todayStr) label = 'Today'
        else if (task.due_date === tomorrowStr) label = 'Tomorrow'
        else {
          const d = new Date(task.due_date)
          label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        }
      }
      if (!groups[label]) groups[label] = []
      groups[label].push(task)
    })

    return Object.keys(groups).sort((a, b) => {
      if (a === 'Today') return -1
      if (b === 'Today') return 1
      if (a === 'Tomorrow') return -1
      if (b === 'Tomorrow') return 1
      if (a === 'No Due Date') return 1
      if (b === 'No Due Date') return -1
      return new Date(a).getTime() - new Date(b).getTime()
    }).map(label => ({ label, tasks: groups[label] }))
  }, [filteredTasks, dateInfo])

  async function createTask(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (isBulk) {
        if (previewTasks.length === 0) { setError('No tasks to create.'); setLoading(false); return }
        
        // Prepare payload for bulk creation with explicit string casting and defaults
        const payload = {
          batch_id: String(form.batch_id || ""),
          assigned_to: form.assigned_to ? String(form.assigned_to) : null,
          tasks: previewTasks.map(t => ({
            title: String(t.title || ""),
            description: String(t.description || ""),
            due_date: t.due_date ? String(t.due_date) : null,
            priority: String(t.priority || "MEDIUM"),
            status: String(t.status || "PENDING")
          }))
        }

        console.log('🚀 Bulk Task Payload:', payload)

        const res = await api.post('/tasks/bulk', payload)
        setBulkInput(''); setPreviewTasks([]); setForm(EMPTY_FORM)
        const createdCount = res.data.count ?? res.data.created_count ?? previewTasks.length
        setSuccess(`${createdCount} tasks created successfully!`)
      } else {
        const payload = { 
          ...form, 
          title: String(form.title || ""),
          description: String(form.description || ""),
          due_date: form.due_date ? String(form.due_date) : null,
          assigned_to: form.assigned_to ? String(form.assigned_to) : null 
        }
        
        console.log('🚀 Single Task Payload:', payload)
        
        await api.post('/tasks', payload)
        setForm(EMPTY_FORM)
        setSuccess('Task created successfully!')
      }
      setTimeout(() => setSuccess(''), 3000); load()
    } catch (err) {
      console.error('Failed to create task:', err)
      setError(getErrorMessage(err.response?.data?.detail || 'Failed to create task.'))
    } finally { setLoading(false) }
  }

  async function saveTask(id) {
    try {
      await api.put(`/tasks/${id}`, editingForm)
      setEditingId(null); setError(''); load()
    } catch (err) {
      setError(getErrorMessage(err.response?.data?.detail || 'Failed to update task.'))
    }
  }

  async function deleteTask(id) {
    if (!window.confirm('Delete this task?')) return
    try {
      await api.delete(`/tasks/${id}`)
      setError(''); load()
    } catch (err) {
      setError(getErrorMessage(err.response?.data?.detail || 'Failed to delete task.'))
    }
  }

  function batchName(batchId) {
    return batches.find((batch) => batch.id === batchId)?.name || 'Unknown batch'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Tasks</h1>
        <p className="text-sm text-slate-500 mt-2">Manage batch-level tasks that interns work on.</p>
      </div>

      {error && <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>}
      {success && <div className="card border border-green-200 bg-green-50 text-green-700">{success}</div>}

      {/* 1. Create New Task Form (TOP) */}
      <form onSubmit={createTask} className="card space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-lg font-semibold text-slate-900">Create New Task</h2>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button type="button" onClick={() => setIsBulk(false)} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${!isBulk ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Single</button>
            <button type="button" onClick={() => setIsBulk(true)} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${isBulk ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Bulk</button>
          </div>
        </div>

        <div className="space-y-4">
          {!isBulk ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="label">Task Title *</label>
                <input className="input" placeholder="e.g. Complete JavaScript Basics" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required={!isBulk} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="label">Due Date (Optional)</label>
                  <input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="label">Task Description (Optional)</label>
                  <input className="input" placeholder="Additional details" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Import Mode Selector */}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="radio" name="importMode" checked={importMode === 'SIMPLE'} onChange={() => setImportMode('SIMPLE')} className="w-4 h-4 text-brand-600 focus:ring-brand-500" />
                  <span className={`text-sm font-medium ${importMode === 'SIMPLE' ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-700'}`}>Simple Task List</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="radio" name="importMode" checked={importMode === 'ROADMAP'} onChange={() => setImportMode('ROADMAP')} className="w-4 h-4 text-brand-600 focus:ring-brand-500" />
                  <span className={`text-sm font-medium ${importMode === 'ROADMAP' ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-700'}`}>Weekly Roadmap / Schedule</span>
                </label>
              </div>

              <div className="space-y-2">
                <label className="label">
                  {importMode === 'SIMPLE' ? 'Paste Tasks (one per line) *' : 'Paste Roadmap (Pipe | or Tab separated) *'}
                </label>
                <textarea 
                  className="input min-h-[150px] font-mono text-xs leading-relaxed" 
                  placeholder={importMode === 'SIMPLE' 
                    ? "Task 1: Setup project\nTask 2: Install dependencies\nTask 3: Run initial tests" 
                    : "Thu Apr 2 | Orientation + Setup | Activities for Day 1\nFri Apr 3 | Basics & Functions | Activities for Day 2"
                  } 
                  value={bulkInput} 
                  onChange={(e) => setBulkInput(e.target.value)} 
                  required={isBulk} 
                />
                
                {/* Global Defaults for Bulk */}
                <div className="grid md:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1">
                    <label className="label text-[10px]">Default Due Date (if not extracted)</label>
                    <input className="input h-8 text-xs" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="label text-[10px]">Common Description (if empty)</label>
                    <input className="input h-8 text-xs" placeholder="Shared description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                </div>

                {/* Preview Section */}
                {previewTasks.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Preview ({previewTasks.length} tasks)</div>
                      <button type="button" onClick={() => setBulkInput('')} className="text-[10px] font-bold text-rose-600 hover:text-rose-700 uppercase tracking-wider">Clear All</button>
                    </div>
                    <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2">
                      {previewTasks.map((t, idx) => (
                        <div key={idx} className="flex items-start gap-3 bg-white border border-slate-100 rounded-lg p-3 group relative hover:border-brand-300 transition-colors shadow-sm">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-brand-500 font-bold text-xs">✓</span>
                              <span className="text-sm font-bold text-slate-800 truncate">{t.title}</span>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[10px]">
                              {t.due_date && (
                                <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100 flex items-center gap-1">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                  {t.due_date}
                                </span>
                              )}
                              {t.description && (
                                <span className="text-slate-400 truncate max-w-[200px]">{t.description}</span>
                              )}
                            </div>
                          </div>
                          <button 
                            type="button" 
                            onClick={() => setPreviewTasks(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="label">Target Batch *</label>
              <select className="input" value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value, assigned_to: '' })} required>
                <option value="">Select a batch</option>
                {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="label">Assigned To</label>
              <select className="input" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} disabled={!form.batch_id}>
                <option value="">All batch members</option>
                {filteredInterns.map((intern) => <option key={intern.id} value={intern.id}>{intern.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <button className="btn-primary w-full py-3 text-base font-bold disabled:opacity-70 disabled:cursor-not-allowed" type="submit" disabled={loading || (isBulk && previewTasks.length === 0)}>
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
              Creating Tasks...
            </span>
          ) : (
            isBulk ? `Create ${previewTasks.length} Tasks` : 'Create Single Task'
          )}
        </button>
      </form>

      {/* 2. Simplified Search & Filter (NEW) */}
      <div className="card">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Search & Filter</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search Intern</label>
            <div className="relative">
              <input
                className="input pl-9"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <svg className="absolute left-3 top-2.5 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Batch</label>
            <select className="input" value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)}>
              <option value="">All Batches</option>
              {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Date</label>
            <input
              className="input"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 3. Tasks List (BOTTOM) */}
      <div className="space-y-8">
        {groupedTasks.length === 0 ? (
          <div className="card text-center py-16 bg-slate-50 border-dashed border-2 border-slate-200">
            <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No tasks found</h3>
            <p className="text-slate-500 mt-1">Try adjusting your filters or search query.</p>
          </div>
        ) : (
          groupedTasks.map((group) => (
            <div key={group.label} className="space-y-4">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">{group.label}</h3>
                <div className="h-px w-full bg-slate-200"></div>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{group.tasks.length}</span>
              </div>
              <div className="grid gap-4">
                {group.tasks.map((item) => (
                  <div key={item.id} className="card hover:shadow-md transition-shadow border-slate-200 group">
                    {editingId === item.id ? (
                      <div className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Title</label>
                            <input className="input" value={editingForm.title} onChange={(e) => setEditingForm({ ...editingForm, title: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Due Date</label>
                            <input className="input" type="date" value={editingForm.due_date || ''} onChange={(e) => setEditingForm({ ...editingForm, due_date: e.target.value })} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description</label>
                          <textarea className="input min-h-[120px]" value={editingForm.description || ''} onChange={(e) => setEditingForm({ ...editingForm, description: e.target.value })} />
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                          <button className="btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                          <button className="btn-primary" onClick={() => saveTask(item.id)}>Save Changes</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            <div>
                              <h3 className="text-lg font-bold text-slate-900 leading-tight break-words">{item.title}</h3>
                              <div className="flex flex-wrap gap-2 mt-2">
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-600">
                                  <svg className="text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                  {batchName(item.batch_id)}
                                </div>
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-600">
                                  <svg className="text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                  {item.assigned_to_name || 'All batch members'}
                                </div>
                                {item.due_date && (
                                  <div className={`flex items-center gap-1.5 px-2 py-1 border rounded text-xs font-medium ${
                                    new Date(item.due_date) < dateInfo.today && item.status !== 'COMPLETED'
                                      ? 'bg-rose-50 border-rose-100 text-rose-700'
                                      : 'bg-amber-50 border-amber-100 text-amber-700'
                                  }`}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                    Due: {item.due_date}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Edit Task" onClick={() => { setEditingId(item.id); setEditingForm({ ...item, description: item.description || '', due_date: item.due_date || '', status: item.status || 'PENDING' }) }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete Task" onClick={() => deleteTask(item.id)}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                          </div>
                        </div>
                        <div className="pt-3 border-t border-slate-100"><TaskDescription text={item.description} /></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

