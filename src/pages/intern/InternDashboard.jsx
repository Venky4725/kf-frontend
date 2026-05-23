import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'

export default function InternDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Independent data states
  const [counts, setCounts] = useState(null)
  const [data, setData] = useState({ tasks: [], submissions: [], evaluations: [] })
  
  const [countsLoading, setCountsLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    
    async function loadDashboard() {
      const userId = user?.id
      if (!userId) return
      
      console.time('🚀 Intern Dashboard Total Load')
      setLoading(true)
      
      try {
        const statsPromises = [
          // 1. Specialized Counts for Intern (user_id scoped by backend)
          api.get('/dashboard/stats/counts', { signal: controller.signal })
            .then(res => { setCounts(res.data); setCountsLoading(false) })
            .catch(err => console.error('Intern Counts error:', err)),

          // 2. Main data lists
          api.get('/submissions', { params: { user_id: userId, limit: 5 }, signal: controller.signal }),
          api.get('/evaluations', { params: { intern_id: userId, limit: 5 }, signal: controller.signal }),
        ]
        
        if (user.batch_id) {
          statsPromises.push(api.get('/tasks', { params: { batch_id: user.batch_id, limit: 5 }, signal: controller.signal }))
        } else {
          statsPromises.push(Promise.resolve({ data: [] }))
        }

        const results = await Promise.allSettled(statsPromises)
        
        // Process data results
        const submissionsRes = results[1].status === 'fulfilled' ? results[1].value : { data: [] }
        const evaluationsRes = results[2].status === 'fulfilled' ? results[2].value : { data: [] }
        const tasksRes = results[3].status === 'fulfilled' ? results[3].value : { data: [] }

        setData({
          tasks: (tasksRes.data || []).filter(t => !t.description?.startsWith('[ROADMAP]')),
          submissions: submissionsRes.data || [],
          evaluations: evaluationsRes.data || [],
        })
        
        setDataLoading(false)
        setError('')
      } catch (err) {
        if (err.name !== 'CanceledError') {
          console.error('Failed to load intern dashboard:', err)
          setError(err.response?.data?.detail || 'Failed to load your dashboard.')
        }
      } finally {
        setLoading(false)
        console.timeEnd('🚀 Intern Dashboard Total Load')
      }
    }

    loadDashboard()
    return () => controller.abort()
  }, [user?.id, user?.batch_id])

  const latestEvaluation = useMemo(() => data.evaluations[0] || null, [data.evaluations])

  if (error) return <div className="card border border-rose-200 bg-rose-50 text-rose-700 m-6">{error}</div>

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-slate-950 text-white p-8 shadow-2xl">
        <div className="text-xs uppercase tracking-[0.25em] text-brand-200 font-semibold">Intern</div>
        <h1 className="text-4xl font-black mt-3">Welcome, {user?.name || 'User'}</h1>
        <p className="text-sm text-slate-200 mt-3 max-w-3xl">
          Track your assigned tasks, submitted updates, and evaluation history from one place.
        </p>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Assigned Tasks" value={counts?.tasks} loading={countsLoading} />
        <Kpi label="Submitted Updates" value={counts?.submissions} loading={countsLoading} />
        <Kpi label="Evaluations" value={counts?.evaluations} loading={countsLoading} />
        <Kpi label="Unread Alerts" value={counts?.unread_notifications} loading={countsLoading} />
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Upcoming Tasks</h2>
          <div className="space-y-3">
            {dataLoading ? <Skeleton h="200px" /> : (
              <>
                {data.tasks.length === 0 && <div className="text-sm text-slate-500">No tasks assigned yet.</div>}
                {data.tasks.map((task) => (
                  <div key={task.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="font-semibold text-slate-900">{task.title}</div>
                    <div className="text-sm text-slate-600 mt-1 truncate">{task.description || 'No description provided.'}</div>
                    <div className="text-xs text-slate-400 mt-2">Due: {task.due_date || 'Not set'}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Latest Evaluation</h2>
          {dataLoading ? <Skeleton h="150px" /> : (
            !latestEvaluation ? (
              <div className="text-sm text-slate-500">No evaluations recorded yet.</div>
            ) : (
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs text-slate-400">Week {latestEvaluation.week_number}</div>
                <div className="text-3xl font-black text-brand-700 mt-2">{latestEvaluation.score}</div>
                <div className="text-sm text-slate-700 mt-3 line-clamp-3">{latestEvaluation.feedback || 'No written feedback yet.'}</div>
              </div>
            )
          )}
        </div>
      </section>
    </div>
  )
}

function Kpi({ label, value, loading }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">{label}</div>
      {loading ? (
        <div className="h-8 w-12 bg-slate-100 animate-pulse rounded mt-2"></div>
      ) : (
        <div className="text-3xl font-black text-slate-900 mt-2">{value ?? 0}</div>
      )}
    </div>
  )
}

function Skeleton({ h }) {
  return <div className="bg-slate-100 animate-pulse rounded-xl w-full" style={{ height: h }}></div>
}

