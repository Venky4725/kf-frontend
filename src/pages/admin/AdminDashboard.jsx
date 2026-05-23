import { useEffect, useState, useMemo } from 'react'
import api from '../../lib/api'

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Split state for independent loading/rendering
  const [counts, setCounts] = useState(null)
  const [recentData, setRecentData] = useState({ submissions: [], evaluations: [], profileMap: {}, batchMap: {} })
  
  const [countsLoading, setCountsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    
    async function loadDashboard() {
      console.time('🚀 Admin Dashboard Total Load')
      setLoading(true)
      
      try {
        // 1. Parallel Stats & Main Data
        const statsPromises = [
          // Counts (Interns, TLs, Batches, etc.)
          api.get('/dashboard/stats/counts', { signal: controller.signal })
            .then(res => { setCounts(res.data); setCountsLoading(false) })
            .catch(err => console.error('Counts load error:', err)),
            
          // Recent Activity (Submissions, etc.)
          api.get('/profiles', { params: { limit: 500 }, signal: controller.signal }),
          api.get('/batches', { params: { limit: 500 }, signal: controller.signal }),
          api.get('/submissions', { params: { limit: 5 }, signal: controller.signal }),
          api.get('/evaluations', { params: { limit: 5 }, signal: controller.signal }),
        ]

        const results = await Promise.allSettled(statsPromises)
        
        // Process recent activity results (indices: 1=profiles, 2=batches, 3=submissions, 4=evaluations)
        const profilesRes = results[1].status === 'fulfilled' ? results[1].value : { data: [] }
        const batchesRes = results[2].status === 'fulfilled' ? results[2].value : { data: [] }
        const submissionsRes = results[3].status === 'fulfilled' ? results[3].value : { data: [] }
        const evaluationsRes = results[4].status === 'fulfilled' ? results[4].value : { data: [] }

        const allProfiles = profilesRes.data || []
        const profileMap = Object.fromEntries(allProfiles.map((p) => [p.id, p]))
        const batchMap = Object.fromEntries((batchesRes.data || []).map((b) => [b.id, b]))

        setRecentData({
          submissions: submissionsRes.data || [],
          evaluations: evaluationsRes.data || [],
          profileMap,
          batchMap
        })

        setError('')
      } catch (err) {
        if (err.name !== 'CanceledError') {
          console.error('❌ Admin Dashboard Load Error:', err)
          setError(err.response?.data?.detail || 'Failed to load admin dashboard.')
        }
      } finally {
        setLoading(false)
        console.timeEnd('🚀 Admin Dashboard Total Load')
      }
    }

    loadDashboard()
    return () => controller.abort()
  }, [])

  const internsByBatch = useMemo(() => {
    if (!recentData.profileMap || !recentData.batchMap) return {}
    const interns = Object.values(recentData.profileMap).filter(p => p.role === 'INTERN' && p.is_active !== false)
    return interns.reduce((acc, intern) => {
      const batchName = recentData.batchMap[intern.batch_id]?.name || 'Unassigned'
      acc[batchName] = (acc[batchName] || 0) + 1
      return acc
    }, {})
  }, [recentData.profileMap, recentData.batchMap])

  if (error) return <div className="card border border-rose-200 bg-rose-50 text-rose-700 m-6">{error}</div>

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-slate-950 text-white p-8 shadow-2xl">
        <div className="text-xs uppercase tracking-[0.25em] text-brand-200 font-semibold">Administrator</div>
        <h1 className="text-4xl font-black mt-3">Knowledge Factory Control Center</h1>
        <p className="text-sm text-slate-200 mt-3 max-w-3xl">
          Real-time view of the MVP backend across profiles, batches, tasks, and analytics.
        </p>
      </section>

      {/* Navigation Quick Links */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickLink href="/admin/tls" title="Technical Leads" subtitle="Manage TL profiles" color="cyan" />
        <QuickLink href="/admin/interns" title="Interns" subtitle="Manage intern profiles" color="blue" />
        <QuickLink href="/admin/archive" title="User Archive" subtitle="View inactive users" color="slate" />
      </section>

      {/* KPI Section */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Kpi label="Interns" value={counts?.interns} loading={countsLoading} />
        <Kpi label="TLs" value={counts?.tls} loading={countsLoading} />
        <Kpi label="Batches" value={counts?.batches} loading={countsLoading} />
        <Kpi label="Tasks" value={counts?.tasks} loading={countsLoading} />
        <Kpi label="Submissions" value={counts?.submissions} loading={countsLoading} />
        <Kpi label="Evaluations" value={counts?.evaluations} loading={countsLoading} />
        <Kpi label="Notifications" value={counts?.notifications} loading={countsLoading} />
      </section>

      {/* Analytics Grid */}
      <section className="grid lg:grid-cols-2 gap-6">
        {/* Intern Distribution */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Intern Distribution by Batch</h2>
          <div className="space-y-3">
            {loading && Object.keys(internsByBatch).length === 0 ? <Skeleton h="100px" /> : (
              <>
                {Object.entries(internsByBatch).length === 0 && (
                  <div className="text-sm text-slate-500">No intern profiles found.</div>
                )}
                {Object.entries(internsByBatch).map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{name}</span>
                    <span className="text-sm font-semibold text-brand-700">{count}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Recent Submissions */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Recent Submissions</h2>
          <div className="space-y-3">
            {loading && recentData.submissions.length === 0 ? <Skeleton h="150px" /> : (
              <>
                {recentData.submissions.length === 0 && (
                  <div className="text-sm text-slate-500">No submissions yet.</div>
                )}
                {recentData.submissions.map((submission) => {
                  const internProfile = recentData.profileMap[submission.intern_id]
                  const batchName = submission.batch_name ?? recentData.batchMap[submission.batch_id]?.name ?? 'N/A'
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
              </>
            )}
          </div>
        </div>
      </section>

      {/* Evaluations Table */}
      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Latest Evaluations</h2>
        {loading && recentData.evaluations.length === 0 ? <Skeleton h="200px" /> : (
          recentData.evaluations.length === 0 ? (
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
                  {recentData.evaluations.map((item) => {
                    const profile = recentData.profileMap[item.intern_id]
                    const batchName = recentData.batchMap[profile?.batch_id]?.name ?? 'N/A'
                    const internName = profile?.name || item.intern_id
                    return (
                      <tr key={item.id}>
                        <td className="td">{batchName}</td>
                        <td className="td">{internName}</td>
                        <td className="td">{item.week_number}</td>
                        <td className="td font-semibold">{item.score}</td>
                        <td className="td text-slate-600 text-sm truncate max-w-xs">{item.feedback || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  )
}

function Kpi({ label, value, loading }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">{label}</div>
      {loading ? (
        <div className="h-8 w-12 bg-slate-100 animate-pulse rounded mt-2"></div>
      ) : (
        <div className="text-2xl font-black text-slate-900 mt-1">{value ?? 0}</div>
      )}
    </div>
  )
}

function QuickLink({ href, title, subtitle, color }) {
  const colors = {
    cyan: 'from-cyan-50 to-cyan-100 border-cyan-200 text-cyan-900',
    blue: 'from-blue-50 to-blue-100 border-blue-200 text-blue-900',
    slate: 'from-slate-50 to-slate-100 border-slate-200 text-slate-900'
  }
  
  return (
    <a href={href} className={`card hover:shadow-lg transition-all transform hover:-translate-y-1 cursor-pointer bg-gradient-to-br ${colors[color]}`}>
      <div className="text-sm font-bold">{title}</div>
      <div className="text-xs opacity-75 mt-1">{subtitle}</div>
    </a>
  )
}

function Skeleton({ h }) {
  return <div className="bg-slate-100 animate-pulse rounded-xl w-full" style={{ height: h }}></div>
}
