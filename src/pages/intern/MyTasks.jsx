import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'
import RoadmapTaskCard, { isRoadmapTask } from '../../components/RoadmapTaskCard'

const normalizeRole = (role = "") => 
  (role || "").toLowerCase().replace(/[^a-z]/g, "");

export default function MyTasks() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [roadmapExpanded, setRoadmapExpanded] = useState(false)

  const loadTasks = useCallback(async () => {
    if (!user?.batch_id) {
      setLoading(false)
      return
    }
    
    try {
      setLoading(true)
      const res = await api.get('/tasks', { params: { batch_id: user.batch_id, limit: 1000 } })
      setTasks(res.data || [])
      setError('')
    } catch (err) {
      console.error('Failed to load tasks:', err)
      setError(err.response?.data?.detail || 'Failed to load assigned tasks.')
    } finally {
      setLoading(false)
    }
  }, [user?.batch_id])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const filteredTasks = useMemo(() => {
    let result = tasks.filter(t => {
      // THE USER SAYS: USE task.role AS PRIMARY SOURCE
      const taskRole = t.role || t.tech_stack
      
      // If task has no role assigned OR is explicitly GENERAL, it's for everyone in the batch
      if (!taskRole || normalizeRole(taskRole) === "general") return true
      
      // Otherwise, must match intern's tech_stack
      return normalizeRole(taskRole) === normalizeRole(user?.tech_stack)
    })

    // 1. Search Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t => 
        t.title.toLowerCase().includes(q) || 
        (t.description && t.description.toLowerCase().includes(q))
      )
    }

    // 2. Date Filter
    if (dateFilter) {
      result = result.filter(t => {
        if (t.task_type === 'roadmap' || isRoadmapTask(t)) {
          return (t.roadmap_entries || []).some(e => {
            if (!e.day) return false
            try {
              return new Date(e.day).toISOString().split('T')[0] === dateFilter
            } catch { return false }
          })
        }
        return t.due_date === dateFilter
      })
    }

    return result
  }, [tasks, searchQuery, dateFilter, user?.tech_stack])

  const { roadmapTasks, normalTasks } = useMemo(() => {
    const roadmap = []
    const normal = []
    
    filteredTasks.forEach(t => {
      if (t.task_type === 'roadmap' || isRoadmapTask(t)) {
        roadmap.push(t)
      } else {
        normal.push(t)
      }
    })
    
    return { roadmapTasks: roadmap, normalTasks: normal }
  }, [filteredTasks])

  const groupedRoadmapTasks = useMemo(() => {
    const groups = {}
    roadmapTasks.forEach(task => {
      const rawRole = task.role || task.tech_stack
      const norm = normalizeRole(rawRole)
      // Display role logic: if empty or general, show GENERAL. Otherwise use cleaned up original or uppercase
      let displayRole = "GENERAL"
      if (norm && norm !== "general") {
        displayRole = rawRole?.trim()?.toUpperCase() || "UNSPECIFIED"
      }

      const key = `${task.batch_id}_${norm}`
      
      if (!groups[key]) {
        groups[key] = {
          batch_id: task.batch_id,
          role: displayRole,
          tasks: []
        }
      }
      groups[key].tasks.push(task)
    })
    return Object.values(groups)
  }, [roadmapTasks])

  const groupedNormalTasks = useMemo(() => {
    const groups = {}
    normalTasks.forEach(task => {
      let label = 'Other Tasks'
      if (task.due_date) {
        const d = new Date(task.due_date)
        label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      }
      if (!groups[label]) groups[label] = []
      groups[label].push(task)
    })

    return Object.keys(groups).sort((a, b) => {
      if (a === 'Other Tasks') return 1
      if (b === 'Other Tasks') return -1
      return new Date(a).getTime() - new Date(b).getTime()
    }).map(label => ({ label, tasks: groups[label] }))
  }, [normalTasks])

  if (error) return <div className="card border border-rose-200 bg-rose-50 text-rose-700 m-6">{error}</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">My Tasks</h1>
        <p className="text-sm text-slate-500 mt-2">Track your learning roadmap and daily assignments.</p>
      </div>

      {/* Filter Section */}
      <div className="card">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
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
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Filter by Date</label>
            <input 
              type="date" 
              className="input" 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-12">
        {loading ? (
          <div className="space-y-4">
            <Skeleton h="100px" />
            <Skeleton h="200px" />
          </div>
        ) : (
          <>
            {/* Roadmap Tasks */}
            {groupedRoadmapTasks.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">Training Roadmap</h3>
                  <div className="h-px w-full bg-slate-200"></div>
                </div>
                {groupedRoadmapTasks.map((group, idx) => (
                  <RoadmapTaskCard 
                    key={`${group.batch_id}_${group.role}_${idx}`}
                    tasks={group.tasks} 
                    role={group.role}
                    expanded={roadmapExpanded}
                    onToggle={() => setRoadmapExpanded(!roadmapExpanded)}
                  />
                ))}
              </div>
            )}

            {/* Normal Tasks */}
            <div className="space-y-8">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">Assignments</h3>
                <div className="h-px w-full bg-slate-200"></div>
              </div>

              {normalTasks.length === 0 && roadmapTasks.length === 0 ? (
                <div className="card text-center py-12 bg-slate-50 border-dashed border-2 border-slate-200">
                  <p className="text-slate-500 font-medium">No tasks assigned yet.</p>
                </div>
              ) : normalTasks.length === 0 ? (
                <div className="text-sm text-slate-500 italic">No specific assignments found for this filter.</div>
              ) : (
                groupedNormalTasks.map(group => (
                  <div key={group.label} className="space-y-4">
                    <div className="flex items-center gap-4">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">{group.label}</h3>
                      <div className="h-px w-full bg-slate-50"></div>
                    </div>
                    <div className="grid gap-4">
                      {group.tasks.map(task => (
                        <div key={task.id} className="card hover:shadow-md transition-shadow border-slate-200 bg-white">
                          <div className="font-bold text-slate-900 text-lg">{task.title}</div>
                          {task.description && (
                            <div className="text-sm text-slate-600 mt-2 whitespace-pre-wrap leading-relaxed">
                              {task.description}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            Due: {task.due_date || 'Flexible'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Skeleton({ h }) {
  return <div className="bg-slate-100 animate-pulse rounded-xl w-full" style={{ height: h }}></div>
}
