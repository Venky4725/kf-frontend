import { useEffect, useState } from 'react'

import api from '../../lib/api'

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        // Consolidate API calls - fetch profiles once instead of three times
        const [batches, tasks, submissions, evaluations, notifications, profiles] = await Promise.all([
          api.get('/batches', { params: { limit: 500 } }),
          api.get('/tasks', { params: { limit: 500 } }),
          api.get('/submissions', { params: { limit: 500 } }),
          api.get('/evaluations', { params: { limit: 500 } }),
          api.get('/notifications', { params: { limit: 500 } }),
          api.get('/profiles', { params: { limit: 500 } }),
        ])

        const allProfiles = profiles.data || []
        
        // Filter active users from the single profiles list
        const activeInterns = allProfiles.filter(p => p.role === 'INTERN' && p.is_active !== false)
        const activeTLs = allProfiles.filter(p => p.role === 'TECHNICAL_LEAD' && p.is_active !== false)
        
        const batchMap = Object.fromEntries(batches.data.map((batch) => [batch.id, batch]))
        const profileMap = Object.fromEntries(allProfiles.map((profile) => [profile.id, profile]))
        
        // Get recent submissions (sorted by date, most recent first)
        const recentSubmissionsList = (submissions.data || [])
          .sort((a, b) => new Date(b.submitted_for) - new Date(a.submitted_for))
          .slice(0, 5)

        setSummary({
          internCount: activeInterns.length,
          tlCount: activeTLs.length,
          batchCount: batches.data?.length || 0,
          taskCount: tasks.data?.length || 0,
          submissionCount: submissions.data?.length || 0,
          evaluationCount: evaluations.data?.length || 0,
          notificationCount: notifications.data?.length || 0,
          recentSubmissions: recentSubmissionsList,
          internsByBatch: activeInterns.reduce((acc, intern) => {
            const batchName = batchMap[intern.batch_id]?.name || 'Unassigned'
            acc[batchName] = (acc[batchName] || 0) + 1
            return acc
          }, {}),
          recentEvaluations: (evaluations.data || []).slice(0, 5),
          profileMap,
          batchMap,
        })
        setError('')
      } catch (err) {
        console.error('❌ Admin Dashboard Load Error:', err)
        setError(err.response?.data?.detail || 'Failed to load admin dashboard.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) return <div className="text-slate-500">Loading dashboard...</div>
  if (error) return <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-slate-950 text-white p-8 shadow-2xl">
        <div className="text-xs uppercase tracking-[0.25em] text-brand-200 font-semibold">Administrator</div>
        <h1 className="text-4xl font-black mt-3">Knowledge Factory Control Center</h1>
        <p className="text-sm text-slate-200 mt-3 max-w-3xl">
          Real-time view of the MVP backend across profiles, batches, tasks, attendance-linked submissions,
          evaluations, and notifications.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a
          href="/admin/tls"
          className="card hover:shadow-lg transition-shadow cursor-pointer bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-200"
        >
          <div className="text-sm font-semibold text-cyan-900">Technical Leads</div>
          <div className="text-xs text-cyan-700 mt-1">Manage TL profiles</div>
        </a>
        <a
          href="/admin/interns"
          className="card hover:shadow-lg transition-shadow cursor-pointer bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200"
        >
          <div className="text-sm font-semibold text-blue-900">Interns</div>
          <div className="text-xs text-blue-700 mt-1">Manage intern profiles</div>
        </a>
        <a
          href="/admin/archive"
          className="card hover:shadow-lg transition-shadow cursor-pointer bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200"
        >
          <div className="text-sm font-semibold text-slate-900">User Archive</div>
          <div className="text-xs text-slate-700 mt-1">View inactive users</div>
        </a>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Interns" value={summary.internCount} />
        <Kpi label="Technical Leads" value={summary.tlCount} />
        <Kpi label="Batches" value={summary.batchCount} />
        <Kpi label="Tasks" value={summary.taskCount} />
        <Kpi label="Submissions" value={summary.submissionCount} />
        <Kpi label="Evaluations" value={summary.evaluationCount} />
        <Kpi label="Notifications" value={summary.notificationCount} />
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Intern Distribution by Batch</h2>
          <div className="space-y-3">
            {Object.entries(summary.internsByBatch).length === 0 && (
              <div className="text-sm text-slate-500">No intern profiles found.</div>
            )}
            {Object.entries(summary.internsByBatch).map(([name, count]) => (
              <div key={name} className="flex items-center justify-between">
                <span className="text-sm text-slate-700">{name}</span>
                <span className="text-sm font-semibold text-brand-700">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Recent Submission Activity</h2>
          <div className="space-y-3">
            {summary.recentSubmissions.length === 0 && (
              <div className="text-sm text-slate-500">No submissions yet.</div>
            )}
            {summary.recentSubmissions.map((submission) => {
              const internProfile = summary.profileMap[submission.intern_id]
              const batchName = submission.batch_name ?? summary.batchMap[submission.batch_id]?.name ?? 'N/A'
              const internName = internProfile?.name ?? submission.intern_name ?? 'Unknown'
              
              return (
                <div key={submission.id} className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 last:border-b-0">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{batchName}</p>
                    <p className="text-sm text-slate-600">{internName}</p>
                    <p className="text-xs text-slate-400 mt-1">{submission.submitted_for}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Recent Evaluations</h2>
        {summary.recentEvaluations.length === 0 ? (
          <div className="text-sm text-slate-500">No evaluations recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Batch</th>
                  <th className="th">Intern Name</th>
                  <th className="th">Week</th>
                  <th className="th">Score</th>
                  <th className="th">Feedback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.recentEvaluations.map((item) => {
                  const profile = summary.profileMap[item.intern_id]
                  const batchName = summary.batchMap[profile?.batch_id]?.name ?? 'N/A'
                  const internName = profile?.name || item.intern_id
                  return (
                    <tr key={item.id}>
                      <td className="td">{batchName}</td>
                      <td className="td">{internName}</td>
                      <td className="td">{item.week_number}</td>
                      <td className="td font-semibold">{item.score}</td>
                      <td className="td">{item.feedback || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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
