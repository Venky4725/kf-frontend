import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'

export default function InternDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState({ tasks: [], submissions: [], evaluations: [], notifications: [] })

  useEffect(() => {
    async function load() {
      if (!user?.id) return
      
      try {
        setLoading(true)
        const requests = [
          api.get('/submissions', { params: { user_id: user.id, limit: 200 } }),
          api.get('/evaluations', { params: { intern_id: user.id, limit: 200 } }),
          api.get('/notifications', { params: { user_id: user.id, limit: 200 } }),
        ]
        if (user.batch_id) {
          requests.unshift(api.get('/tasks', { params: { batch_id: user.batch_id, limit: 200 } }))
        } else {
          requests.unshift(Promise.resolve({ data: [] }))
        }

        const [tasks, submissions, evaluations, notifications] = await Promise.all(requests)
        setData({
          tasks: (tasks.data || []).filter(t => !t.description?.startsWith('[ROADMAP]')),
          submissions: submissions.data || [],
          evaluations: evaluations.data || [],
          notifications: notifications.data || [],
        })
        setError('')
      } catch (err) {
        console.error('Failed to load dashboard:', err)
        setError(err.response?.data?.detail || 'Failed to load your dashboard.')
        setData({ tasks: [], submissions: [], evaluations: [], notifications: [] })
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user])

  const latestEvaluation = useMemo(() => data.evaluations[0] || null, [data.evaluations])

  if (loading) return <div className="text-slate-500">Loading dashboard...</div>
  if (error) return <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-slate-950 text-white p-8 shadow-2xl">
        <div className="text-xs uppercase tracking-[0.25em] text-brand-200 font-semibold">Intern</div>
        <h1 className="text-4xl font-black mt-3">Welcome, {user?.name || 'User'}</h1>
        <p className="text-sm text-slate-200 mt-3 max-w-3xl">
          Track your assigned tasks, submitted updates, evaluation history, and unread notifications from one place.
        </p>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Assigned Tasks" value={data.tasks.length} />
        <Kpi label="Submitted Updates" value={data.submissions.length} />
        <Kpi label="Evaluations" value={data.evaluations.length} />
        <Kpi label="Unread Notifications" value={data.notifications.filter((item) => !item.is_read).length} />
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Upcoming Tasks</h2>
          <div className="space-y-3">
            {data.tasks.length === 0 && <div className="text-sm text-slate-500">No tasks assigned yet.</div>}
            {data.tasks.slice(0, 5).map((task) => (
              <div key={task.id} className="rounded-xl border border-slate-200 p-4">
                <div className="font-semibold text-slate-900">{task.title}</div>
                <div className="text-sm text-slate-600 mt-1">{task.description || 'No description provided.'}</div>
                <div className="text-xs text-slate-400 mt-2">Due: {task.due_date || 'Not set'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Latest Evaluation</h2>
          {!latestEvaluation ? (
            <div className="text-sm text-slate-500">No evaluations recorded yet.</div>
          ) : (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-400">Week {latestEvaluation.week_number}</div>
              <div className="text-3xl font-black text-brand-700 mt-2">{latestEvaluation.score}</div>
              <div className="text-sm text-slate-700 mt-3">{latestEvaluation.feedback || 'No written feedback yet.'}</div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function Kpi({ label, value }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">{label}</div>
      <div className="text-3xl font-black text-slate-900 mt-2">{value}</div>
    </div>
  )
}
