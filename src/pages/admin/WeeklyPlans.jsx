import { useEffect, useState, useMemo } from 'react'
import React from 'react'

import api from '../../lib/api'
import { onEvent, EVENTS } from '../../utils/events'

const EMPTY_FORM = { title: '', description: '', batch_id: '', due_date: '', assigned_to: '', priority: 'MEDIUM', status: 'PENDING' }

const PRIORITY_OPTIONS = [
  { label: 'Low', value: 'LOW', color: 'bg-slate-100 text-slate-700' },
  { label: 'Medium', value: 'MEDIUM', color: 'bg-blue-100 text-blue-700' },
  { label: 'High', value: 'HIGH', color: 'bg-rose-100 text-rose-700' },
]

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
  const [tasks, setTasks] = useState([])
  const [batches, setBatches] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [interns, setInterns] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [isBulk, setIsBulk] = useState(false)
  const [bulkInput, setBulkInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState('desc')
  const [editingId, setEditingId] = useState(null)
  const [editingForm, setEditingForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const parsedTasks = useMemo(() => {
    return bulkInput.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  }, [bulkInput])

  const filteredInterns = React.useMemo(() => {
    if (!form.batch_id) return []
    return interns.filter(intern => String(intern.batch_id) === String(form.batch_id))
  }, [interns, form.batch_id])

  async function load() {
    try {
      const params = { limit: 500 }
      if (selectedBatch) params.batch_id = selectedBatch
      if (sortBy) { params.sort_by = sortBy; params.order = sortOrder }
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

  useEffect(() => { load() }, [selectedBatch, sortBy, sortOrder])
  
  useEffect(() => {
    const cleanupBatch = onEvent(EVENTS.BATCH_UPDATED, load)
    const cleanupTL = onEvent(EVENTS.TL_UPDATED, load)
    const cleanupIntern = onEvent(EVENTS.INTERN_UPDATED, load)
    return () => { cleanupBatch(); cleanupTL(); cleanupIntern() }
  }, [])

  async function createTask(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (isBulk) {
        if (parsedTasks.length === 0) { setError('Please enter at least one task.'); setLoading(false); return }
        const tasksPayload = parsedTasks.map(title => ({
          title,
          description: form.description,
          batch_id: form.batch_id,
          due_date: form.due_date || null,
          assigned_to: form.assigned_to || null,
          priority: 'LOW',
          status: 'PENDING'
        }))
        const res = await api.post('/tasks/bulk', { tasks: tasksPayload })
        setBulkInput(''); setForm(EMPTY_FORM)
        const createdCount = res.data.count ?? res.data.created_count ?? parsedTasks.length
        const failedCount = res.data.failed_count ?? 0
        setSuccess(failedCount > 0 ? `${createdCount} tasks created, ${failedCount} failed.` : `${createdCount} tasks created successfully!`)
      } else {
        const payload = { ...form, due_date: form.due_date || null, assigned_to: form.assigned_to || null }
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
            <div className="space-y-1">
              <label className="label">Task Title *</label>
              <input className="input" placeholder="e.g. Complete JavaScript Basics" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required={!isBulk} />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="label">Paste Tasks (one per line) *</label>
              <textarea className="input min-h-[150px] font-mono text-xs leading-relaxed" placeholder={"Task 1: Setup project\nTask 2: Install dependencies\nTask 3: Run initial tests"} value={bulkInput} onChange={(e) => setBulkInput(e.target.value)} required={isBulk} />
              {parsedTasks.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Preview ({parsedTasks.length} tasks)</div>
                  <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                    {parsedTasks.map((t, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                        <span className="text-brand-500 font-bold">✓</span>
                        <span className="truncate">{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="label">Due Date (Optional)</label>
              <input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="label">Common Description (Optional)</label>
              <input className="input" placeholder="Added to all tasks" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            {!isBulk && (
              <>
                <div className="space-y-1">
                  <label className="label">Priority</label>
                  <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="label">Initial Status</label>
                  <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        <button className="btn-primary w-full py-3 text-base font-bold disabled:opacity-70 disabled:cursor-not-allowed" type="submit" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
              Creating Tasks...
            </span>
          ) : (
            isBulk ? `Create ${parsedTasks.length} Tasks` : 'Create Single Task'
          )}
        </button>
      </form>

      {/* 2. Filters Section (MIDDLE) */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Filter & Sort Tasks</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Batch</label>
            <select className="input" value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)}>
              <option value="">All batches</option>
              {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sort By</label>
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="created_at">Created Date</option>
              <option value="title">Title</option>
              <option value="due_date">Due Date</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Order</label>
            <select className="input" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Tasks List (BOTTOM) */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-slate-900">All Tasks</h2>
          <div className="bg-brand-50 text-brand-700 text-xs font-bold px-3 py-1 rounded-full border border-brand-100 uppercase tracking-tight">
            {tasks.length} {tasks.length === 1 ? 'Task' : 'Tasks'} Found
          </div>
        </div>

        <div className="grid gap-4">
          {tasks.map((item) => (
            <div key={item.id} className="card hover:shadow-md transition-shadow border-slate-200">
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
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Priority</label>
                      <select className="input" value={editingForm.priority} onChange={(e) => setEditingForm({ ...editingForm, priority: e.target.value })}>
                        {PRIORITY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</label>
                      <select className="input" value={editingForm.status} onChange={(e) => setEditingForm({ ...editingForm, status: e.target.value })}>
                        {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
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
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${PRIORITY_OPTIONS.find(o => o.value === item.priority)?.color || 'bg-slate-100 text-slate-700'}`}>
                            {item.priority || 'MEDIUM'}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${STATUS_OPTIONS.find(o => o.value === item.status)?.color || 'bg-slate-100 text-slate-700'}`}>
                            {(item.status || 'PENDING').replace('_', ' ')}
                          </span>
                        </div>
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
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-100 rounded text-xs font-medium text-amber-700">
                              <svg className="text-amber-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                              Due: {item.due_date}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Edit Task" onClick={() => { setEditingId(item.id); setEditingForm({ ...item, description: item.description || '', due_date: item.due_date || '', priority: item.priority || 'MEDIUM', status: item.status || 'PENDING' }) }}>
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

        {tasks.length === 0 && (
          <div className="card text-center py-16 bg-slate-50 border-dashed border-2 border-slate-200">
            <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No tasks found</h3>
            <p className="text-slate-500 mt-1">Try adjusting your filters or create a new task above.</p>
          </div>
        )}
      </div>
    </div>
  )
}

