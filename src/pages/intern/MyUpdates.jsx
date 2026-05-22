import { useEffect, useState, useMemo } from 'react'

import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'

export default function MyUpdates() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [form, setForm] = useState({
    submitted_for: new Date().toISOString().slice(0, 10),
    content: '',
  })
  const [message, setMessage] = useState('')
  
  // New States
  const [quickFilter, setQuickFilter] = useState('TODAY')
  const [searchQuery, setSearchQuery] = useState('')

  async function load() {
    if (!user?.id) return
    
    try {
      const requests = [api.get('/submissions', { params: { user_id: user.id, limit: 500 } })]
      if (user.batch_id) {
        requests.unshift(api.get('/tasks', { params: { batch_id: user.batch_id, limit: 500 } }))
      } else {
        requests.unshift(Promise.resolve({ data: [] }))
      }
      const [taskList, submissionList] = await Promise.all(requests)
      setTasks(taskList.data || [])
      setSubmissions(submissionList.data || [])
    } catch (err) {
      console.error('Failed to load updates:', err)
      setTasks([])
      setSubmissions([])
      setMessage(err.response?.data?.detail || 'Failed to load your updates.')
    }
  }

  useEffect(() => { if (user?.id) load() }, [user])

  // Date Logic for Filters
  const dateInfo = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    const day = now.getDay()
    const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1)
    const weekStart = new Date(now)
    weekStart.setDate(diffToMonday)
    
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    return { today: now, tomorrow, weekStart, weekEnd }
  }, [])

  const filteredTasks = useMemo(() => {
    let result = [...tasks]

    // 1. Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t => 
        t.title.toLowerCase().includes(q) || 
        (t.description && t.description.toLowerCase().includes(q))
      )
    }

    // 2. Quick Date Filters
    const { today, tomorrow, weekStart, weekEnd } = dateInfo
    const todayStr = today.toISOString().split('T')[0]
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    if (quickFilter === 'TODAY') {
      result = result.filter(t => t.due_date === todayStr)
    } else if (quickFilter === 'TOMORROW') {
      result = result.filter(t => t.due_date === tomorrowStr)
    } else if (quickFilter === 'THIS_WEEK') {
      result = result.filter(t => {
        if (!t.due_date) return false
        const d = new Date(t.due_date)
        return d >= weekStart && d <= weekEnd
      })
    } else if (quickFilter === 'OVERDUE') {
      result = result.filter(t => {
        if (!t.due_date || t.status === 'COMPLETED') return false
        return new Date(t.due_date) < today
      })
    } else if (quickFilter === 'COMPLETED') {
      result = result.filter(t => t.status === 'COMPLETED')
    }

    return result
  }, [tasks, searchQuery, quickFilter, dateInfo])

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

  const counts = useMemo(() => {
    const { today, tomorrow, weekStart, weekEnd } = dateInfo
    const todayStr = today.toISOString().split('T')[0]
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    return {
      ALL: tasks.length,
      TODAY: tasks.filter(t => t.due_date === todayStr).length,
      TOMORROW: tasks.filter(t => t.due_date === tomorrowStr).length,
      THIS_WEEK: tasks.filter(t => {
        if (!t.due_date) return false
        const d = new Date(t.due_date)
        return d >= weekStart && d <= weekEnd
      }).length,
      OVERDUE: tasks.filter(t => {
        if (!t.due_date || t.status === 'COMPLETED') return false
        return new Date(t.due_date) < today
      }).length,
      COMPLETED: tasks.filter(t => t.status === 'COMPLETED').length,
    }
  }, [tasks, dateInfo])

  const quickFilters = [
    { id: 'TODAY', label: 'Today', count: counts.TODAY },
    { id: 'TOMORROW', label: 'Tomorrow', count: counts.TOMORROW },
    { id: 'THIS_WEEK', label: 'This Week', count: counts.THIS_WEEK },
    { id: 'OVERDUE', label: 'Overdue', count: counts.OVERDUE, color: 'text-rose-600' },
    { id: 'COMPLETED', label: 'Completed', count: counts.COMPLETED },
    { id: 'ALL', label: 'All Tasks', count: counts.ALL },
  ]

  async function submitUpdate(event) {
    event.preventDefault()
    if (!user?.id) {
      setMessage('User not authenticated.')
      return
    }
    
    try {
      await api.post('/submissions', {
        user_id: user.id,
        submitted_for: form.submitted_for,
        content: form.content,
      })
      setForm({ ...form, content: '' })
      setMessage('Update submitted successfully.')
      load()
    } catch (err) {
      console.error('Failed to submit update:', err)
      setMessage(err.response?.data?.detail || 'Failed to submit update.')
    }
  }

  async function deleteSubmission(id) {
    if (!window.confirm('Delete this submission?')) return
    
    try {
      await api.delete(`/submissions/${id}`)
      setMessage('Submission deleted successfully.')
      load()
    } catch (err) {
      console.error('Failed to delete submission:', err)
      if (err.response?.status === 403) {
        setMessage('Access denied.')
      } else {
        setMessage(err.response?.data?.detail || 'Failed to delete submission.')
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">My Updates</h1>
        <p className="text-sm text-slate-500 mt-2">Submit your daily progress and review the tasks assigned to your batch.</p>
      </div>

      {/* Quick Filters */}
      <div className="flex flex-wrap gap-2">
        {quickFilters.map((f) => (
          <button
            key={f.id}
            onClick={() => setQuickFilter(f.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
              quickFilter === f.id
                ? 'bg-brand-600 text-white border-brand-600 shadow-md scale-105'
                : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:bg-brand-50'
            }`}
          >
            <span className={f.color || ''}>{f.label}</span>
            <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] ${
              quickFilter === f.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
            }`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="mb-6">
          <label className="block text-sm font-bold text-slate-700 mb-2">Search Tasks</label>
          <div className="relative">
            <input
              className="input pl-9"
              placeholder="Search by title or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <svg className="absolute left-3 top-2.5 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
        </div>

        <h2 className="text-lg font-semibold mb-4">Assigned Tasks</h2>
        <div className="space-y-8">
          {groupedTasks.length === 0 ? (
            <div className="text-sm text-slate-500 italic py-4">No tasks found for this filter.</div>
          ) : (
            groupedTasks.map((group) => (
              <div key={group.label} className="space-y-4">
                <div className="flex items-center gap-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">{group.label}</h3>
                  <div className="h-px w-full bg-slate-100"></div>
                </div>
                <div className="space-y-3">
                  {group.tasks.map((task) => (
                    <div key={task.id} className="rounded-xl border border-slate-200 p-4 hover:border-brand-300 transition-colors bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          task.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {(task.status || 'PENDING').replace('_', ' ')}
                        </span>
                      </div>
                      <div className="font-semibold text-slate-900">{task.title}</div>
                      <div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{task.description || 'No description provided.'}</div>
                      <div className="flex items-center gap-2 mt-3 text-xs text-slate-400">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        Due: {task.due_date || 'Not set'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <form onSubmit={submitUpdate} className="card space-y-4">
        <h2 className="text-lg font-semibold">Submit Daily Update</h2>
        <input className="input max-w-xs" type="date" value={form.submitted_for} onChange={(e) => setForm({ ...form, submitted_for: e.target.value })} required />
        <textarea className="input" rows="5" placeholder="What did you work on today?" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
        {message && <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded p-3">{message}</div>}
        <button className="btn-primary" type="submit">Submit Update</button>
      </form>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Previous Updates</h2>
        <div className="space-y-3">
          {submissions.length === 0 && <div className="text-sm text-slate-500">No updates submitted yet.</div>}
          {submissions.map((submission) => (
            <div key={submission.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="text-xs text-slate-400">{submission.submitted_for}</div>
                  <div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{submission.content}</div>
                </div>
                <button
                  onClick={() => deleteSubmission(submission.id)}
                  className="px-3 py-1.5 text-sm font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-all duration-200"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
