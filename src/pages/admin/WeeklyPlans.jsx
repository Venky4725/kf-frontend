import { useEffect, useState, useMemo, useCallback } from 'react'
import React from 'react'

import api from '../../lib/api'
import { onEvent, EVENTS } from '../../utils/events'
import { useAuth } from '../../hooks/AuthContext'
import RoadmapTaskCard, { isRoadmapTask } from '../../components/RoadmapTaskCard'

const EMPTY_FORM = { title: '', description: '', batch_id: '', due_date: '', assigned_to: '', priority: 'MEDIUM', status: 'PENDING', tech_stack: '' }

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

const normalizeRole = (role = "") => 
  (role || "").toLowerCase().replace(/[^a-z]/g, "");

// Map normalized roles to filter categories
const getRoleCategory = (techStack = "") => {
  const normalized = normalizeRole(techStack);
  
  // AI/ML variations
  if (normalized.includes('ai') || normalized.includes('ml') || 
      normalized.includes('data') || normalized.includes('science')) {
    return 'aiml';
  }
  
  // FULLSTACK variations (Python, MERN, Java, etc.)
  if (normalized.includes('full') || normalized.includes('stack') || 
      normalized.includes('python') || normalized.includes('mern') || 
      normalized.includes('java') || normalized.includes('web')) {
    return 'fullstack';
  }
  
  // Default to general
  return 'general';
};

