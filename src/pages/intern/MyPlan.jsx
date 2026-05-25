import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'
import WeeklyPlanViewer from '../../components/WeeklyPlanViewer'
import RoadmapTaskCard, { isRoadmapTask } from '../../components/RoadmapTaskCard'

const normalizeRole = (role = "") => 
  (role || "").toLowerCase().replace(/[^a-z]/g, "");

const DAY_NAMES = ['', 'Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6']

function TaskList({ tasks, userRole }) {
  const filteredTasks = useMemo(() => {
    if (!tasks) return []
    return tasks.filter(t => {
      // THE USER SAYS: USE task.role AS PRIMARY SOURCE
      const taskRole = t.role || t.tech_stack
      
      // If task has no role assigned OR is explicitly GENERAL, it's for everyone in the batch
      if (!taskRole || normalizeRole(taskRole) === "general") return true
      
      // Otherwise, must match intern's tech_stack
      return normalizeRole(taskRole) === normalizeRole(userRole)
    })
  }, [tasks, userRole])

  if (filteredTasks.length === 0) {
    return (
      <div className="text-xs text-slate-500 italic bg-slate-50 rounded p-3 border border-dashed border-slate-200">
        No daily tasks have been added for your track this week yet. Check back soon or ask your TL.
      </div>
    )
  }

  const { normalTasks, roadmapTasks } = filteredTasks.reduce((acc, t) => {
    if (t.task_type === 'roadmap' || isRoadmapTask(t)) {
      acc.roadmapTasks.push(t)
    } else {
      acc.normalTasks.push(t)
    }
    return acc
  }, { normalTasks: [], roadmapTasks: [] })

  // Group normal tasks by day_index
  const byDay = {}
  for (const t of normalTasks) {
    const k = t.day_index || 'unscheduled'
    if (!byDay[k]) byDay[k] = []
    byDay[k].push(t)
  }
  const orderedKeys = Object.keys(byDay).sort((a, b) => {
    if (a === 'unscheduled') return 1
    if (b === 'unscheduled') return -1
    return Number(a) - Number(b)
  })

  return (
    <div className="space-y-6">
      {roadmapTasks.length > 0 && (
        <div className="mb-4">
          <RoadmapTaskCard tasks={roadmapTasks} role={userRole} />
        </div>
      )}

      {orderedKeys.map(k => (
        <div key={k}>
          <div className="text-xs uppercase tracking-wider font-bold text-brand-700 mb-2">
            {k === 'unscheduled' ? 'Other tasks' : (DAY_NAMES[k] || `Day ${k}`)}
          </div>
          <ul className="space-y-2">
            {byDay[k].map(t => (
              <li key={t.id} className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="mt-0.5 text-brand-600">▸</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{t.title}</div>
                  {t.description && (
                    <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{t.description}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function MyPlan() {
  const { user } = useAuth()
  const [plan, setPlan] = useState(null)
  const [allPlans, setAllPlans] = useState([])
  const [projects, setProjects] = useState([])
  const [showUpload, setShowUpload] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', project_url: '', kind: 'WEEKLY_WORK' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [expanded, setExpanded] = useState({})  // { [planId]: true }

  async function load() {
    try {
      const [c, p, pr] = await Promise.all([
        api.get('/plans/current').catch(() => ({ data: null })),
        api.get('/plans'),
        api.get('/projects'),
      ])
      setPlan(c.data)
      setAllPlans(p.data)
      setProjects(pr.data)
    } catch (e) {
      console.error(e)
    }
  }
  useEffect(() => { load() }, [])

  async function submit(e) {
    e.preventDefault()
    if (!plan) {
      setMsg('No active plan yet — wait for the internship to start.')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const fd = new FormData()
      fd.append('week_number', plan.week_number)
      fd.append('title', form.title)
      if (form.description) fd.append('description', form.description)
      if (form.project_url) fd.append('project_url', form.project_url)
      fd.append('kind', form.kind)
      if (file) fd.append('file', file)

      await api.post('/projects', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setMsg('Submitted.')
      setForm({ title: '', description: '', project_url: '', kind: 'WEEKLY_WORK' })
      setFile(null)
      setShowUpload(false)
      load()
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const thisWeekProjects = plan
    ? projects.filter((p) => p.week_number === plan.week_number)
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Plan</h1>
        <p className="text-sm text-slate-500 mt-1">Your curriculum and work submissions for the current week.</p>
      </div>

      {/* Current week plan */}
      {plan ? (
        <div className="card">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="badge-blue">Week {plan.week_number}</span>
                <span className="badge-slate">{plan.tech_stack}</span>
              </div>
              <h2 className="font-semibold text-lg text-slate-900">{plan.title}</h2>
              {plan.description && <p className="text-sm text-slate-500 mt-1">{plan.description}</p>}
            </div>
            <button className="btn-primary" onClick={() => setShowUpload(!showUpload)}>
              {showUpload ? 'Cancel' : '+ Submit Work'}
            </button>
          </div>

          <div className="mt-5">
            {plan.daily_plan && plan.daily_plan.length > 0 ? (
              <div className="mb-6">
                <WeeklyPlanViewer planData={plan.daily_plan} weekTitle={`Week ${plan.week_number} Plan`} />
              </div>
            ) : null}
            <div className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-3">
              📋 Daily Tasks ({plan.tasks?.length || 0})
            </div>
            <TaskList tasks={plan.tasks} userRole={user?.tech_stack} />
          </div>
        </div>
      ) : (
        <div className="card text-center py-8">
          <div className="text-3xl mb-2">📅</div>
          <div className="font-medium text-slate-700">No active plan yet</div>
          <div className="text-sm text-slate-500 mt-1">
            Either the internship hasn't started or no plan has been published for your stack this week.
          </div>
        </div>
      )}

      {/* Upload form */}
      {showUpload && plan && (
        <form onSubmit={submit} className="card max-w-2xl space-y-4">
          <h3 className="font-semibold text-slate-800">Submit work proof for Week {plan.week_number}</h3>
          <div>
            <label className="label">Title *</label>
            <input className="input" required value={form.title}
                   onChange={(e) => setForm({ ...form, title: e.target.value })}
                   placeholder="e.g. Todo App with React Hooks" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows="3" value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="What did you build? What did you learn?" />
          </div>
          <div>
            <label className="label">Project URL (GitHub / deployed link)</label>
            <input type="url" className="input" value={form.project_url}
                   onChange={(e) => setForm({ ...form, project_url: e.target.value })}
                   placeholder="https://github.com/..." />
          </div>
          <div>
            <label className="label">File upload (optional)</label>
            <input type="file" className="text-sm" onChange={(e) => setFile(e.target.files[0])} />
            {file && <div className="text-xs text-slate-500 mt-1">{file.name} ({Math.round(file.size / 1024)} KB)</div>}
          </div>
          {msg && <div className="text-sm bg-slate-50 border border-slate-200 rounded p-2">{msg}</div>}
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Uploading…' : 'Submit'}
          </button>
        </form>
      )}

      {/* Submissions for this week */}
      {plan && (
        <div className="card">
          <h3 className="font-semibold mb-3 text-slate-800">My submissions this week</h3>
          {thisWeekProjects.length === 0 ? (
            <div className="text-sm text-slate-500 italic">Nothing submitted yet.</div>
          ) : (
            <ul className="space-y-3">
              {thisWeekProjects.map((p) => (
                <li key={p.id} className="border-l-2 border-emerald-300 pl-3 py-1">
                  <div className="font-medium text-slate-900">{p.title}</div>
                  {p.description && <div className="text-sm text-slate-600 mt-1">{p.description}</div>}
                  <div className="flex gap-3 mt-2 text-xs">
                    {p.project_url && (
                      <a href={p.project_url} target="_blank" rel="noopener noreferrer"
                         className="text-brand-600 hover:underline">🔗 Project link</a>
                    )}
                    {p.file_path && (
                      <a href={`/api/projects/${p.id}/file`} target="_blank" rel="noopener noreferrer"
                         className="text-brand-600 hover:underline">📎 Download file</a>
                    )}
                    <span className="text-slate-500">{new Date(p.created_at).toLocaleString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* All weekly plans (for reference) — every week is expandable */}
      {allPlans.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3 text-slate-800">All weeks</h3>
          <div className="space-y-3">
            {[...allPlans]
              .filter((p) => !plan || p.week_number !== plan.week_number)
              .sort((a, b) => a.week_number - b.week_number)
              .map((p) => {
                const isOpen = !!expanded[p.id]
                return (
                  <div key={p.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpanded({ ...expanded, [p.id]: !isOpen })}
                      className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 text-left transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="badge-slate">Week {p.week_number}</span>
                        <span className="text-sm font-semibold text-slate-800 truncate">{p.title}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-slate-500">{p.tasks?.length || 0} tasks</span>
                        <span className={`text-slate-400 text-sm transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="p-4 bg-white border-t border-slate-200">
                        {p.description && (
                          <p className="text-sm text-slate-600 mb-3">{p.description}</p>
                        )}
                        <TaskList tasks={p.tasks} userRole={user?.tech_stack} />
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
