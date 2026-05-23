import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../lib/api'

export default function UserArchive() {
  const [profiles, setProfiles] = useState([])
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  async function load() {
    // ...
  }

  useEffect(() => { load() }, [])

  function flash(msg) {
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 3500)
  }

  const batchById = {}
  batches.forEach(b => { batchById[b.id] = b })

  const filtered = profiles.filter(p => {
    if (roleFilter !== 'ALL' && p.role !== roleFilter) return false
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      if (!p.name?.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q)) return false
    }
    return true
  })

  async function activateProfile(id) {
    const profile = profiles.find(p => p.id === id)
    if (!profile) return
    
    if (!window.confirm(`Activate ${profile.name}?\n\nThey will be able to login again.`)) return
    
    try {
      await api.patch(`/profiles/${id}/activate`)
      flash(`Activated ${profile.name}`)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to activate profile.')
    }
  }

  const inactiveTLs = filtered.filter(p => p.role === 'TECHNICAL_LEAD')
  const inactiveInterns = filtered.filter(p => p.role === 'INTERN')

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 text-white p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <svg viewBox="0 0 400 200" className="w-full h-full">
            <rect x="40" y="40" width="100" height="120" fill="white" rx="8"/>
            <rect x="260" y="60" width="100" height="100" fill="white" rx="8"/>
          </svg>
        </div>
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-3xl font-bold">User Archive</h2>
            <p className="text-sm opacity-90 mt-2">
              Deactivated users. You can restore them to active status.
            </p>
          </div>
          <Link
            to="/admin"
            className="bg-white/20 hover:bg-white/30 backdrop-blur text-white font-bold px-5 py-3 rounded-lg transition flex items-center gap-2"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="card border-l-4 border-rose-400 bg-rose-50">
          <div className="text-sm text-rose-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-rose-600 hover:text-rose-800 ml-4">✕</button>
          </div>
        </div>
      )}
      {success && (
        <div className="card border-l-4 border-emerald-400 bg-emerald-50">
          <div className="text-sm text-emerald-700">{success}</div>
        </div>
      )}

      {/* Filter row */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">Search</label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Name or email..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">Role</label>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500"
            >
              <option value="ALL">All Roles</option>
              <option value="TECHNICAL_LEAD">Technical Leads</option>
              <option value="INTERN">Interns</option>
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="card text-center py-12 text-slate-500">Loading archive...</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-2">📦</div>
          <div className="font-semibold text-slate-700">Archive is empty</div>
          <div className="text-sm text-slate-500 mt-1">Deactivated users will appear here.</div>
        </div>
      )}

      {/* Technical Leads Section */}
      {!loading && inactiveTLs.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200">
            Inactive Technical Leads ({inactiveTLs.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-100 to-slate-200 border-b-2 border-slate-300">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-700">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-700">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-700">Tech Stack</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-700">Batch</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inactiveTLs.map(tl => {
                  const batch = batchById[tl.batch_id]
                  return (
                    <tr key={tl.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-semibold text-slate-900">{tl.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{tl.email}</td>
                      <td className="px-4 py-3">
                        {tl.tech_stack ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {tl.tech_stack}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {batch ? `${batch.name} — ${batch.district}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => activateProfile(tl.id)}
                          className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-all duration-200"
                        >
                          Activate
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Interns Section */}
      {!loading && inactiveInterns.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200">
            Inactive Interns ({inactiveInterns.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-100 to-slate-200 border-b-2 border-slate-300">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-700">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-700">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-700">Tech Stack</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-700">Batch</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inactiveInterns.map(intern => {
                  const batch = batchById[intern.batch_id]
                  return (
                    <tr key={intern.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-semibold text-slate-900">{intern.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{intern.email}</td>
                      <td className="px-4 py-3">
                        {intern.tech_stack ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {intern.tech_stack}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {batch ? `${batch.name} — ${batch.district}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => activateProfile(intern.id)}
                          className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-all duration-200"
                        >
                          Activate
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Helper */}
      <div className="card border-l-4 border-amber-400 bg-amber-50">
        <h3 className="font-bold text-slate-900 mb-2">About the Archive</h3>
        <ul className="text-sm text-slate-700 space-y-1.5">
          <li>Deactivated users cannot login but their data is preserved</li>
          <li>Click <span className="font-semibold">Activate</span> to restore a user to active status</li>
          <li>All historical data (submissions, evaluations, etc.) remains intact</li>
        </ul>
      </div>
    </div>
  )
}