export default function WeeklyPlans() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [batches, setBatches] = useState([])
  const [interns, setInterns] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  
  // Modal State
  const [showBulkModal, setShowBulkModal] = useState(false)
  
  const [bulkInput, setBulkInput] = useState('')
  const [previewTasks, setPreviewTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingForm, setEditingForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [selectedBatch, setSelectedBatch] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [roadmapExpanded, setRoadmapExpanded] = useState(false)
  const [staticLoaded, setStaticLoaded] = useState(false)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load static data
  const loadStaticData = useCallback(async () => {
    if (staticLoaded) return
    try {
      console.log('📥 Loading static data (batches & interns)...')
      const [batchList, profileList] = await Promise.all([
        api.get('/batches', { params: { limit: 500 } }),
        api.get('/profiles', { params: { limit: 500 } }),
      ])
      
      console.log('📦 API Response - Batches:', batchList.data?.length || 0)
      console.log('📦 API Response - Profiles:', profileList.data?.length || 0)
      
      const allInterns = (profileList.data || []).filter(p => p.role === 'INTERN')
      console.log('👥 Total Interns:', allInterns.length)
      
      // Group interns by tech_stack to see distribution
      const techStackGroups = {}
      allInterns.forEach(intern => {
        const stack = intern.tech_stack || 'NONE'
        if (!techStackGroups[stack]) techStackGroups[stack] = []
        techStackGroups[stack].push(intern.name)
      })
      console.log('📊 Interns by tech_stack:', techStackGroups)
      
      setBatches(batchList.data || [])
      setInterns(allInterns)
      setStaticLoaded(true)
    } catch (err) {
      console.error('❌ Failed to load static data:', err)
    }
  }, [staticLoaded])

  const loadTasks = useCallback(async () => {
    if (!user?.id) return
    try {
      const params = { limit: 1000 }
      const { data } = await api.get('/tasks', { params })
      setTasks(data || [])
      setError('')
    } catch (err) {
      console.error('Failed to load tasks:', err)
      setError(getErrorMessage(err.response?.data?.detail || 'Failed to load tasks.'))
      setTasks([])
    }
  }, [user?.id])

  useEffect(() => {
    loadStaticData()
    loadTasks()
  }, [loadStaticData, loadTasks])
  
  useEffect(() => {
    if (!user?.id) return
    const cleanups = [
      onEvent(EVENTS.BATCH_UPDATED, loadTasks),
      onEvent(EVENTS.TL_UPDATED, loadTasks),
      onEvent(EVENTS.INTERN_UPDATED, loadTasks)
    ]
    return () => cleanups.forEach(fn => fn())
  }, [user?.id, loadTasks])

  // Unified Frontend Parser
  useEffect(() => {
    if (!bulkInput.trim()) {
      setPreviewTasks([])
      setParseError('')
      return
    }

    const hasRoadmapPattern = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(bulkInput);

    if (hasRoadmapPattern) {
      const lines = bulkInput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const ignore = ['Day', 'Topic / Theme', 'Key Activities & Exercises', 'Daily Outcome', 'Topic', 'Activities', 'Outcome'];
      const cleanLines = lines.filter(l => !ignore.includes(l));
      
      const tasks = [];
      if (cleanLines.length > 0 && cleanLines[0].includes('\t')) {
        cleanLines.forEach(line => {
          const parts = line.split('\t');
          if (parts.length >= 2) {
            tasks.push({
              title: parts[1] || 'Untitled Topic',
              description: '',
              task_type: 'roadmap',
              roadmap_entries: [{
                day: parts[0] || 'N/A',
                topic: parts[1] || 'Untitled Topic',
                activities: parts[2] || '—',
                outcome: parts[3] || '—'
              }],
              due_date: form.due_date || null
            });
          }
        });
      } else {
        for (let i = 0; i < cleanLines.length; i += 4) {
          tasks.push({
            title: cleanLines[i+1] || cleanLines[i] || 'Untitled Topic',
            description: '',
            task_type: 'roadmap',
            roadmap_entries: [{
              day: cleanLines[i] || 'N/A',
              topic: cleanLines[i+1] || 'Untitled Topic',
              activities: cleanLines[i+2] || '—',
              outcome: cleanLines[i+3] || '—'
            }],
            due_date: form.due_date || null
          });
        }
      }
      setPreviewTasks(tasks);
      setParseError(tasks.length === 0 ? 'Could not detect valid roadmap blocks.' : '');
    } else {
      const lines = bulkInput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const parsed = lines.map(line => ({
        title: line,
        description: form.description || '',
        task_type: 'bulk',
        due_date: form.due_date || null
      }));
      setPreviewTasks(parsed);
      setParseError('');
    }
  }, [bulkInput, form.description, form.due_date]);

  const filteredInterns = useMemo(() => {
    if (!form.batch_id) return []
    
    console.log('🔍 FILTERING INTERNS:')
    console.log('  Selected Batch:', form.batch_id)
    console.log('  Selected Role (from dropdown):', form.tech_stack)
    console.log('  Total Interns:', interns.length)
    
    let result = interns.filter(intern => String(intern.batch_id) === String(form.batch_id))
    console.log('  After Batch Filter:', result.length, 'interns')
    
    if (form.tech_stack) {
      const selectedCategory = getRoleCategory(form.tech_stack);
      console.log('  Selected Role Category:', selectedCategory)
      
      // Log each intern's tech_stack before filtering
      result.forEach(intern => {
        const internCategory = getRoleCategory(intern.tech_stack);
        console.log(`    Intern: ${intern.name}, tech_stack: "${intern.tech_stack}", category: "${internCategory}"`)
      })
      
      result = result.filter(intern => {
        const internCategory = getRoleCategory(intern.tech_stack);
        return internCategory === selectedCategory;
      })
      console.log('  After Role Filter:', result.length, 'interns')
    }
    
    console.log('  Final Filtered Interns:', result.map(i => ({ name: i.name, tech_stack: i.tech_stack })))
    
    return result
  }, [interns, form.batch_id, form.tech_stack])

  // Reactive Filtering Logic
  const filteredTasks = useMemo(() => {
    let result = [...tasks]

    // 1. Batch Filter
    if (selectedBatch) {
      result = result.filter(t => String(t.batch_id) === String(selectedBatch))
    }

    // 2. Role Filter - use category matching
    if (selectedRole) {
      const selectedCategory = getRoleCategory(selectedRole);
      result = result.filter(t => {
        const taskCategory = getRoleCategory(t.role || t.tech_stack || "GENERAL");
        return taskCategory === selectedCategory || taskCategory === 'general';
      })
    }

    // 3. Date Filter & Roadmap logic
    if (dateFilter) {
      const selectedISO = dateFilter 
      result = result.filter(t => {
        if (t.task_type === 'roadmap' || isRoadmapTask(t)) {
          const entries = t.roadmap_entries || []
          return entries.some(e => {
            if (!e.day) return false
            try {
              return new Date(e.day).toISOString().split('T')[0] === selectedISO
            } catch (err) {
              return false
            }
          })
        }
        return t.due_date === selectedISO
      })
    }

    // 4. Search Filter (Combined with others)
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(t => {
        const internName = t.assigned_to_name || (t.assigned_to && interns.find(i => String(i.id) === String(t.assigned_to))?.name) || ''
        const inTitle = (t.title || '').toLowerCase().includes(q)
        const inAssignee = internName.toLowerCase().includes(q)
        const inRole = (t.role || t.tech_stack || 'GENERAL').toLowerCase().includes(q)
        const inBatch = batchName(t.batch_id).toLowerCase().includes(q)
        
        let inRoadmap = false
        if (t.task_type === 'roadmap' || isRoadmapTask(t)) {
          inRoadmap = (t.roadmap_entries || []).some(e => 
            (e.topic && e.topic.toLowerCase().includes(q)) ||
            (e.activities && e.activities.toLowerCase().includes(q)) ||
            (e.day && e.day.toLowerCase().includes(q))
          )
        }
        
        return inTitle || inAssignee || inRole || inBatch || inRoadmap
      })
    }

    return result
  }, [tasks, selectedBatch, selectedRole, debouncedSearch, dateFilter, interns])

  const { normalTasks, roadmapTasks } = useMemo(() => {
    const normal = []
    const roadmap = []

    filteredTasks.forEach(task => {
      if (task.task_type === 'roadmap' || isRoadmapTask(task)) {
        roadmap.push(task)
      } else {
        normal.push(task)
      }
    })

    return { normalTasks: normal, roadmapTasks: roadmap }
  }, [filteredTasks])

  const groupedNormalTasks = useMemo(() => {
    const groups = {}
    
    normalTasks.forEach(task => {
      let label = 'Other'
      if (task.due_date) {
        const d = new Date(task.due_date)
        label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      }
      if (!groups[label]) groups[label] = []
      groups[label].push(task)
    })

    return Object.keys(groups).sort((a, b) => {
      if (a === 'Other') return 1
      if (b === 'Other') return -1
      return new Date(a).getTime() - new Date(b).getTime()
    }).map(label => ({ label, tasks: groups[label] }))
  }, [normalTasks])

  const groupedRoadmapTasks = useMemo(() => {
    const groups = {}
    roadmapTasks.forEach(task => {
      // Preserve original tech_stack for display
      const rawRole = task.role || task.tech_stack
      const category = getRoleCategory(rawRole)
      
      // Display role logic: preserve original or show GENERAL
      let displayRole = "GENERAL"
      if (rawRole && category !== "general") {
        displayRole = rawRole.trim() // Preserve original: "Python Full Stack", "MERN Stack", etc.
      }
      
      // GROUP USING batch_id + category (not raw role)
      const key = `${task.batch_id}_${category}`
      
      if (!groups[key]) {
        groups[key] = { 
          batch_id: task.batch_id, 
          role: displayRole, // Display original value
          category: category, // Internal category for filtering
          tasks: [] 
        }
      }
      groups[key].tasks.push(task)
    })
    return Object.values(groups)
  }, [roadmapTasks])

  async function createTask(event) {
    if (event) event.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (showBulkModal) {
        const payload = {
          batch_id: String(form.batch_id || ""),
          assigned_to: form.assigned_to ? String(form.assigned_to) : null,
          tech_stack: form.tech_stack || null,
          tasks: previewTasks.map(t => {
            const re = t.roadmap_entries?.[0] || {};
            return {
              day: String(re.day || t.day || ""),
              topic: String(re.topic || t.topic || t.title || ""),
              activities: String(re.activities || t.activities || ""),
              outcome: String(re.outcome || t.outcome || "")
            };
          })
        };
        console.log("FINAL BULK PAYLOAD", payload);
        const res = await api.post('/tasks/bulk', payload)
        setBulkInput(''); setPreviewTasks([]); setForm(EMPTY_FORM); setShowBulkModal(false)
        setSuccess(`${res.data.count ?? previewTasks.length} tasks created!`)
      } else {
        const payload = { 
          ...form, 
          task_type: "single",
          tech_stack: form.tech_stack || null
        }
        await api.post('/tasks', payload)
        setForm(EMPTY_FORM); setSuccess('Task created successfully!')
      }
      setTimeout(() => setSuccess(''), 3000); loadTasks()
    } catch (err) {
      setError(getErrorMessage(err.response?.data?.detail || 'Failed to create task.'))
    } finally { setLoading(false) }
  }

  async function saveTask(id) {
    try {
      await api.put(`/tasks/${id}`, editingForm)
      setEditingId(null); loadTasks()
    } catch (err) {
      setError(getErrorMessage(err.response?.data?.detail || 'Update failed.'))
    }
  }

  async function deleteTask(id) {
    if (!window.confirm('Delete this task?')) return
    try {
      await api.delete(`/tasks/${id}`)
      loadTasks()
    } catch (err) {
      setError(getErrorMessage(err.response?.data?.detail || 'Delete failed.'))
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
          <p className="text-sm text-slate-500 mt-2">Manage tasks and structured roadmaps.</p>
        </div>
      </div>

      {error && <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>}
      {success && <div className="card border border-green-200 bg-green-50 text-green-700">{success}</div>}

      {/* 1. Create New Task Form (ALWAYS VISIBLE) */}
      <form onSubmit={createTask} className="card space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-lg font-semibold text-slate-900">Create Single Task</h2>
          <button 
            type="button" 
            onClick={() => setShowBulkModal(true)} 
            className="text-xs font-bold text-brand-600 hover:text-brand-700 uppercase tracking-widest bg-brand-50 px-3 py-1.5 rounded-lg border border-brand-100"
          >
            Switch to Bulk Import
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="label">Task Title *</label>
            <input className="input" placeholder="e.g. Complete JavaScript Basics" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="label">Due Date</label>
              <input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="label">Description</label>
              <input className="input" placeholder="Optional details" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="label">Batch *</label>
              <select className="input" value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value, tech_stack: '', assigned_to: '' })} required>
                <option value="">Select Batch</option>
                {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="label">Role (Tech Stack)</label>
              <select className="input" value={form.tech_stack} onChange={(e) => setForm({ ...form, tech_stack: e.target.value, assigned_to: '' })} disabled={!form.batch_id}>
                <option value="">All Roles</option>
                <option value="AI/ML">AI/ML</option>
                <option value="FULLSTACK">FULLSTACK</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="label">Assign To</label>
              <select className="input" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} disabled={!form.batch_id}>
                <option value="">{form.tech_stack ? `All ${form.tech_stack} interns` : 'All members'}</option>
                {filteredInterns.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <button className="btn-primary w-full py-3 text-base font-bold" type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Single Task'}
        </button>
      </form>

      {/* 2. Filter Section */}
      <div className="card">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Search & Filter</h2>
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
            <input className="input" placeholder="Title, topic, name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Batch</label>
            <select className="input" value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)}>
              <option value="">All Batches</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Role</label>
            <select className="input" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
              <option value="">All Roles</option>
              <option value="AI/ML">AI/ML</option>
              <option value="FULLSTACK">FULLSTACK</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Date</label>
            <input className="input" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-12">
        {/* ROADMAP RENDERING */}
        {groupedRoadmapTasks.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Training Roadmaps</h3>
            {groupedRoadmapTasks.map((group, idx) => (
              <div key={`${group.batch_id}_${group.role}_${idx}`} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">
                    Batch: {batchName(group.batch_id)}
                  </span>
                  <span className="text-[10px] font-bold text-brand-600 uppercase tracking-widest bg-brand-50 px-2 py-0.5 rounded border border-brand-100">
                    Role: {group.role}
                  </span>
                </div>
                <RoadmapTaskCard 
                  tasks={group.tasks} 
                  isAdmin={true} 
                  onDelete={deleteTask} 
                  expanded={roadmapExpanded}
                  onToggle={() => setRoadmapExpanded(!roadmapExpanded)}
                  role={group.role}
                />
              </div>
            ))}
          </div>
        )}

        {/* NORMAL TASKS RENDERING */}
        <div className="space-y-6">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Tasks</h3>
          
          {filteredTasks.length === 0 ? (
            <div className="card text-center py-12 bg-slate-50 border-dashed border-2 border-slate-200">
              <p className="text-slate-500 font-medium">No tasks found for selected filters.</p>
            </div>
          ) : (
            groupedNormalTasks.map(group => (
              <div key={group.label} className="space-y-4">
                <div className="flex items-center gap-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">{group.label}</h3>
                  <div className="h-px w-full bg-slate-100"></div>
                </div>
                <div className="grid gap-4">
                  {group.tasks.map(item => (
                    <div key={item.id}>
                      {item.task_type === 'roadmap' || isRoadmapTask(item) ? (
                        <RoadmapTaskCard tasks={[item]} isAdmin={true} onDelete={deleteTask} />
                      ) : (
                        <div className="card hover:shadow-md transition-shadow border-slate-200 group">
                          {editingId === item.id ? (
                            <div className="space-y-4">
                              <input className="input" value={editingForm.title} onChange={(e) => setEditingForm({ ...editingForm, title: e.target.value })} />
                              <textarea className="input min-h-[100px]" value={editingForm.description || ''} onChange={(e) => setEditingForm({ ...editingForm, description: e.target.value })} />
                              <div className="flex justify-end gap-3">
                                <button className="btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                                <button className="btn-primary" onClick={() => saveTask(item.id)}>Save</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-4">
                              <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                  <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
                                  <div className="flex flex-wrap gap-2">
                                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider">
                                      Batch: {batchName(item.batch_id)}
                                    </span>
                                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider">
                                      Assigned To: {item.assigned_to_name || (item.assigned_to && interns.find(i => String(i.id) === String(item.assigned_to))?.name) || 'All Members'}
                                    </span>
                                    {item.due_date && (
                                      <span className="px-2 py-1 bg-amber-50 text-amber-600 border border-amber-100 rounded text-[10px] font-bold uppercase tracking-wider">
                                        Due: {item.due_date}
                                      </span>
                                    )}
                                  </div>
                                  <TaskDescription text={item.description} />
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button 
                                    className="p-2 text-slate-400 hover:text-brand-600" 
                                    onClick={() => { setEditingId(item.id); setEditingForm({ ...item }) }}
                                  >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                  </button>
                                  <button 
                                    className="p-2 text-slate-400 hover:text-rose-600" 
                                    onClick={() => deleteTask(item.id)}
                                  >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
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

      {/* OVERLAY BULK MODAL */}
      {showBulkModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setShowBulkModal(false)}
        >
          <div 
            className="card w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-0 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-black text-slate-900">Bulk Import Roadmap</h2>
              <button onClick={() => { setShowBulkModal(false); setBulkInput('') }} className="text-slate-400 hover:text-slate-600 p-2"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 text-sm text-brand-800 leading-relaxed font-medium">
                <strong>Format:</strong> Paste roadmap entries (Day, Topic, Activities, Outcome). The parser will automatically group blocks of 4 lines.
              </div>
              <textarea 
                className="input min-h-[300px] font-mono text-sm leading-relaxed" 
                placeholder="Mon May 18&#10;Topic&#10;Activities&#10;Outcome&#10;&#10;Tue May 19&#10;..." 
                value={bulkInput} 
                onChange={(e) => setBulkInput(e.target.value)} 
              />
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="label">Target Batch *</label>
                  <select className="input" value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value, tech_stack: '', assigned_to: '' })} required>
                    <option value="">Select Batch</option>
                    {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="label">Role (Tech Stack)</label>
                  <select className="input" value={form.tech_stack} onChange={(e) => setForm({ ...form, tech_stack: e.target.value, assigned_to: '' })} disabled={!form.batch_id}>
                    <option value="">All Roles</option>
                    <option value="AI/ML">AI/ML</option>
                    <option value="FULLSTACK">FULLSTACK</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="label">Assign To</label>
                  <select className="input" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} disabled={!form.batch_id}>
                    <option value="">{form.tech_stack ? `All ${form.tech_stack} interns` : 'All members'}</option>
                    {filteredInterns.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
              </div>
              {previewTasks.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Preview ({previewTasks.length} entries)</h3>
                  <RoadmapTaskCard tasks={previewTasks} />
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 sticky bottom-0 z-10">
              <button onClick={() => setShowBulkModal(false)} className="btn-ghost">Cancel</button>
              <button 
                onClick={createTask} 
                className="btn-primary px-8" 
                disabled={loading || previewTasks.length === 0 || !form.batch_id}
              >
                {loading ? 'Creating...' : `Confirm & Create ${previewTasks.length} Entries`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
