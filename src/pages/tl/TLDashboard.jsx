import { useEffect, useState } from 'react'

import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'

export default function TLDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    async function load() {
      const userId = user?.id
      if (!userId) return
      
      try {
        setLoading(true)
        // Backend now filters batches for Tech Lead automatically
        const [batches, interns, submissions, evaluations] = await Promise.all([
          api.get('/batches', { params: { limit: 500 } }),
          api.get('/profiles', { params: { role: 'INTERN', limit: 500 } }),
          api.get('/submissions', { params: { limit: 500 } }),
          api.get('/evaluations', { params: { reviewed_by: userId, limit: 500 } }),
        ])

        const tlBatchIds = new Set((batches.data || []).map((batch) => batch.id))
        const tlInterns = (interns.data || []).filter((intern) => tlBatchIds.has(intern.batch_id))
        const tlInternIds = new Set(tlInterns.map((intern) => intern.id))
        const tlSubmissions = (submissions.data || []).filter((item) => tlInternIds.has(item.user_id))

        setSummary({
          batchCount: (batches.data || []).length,
          internCount: tlInterns.length,
          submissionCount: tlSubmissions.length,
          evaluationCount: (evaluations.data || []).length,
          batches: batches.data || [],
          recentSubmissions: tlSubmissions.slice(0, 5),
          recentEvaluations: (evaluations.data || []).slice(0, 5),
        })
        setError('')
      } catch (err) {
        console.error('Failed to load TL dashboard:', err)
        setError(err.response?.data?.detail || 'Failed to load technical lead dashboard.')
        setSummary(null)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user?.id])

  if (loading) return <div className="text-slate-500">Loading dashboard...</div>
  if (error) return <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>
  if (!summary) return <div className="text-slate-500">No data available.</div>

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-slate-950 text-white p-8 shadow-2xl">
        <div className="text-xs uppercase tracking-[0.25em] text-brand-200 font-semibold">Technical Lead</div>
        <h1 className="text-4xl font-black mt-3">Team Performance Hub</h1>
        <p className="text-sm text-slate-200 mt-3 max-w-3xl">
          Review the batches assigned to you, track intern activity, and keep weekly evaluations current.
        </p>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Assigned Batches" value={summary.batchCount} />
        <Kpi label="Interns" value={summary.internCount} />
        <Kpi label="Submissions" value={summary.submissionCount} />
        <Kpi label="Evaluations" value={summary.evaluationCount} />
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Assigned Batches</h2>
          <div className="space-y-3">
            {summary.batches.length === 0 && (
              <div className="text-sm text-slate-500">No batches are assigned to you yet.</div>
            )}
            {summary.batches.map((batch) => (
              <div key={batch.id} className="rounded-xl border border-slate-200 p-4">
                <div className="font-semibold text-slate-900">{batch.name}</div>
                <div className="text-sm text-slate-500 mt-1">{batch.tech_stack}</div>
                <div className="text-xs text-slate-400 mt-2">Starts on {batch.start_date}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Recent Submissions</h2>
          <div className="space-y-3">
            {summary.recentSubmissions.length === 0 && (
              <div className="text-sm text-slate-500">No intern submissions yet.</div>
            )}
            {summary.recentSubmissions.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs text-slate-400">{item.submitted_for}</div>
                <div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{item.content}</div>
              </div>
            ))}
          </div>
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
