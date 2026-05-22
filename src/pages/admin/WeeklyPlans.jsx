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
  const [showRoadmapModal, setShowRoadmapModal] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  
  // Updated Filter States
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [selectedBatch, setSelectedBatch] = useState('')

  // Parsing Logic
  useEffect(() => {
    if (!bulkInput.trim()) {
      setPreviewTasks([])
      setParseError('')
      return
    }

    if (importMode === 'SIMPLE') {
      const lines = bulkInput.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      const parsed = lines.map(line => ({
        title: line,
        description: form.description || '',
        due_date: form.due_date || null
      }))
      setPreviewTasks(parsed)
      setParseError('')
    } else {
      // Roadmap mode: backend parsing triggered by a debounced effect or manual button
      // To follow "when pasted" accurately, we'll trigger after a small delay
      const timer = setTimeout(handleParseRoadmap, 1000)
      return () => clearTimeout(timer)
    }
  }, [bulkInput, importMode])

  async function handleParseRoadmap() {
    if (!bulkInput.trim() || importMode !== 'ROADMAP') return
    
    setIsParsing(true)
    setParseError('')
    try {
      const res = await api.post('/tasks/parse-roadmap', { raw_text: bulkInput })
      if (res.data && Array.isArray(res.data.entries)) {
        const parsed = res.data.entries.map(e => ({
          title: String(e.topic || e.title || 'Untitled Topic'),
          description: `[ROADMAP]${e.activities || '—'}$$$${e.outcome || '—'}$$$${e.day || 'N/A'}`,
          due_date: e.due_date || null,
          is_roadmap: true
        }))
        setPreviewTasks(parsed)
        if (parsed.length === 0) {
          setParseError('Could not detect roadmap structure. Please ensure each day contains:\nDay\nTopic\nActivities\nOutcome')
        }
      } else {
        setParseError('Unexpected response format from parser.')
      }
    } catch (err) {
      console.error('Syllabus parsing failed:', err)
      setParseError('Could not detect roadmap structure. Please ensure each day contains:\nDay\nTopic\nActivities\nOutcome')
      setPreviewTasks([])
    } finally {
      setIsParsing(false)
    }
  }

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

    return result
  }, [tasks, searchQuery, dateFilter])

  const { normalTasks, roadmapTasks } = useMemo(() => {
    const normal = []
    const roadmap = []
    
    filteredTasks.forEach(task => {
      if (task.description?.startsWith('[ROADMAP]')) {
        roadmap.push(task)
      } else {
        normal.push(task)
      }
    })

    // Sort roadmap by date
    roadmap.sort((a, b) => {
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date) - new Date(b.due_date)
    })

    return { normalTasks: normal, roadmapTasks: roadmap }
  }, [filteredTasks])

  const groupedNormalTasks = useMemo(() => {
    const groups = {}
    const { today, tomorrow } = dateInfo
    const todayStr = today.toISOString().split('T')[0]
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    normalTasks.forEach(task => {
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
  }, [normalTasks, dateInfo])

  function RoadmapTable({ tasks }) {
    if (tasks.length === 0) return null

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">Weekly Training Roadmaps</h3>
          <div className="h-px w-full bg-slate-200"></div>
          <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{tasks.length}</span>
        </div>
        
        <div className="card p-0 overflow-hidden border-slate-200 shadow-sm">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-32">Day</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-64">Topic / Theme</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Key Activities & Exercises</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-48">Daily Outcome</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-16 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {tasks.map((task) => {
                  const parts = task.description.replace('[ROADMAP]', '').split('$$$')
                  const activities = parts[0] || ''
                  const outcome = parts[1] || ''
                  const dayRaw = parts[2] || task.due_date || 'N/A'

                  return (
                    <tr key={task.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-4 py-4 align-top">
                        <div className="text-sm font-bold text-slate-900 leading-tight">{dayRaw}</div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="text-sm font-black text-brand-700 leading-tight">{task.title}</div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">{activities}</div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 inline-block">{outcome || 'N/A'}</div>
                      </td>
                      <td className="px-4 py-4 align-top text-center">
                        <button 
                          onClick={() => deleteTask(task.id)}
                          className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500 mt-2">Manage batch-level tasks and training roadmaps.</p>
        </div>
        <button 
          onClick={() => { setImportMode('ROADMAP'); setIsBulk(true); setShowRoadmapModal(true) }}
          className="btn-primary flex items-center gap-2 px-6 py-3 shadow-lg shadow-brand-200"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Paste Weekly Roadmap
        </button>
      </div>

      {error && <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>}
      {success && <div className="card border border-green-200 bg-green-50 text-green-700">{success}</div>}

      {/* 1. Create New Task Form (Single Task only for direct form) */}
      {!isBulk && (
        <form onSubmit={createTask} className="card space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h2 className="text-lg font-semibold text-slate-900">Create Single Task</h2>
            <button type="button" onClick={() => { setImportMode('SIMPLE'); setIsBulk(true); setShowRoadmapModal(true) }} className="text-xs font-bold text-brand-600 hover:text-brand-700 uppercase tracking-widest bg-brand-50 px-3 py-1.5 rounded-lg border border-brand-100">Switch to Bulk Import</button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="label">Task Title *</label>
              <input className="input" placeholder="e.g. Complete JavaScript Basics" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
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

          <button className="btn-primary w-full py-3 text-base font-bold" type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create Single Task'}
          </button>
        </form>
      )}

      {/* 2. Simplified Search & Filter */}
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
            <input className="input" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </div>
        </div>
      </div>

      {/* 3. Tasks View (Separated Roadmap and Normal) */}
      <div className="space-y-12">
        {/* Roadmap View */}
        <RoadmapTable tasks={roadmapTasks} />

        {/* Normal Tasks View */}
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">Normal Tasks</h3>
            <div className="h-px w-full bg-slate-200"></div>
          </div>
          
          {groupedNormalTasks.length === 0 ? (
            <div className="card text-center py-12 bg-slate-50 border-dashed border-2 border-slate-200">
              <p className="text-slate-500">No normal tasks found.</p>
            </div>
          ) : (
            groupedNormalTasks.map((group) => (
              <div key={group.label} className="space-y-4">
                <div className="flex items-center gap-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">{group.label}</h3>
                  <div className="h-px w-full bg-slate-100"></div>
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
                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-100 rounded text-xs font-medium text-amber-700">
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

      {/* Roadmap Modal */}
      {showRoadmapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="card w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl border-none p-0 flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-black text-slate-900">{importMode === 'ROADMAP' ? 'Paste Weekly Roadmap' : 'Bulk Import Tasks'}</h2>
              <button onClick={() => { setShowRoadmapModal(false); setIsBulk(false); setBulkInput('') }} className="text-slate-400 hover:text-slate-600 p-2"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            
            <div className="p-6 space-y-6 flex-1">
              <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 text-sm text-brand-800 leading-relaxed">
                {importMode === 'ROADMAP' ? (
                  <><strong>Roadmap Parser:</strong> Paste your weekly syllabus or roadmap directly. The system will automatically detect and structure it.</>
                ) : (
                  <><strong>Bulk Format:</strong> Paste each task on a new line.</>
                )}
              </div>

              <div className="space-y-2">
                <textarea 
                  className="input min-h-[300px] font-mono text-sm leading-relaxed" 
                  placeholder={importMode === 'ROADMAP' 
                    ? "Day\nTopic / Theme\nKey Activities & Exercises\nDaily Outcome\n\nMon May 18\nFree AI APIs — Chat & Streaming\nFree LLM providers: Groq...\nAdd free LLM-powered streaming chat...\n\nTue May 19\n..." 
                    : "Task 1\nTask 2\nTask 3"
                  } 
                  value={bulkInput} 
                  onChange={(e) => setBulkInput(e.target.value)} 
                />
                {isParsing && (
                  <div className="flex items-center gap-2 text-xs font-bold text-brand-600 animate-pulse mt-2">
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
                    Parsing roadmap...
                  </div>
                )}
                {parseError && (
                  <div className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 p-3 rounded-lg mt-2 leading-relaxed">
                    {parseError}
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="label">Target Batch *</label>
                  <select className="input" value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value, assigned_to: '' })} required>
                    <option value="">Select a batch</option>
                    {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="label">Assign To</label>
                  <select className="input" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} disabled={!form.batch_id}>
                    <option value="">All batch members</option>
                    {filteredInterns.map((intern) => <option key={intern.id} value={intern.id}>{intern.name}</option>)}
                  </select>
                </div>
              </div>

              {previewTasks.length > 0 && (
                <div className="space-y-4">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between border-b border-slate-100 pb-2">
                    <span>Detected Structure ({previewTasks.length} entries)</span>
                    <button type="button" onClick={() => { setBulkInput(''); setPreviewTasks([]) }} className="text-rose-600 hover:underline">Clear All</button>
                  </div>
                  <div className="overflow-x-auto card p-0 border-slate-200">
                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          <th className="px-3 py-2 font-black text-slate-400 uppercase">Day</th>
                          <th className="px-3 py-2 font-black text-slate-400 uppercase">Topic</th>
                          <th className="px-3 py-2 font-black text-slate-400 uppercase">Activities</th>
                          <th className="px-3 py-2 font-black text-slate-400 uppercase">Outcome</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewTasks.map((t, idx) => {
                          const parts = t.description.replace('[ROADMAP]', '').split('$$$')
                          return (
                            <tr key={idx} className="bg-white">
                              <td className="px-3 py-2 font-bold text-slate-900">{parts[2] || 'N/A'}</td>
                              <td className="px-3 py-2 text-brand-700 font-bold">{t.title}</td>
                              <td className="px-3 py-2 text-slate-500 truncate max-w-[150px]">{parts[0]}</td>
                              <td className="px-3 py-2 text-emerald-600 font-bold">{parts[1]}</td>
                              <td className="px-2 py-2 text-right">
                                <button onClick={() => setPreviewTasks(prev => prev.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-rose-600 p-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 sticky bottom-0 z-10">
              <button onClick={() => { setShowRoadmapModal(false); setIsBulk(false); setBulkInput('') }} className="btn-ghost">Cancel</button>
              <button 
                onClick={createTask} 
                className="btn-primary px-8" 
                disabled={loading || isParsing || previewTasks.length === 0 || !form.batch_id}
              >
                {loading ? 'Processing...' : `Confirm & Create ${previewTasks.length} Entries`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

