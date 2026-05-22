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

    // 1. Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t => 
        t.title.toLowerCase().includes(q) || 
        (t.description && t.description.toLowerCase().includes(q))
      )
    }

    return result
  }, [tasks, searchQuery])

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
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">Weekly Training Roadmap</h3>
          <div className="h-px w-full bg-slate-200"></div>
          <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{tasks.length}</span>
        </div>
        
        <div className="card p-0 overflow-hidden border-slate-200 shadow-sm bg-white">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-32">Day</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-64">Topic / Theme</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Key Activities & Exercises</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-48">Daily Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((task) => {
                  const parts = task.description.replace('[ROADMAP]', '').split('$$$')
                  const activities = parts[0] || ''
                  const outcome = parts[1] || ''
                  const dayRaw = parts[2] || task.due_date || 'N/A'

                  return (
                    <tr key={task.id} className="hover:bg-slate-50/50 transition-colors">
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

        <div className="space-y-12">
          {/* Roadmap View */}
          <RoadmapTable tasks={roadmapTasks} />

          {/* Normal Tasks View */}
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">Assigned Tasks</h3>
              <div className="h-px w-full bg-slate-100"></div>
            </div>
            
            {groupedNormalTasks.length === 0 ? (
              <div className="text-sm text-slate-500 italic py-4">No normal tasks found for this filter.</div>
            ) : (
              groupedNormalTasks.map((group) => (
                <div key={group.label} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">{group.label}</h3>
                    <div className="h-px w-full bg-slate-50"></div>
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
