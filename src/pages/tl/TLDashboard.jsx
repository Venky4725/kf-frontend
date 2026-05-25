import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'
import { onEvent, EVENTS } from '../../utils/events'

export default function TLDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Independent states
  const [counts, setCounts] = useState(null)
  const [summary, setSummary] = useState({ batches: [], recentSubmissions: [], recentEvaluations: [] })
  
  const [countsLoading, setCountsLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(true)

  const loadDashboard = useCallback(async (signal) => {
    const userId = user?.id
    if (!userId) return

    console.time('🚀 TL Dashboard Total Load')
    setLoading(true)
    setCountsLoading(true)
    
    try {
      const statsPromises = [
        // 1. Specialized Counts for TL (scoped by backend automatically)
        api.get('/dashboard/stats/counts', { signal })
          .then(res => { setCounts(res.data) })
          .catch(err => console.error('TL Counts error:', err))
          .finally(() => setCountsLoading(false)),

        // 2. Main lists
        api.get('/batches', { params: { limit: 500 }, signal }),
        api.get('/profiles', { params: { role: 'INTERN', limit: 500 }, signal }),
        api.get('/submissions', { params: { limit: 10 }, signal }),
        api.get('/evaluations', { params: { reviewed_by: userId, limit: 10 }, signal }),
      ]

      const results = await Promise.allSettled(statsPromises)
      
      // Process data results
      const batchesRes = results[1].status === 'fulfilled' ? results[1].value : { data: [] }
      const internsRes = results[2].status === 'fulfilled' ? results[2].value : { data: [] }
      const submissionsRes = results[3].status === 'fulfilled' ? results[3].value : { data: [] }
      const evaluationsRes = results[4].status === 'fulfilled' ? results[4].value : { data: [] }

      // Filter submissions for TL batches if not done by backend
      const tlBatchIds = new Set((batchesRes.data || []).map((b) => b.id))
      const tlInternIds = new Set((internsRes.data || []).filter(i => tlBatchIds.has(i.batch_id)).map(i => i.id))
      const tlSubmissions = (submissionsRes.data || []).filter(s => tlInternIds.has(s.user_id))
      const tlEvaluations = evaluationsRes.data || []

      setSummary({
        batches: batchesRes.data || [],
        recentSubmissions: tlSubmissions,
        recentEvaluations: tlEvaluations,
        profileMap: Object.fromEntries((internsRes.data || []).map(i => [i.id, i]))
      })
      
      setDataLoading(false)
      setError('')
    } catch (err) {
      if (err?.name !== 'CanceledError') {
        console.error('Failed to load TL dashboard:', err)
        setError(err.response?.data?.detail || 'Failed to load technical lead dashboard.')
      }
    } finally {
      setLoading(false)
      console.timeEnd('🚀 TL Dashboard Total Load')
    }
  }, [user?.id])

  useEffect(() => {
    const controller = new AbortController()
    loadDashboard(controller.signal)
    return () => controller.abort()
  }, [loadDashboard])

  // Listen for updates from other pages
  useEffect(() => {
    const refresh = () => loadDashboard()
    
    const cleanups = [
      onEvent(EVENTS.BATCH_UPDATED, refresh),
      onEvent(EVENTS.TL_UPDATED, refresh),
      onEvent(EVENTS.INTERN_UPDATED, refresh),
      onEvent(EVENTS.TASK_UPDATED, refresh),
      onEvent(EVENTS.EVALUATION_UPDATED, refresh),
    ]
    
    return () => cleanups.forEach(fn => fn())
  }, [loadDashboard])

  // Recent Submissions limited to 3 and sorted LIFO
  const sortedSubmissions = useMemo(() => {
    return [...summary.recentSubmissions]
      .sort((a, b) => new Date(b.submitted_at || b.created_at || 0) - new Date(a.submitted_at || a.created_at || 0))
      .slice(0, 3)
  }, [summary.recentSubmissions])

  // Recent Evaluations limited to 3 and sorted LIFO
  const sortedEvaluations = useMemo(() => {
    return [...summary.recentEvaluations]
      .sort((a, b) => new Date(b.created_at || b.submitted_at || 0) - new Date(a.created_at || a.submitted_at || 0))
      .slice(0, 3)
  }, [summary.recentEvaluations])

  if (error) return <div className="card border border-rose-200 bg-rose-50 text-rose-700 m-6">{error}</div>

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-slate-950 text-white p-8 shadow-2xl">
        <div className="text-xs uppercase tracking-[0.25em] text-brand-200 font-semibold">Technical Lead</div>
        <h1 className="text-4xl font-black mt-3">Team Performance Hub</h1>
        <p className="text-sm text-slate-200 mt-3 max-w-3xl">
          Review the batches assigned to you, track intern activity, and keep evaluations current.
        </p>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Assigned Batches" value={counts?.batches} loading={countsLoading} />
        <Kpi label="Interns" value={counts?.interns} loading={countsLoading} />
        <Kpi label="Submissions" value={counts?.submissions} loading={countsLoading} />
        <Kpi label="Evaluations" value={counts?.evaluations} loading={countsLoading} />
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Assigned Batches</h2>
          <div className="space-y-3">
            {dataLoading ? <Skeleton h="150px" /> : (
              <>
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
              </>
            )}
          </div>
        </div>

        <div className="card flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Submissions</h2>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Latest 3</span>
          </div>
          <div className="space-y-3 flex-1">
            {dataLoading ? <Skeleton h="150px" /> : (
              <>
                {sortedSubmissions.length === 0 && (
                  <div className="text-sm text-slate-500">No intern submissions yet.</div>
                )}
                {sortedSubmissions.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex justify-between items-start">
                      <div className="text-xs text-slate-400">{item.submitted_for}</div>
                      <div className="text-[10px] font-bold text-brand-600 uppercase">
                        {summary.profileMap?.[item.user_id]?.name || 'Unknown'}
                      </div>
                    </div>
                    <div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{item.content}</div>
                  </div>
                ))}
              </>
            )}
          </div>
          {counts?.submissions > 3 && (
            <div className="flex justify-center pt-4">
              <Link to="/submissions" className="text-xs font-semibold tracking-widest text-slate-400 hover:text-slate-600 transition">
                VIEW MORE
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="card flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Evaluations</h2>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Latest 3</span>
        </div>
        <div className="space-y-3 flex-1">
          {dataLoading ? <Skeleton h="150px" /> : (
            <>
              {sortedEvaluations.length === 0 && (
                <div className="text-sm text-slate-500">No evaluations recorded yet.</div>
              )}
              {sortedEvaluations.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs text-slate-400">Week {item.week_number}</div>
                      <div className="font-bold text-slate-900 text-sm mt-1">
                        {summary.profileMap?.[item.intern_id]?.name || 'Unknown'}
                      </div>
                    </div>
                    <div className="text-xl font-black text-brand-700">{item.score}</div>
                  </div>
                  <div className="text-sm text-slate-600 mt-2 line-clamp-2">{item.feedback || 'No written feedback.'}</div>
                </div>
              ))}
            </>
          )}
        </div>
        {counts?.evaluations > 3 && (
          <div className="flex justify-center pt-4">
            <Link to="/evaluations" className="text-xs font-semibold tracking-widest text-slate-400 hover:text-slate-600 transition">
              VIEW MORE
            </Link>
          </div>
        )}
      </div>
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

