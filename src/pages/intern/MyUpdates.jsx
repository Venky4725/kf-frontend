import { useEffect, useState, useMemo } from 'react'

import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'
import RoadmapTaskCard, { isRoadmapTask } from '../../components/RoadmapTaskCard'
import { emitSubmissionUpdate } from '../../utils/events'

export default function MyUpdates() {
  const { user } = useAuth()
  const [submissions, setSubmissions] = useState([])
  const [form, setForm] = useState({
    submitted_for: new Date().toISOString().slice(0, 10),
    content: '',
  })
  const [message, setMessage] = useState('')

  async function load() {
    if (!user?.id) return
    
    try {
      const res = await api.get('/submissions', { params: { user_id: user.id, limit: 500 } })
      setSubmissions(res.data || [])
    } catch (err) {
      console.error('Failed to load updates:', err)
      setSubmissions([])
      setMessage(err.response?.data?.detail || 'Failed to load your updates.')
    }
  }

  useEffect(() => { if (user?.id) load() }, [user])

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
      emitSubmissionUpdate()
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
      emitSubmissionUpdate()
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
        <p className="text-sm text-slate-500 mt-2">Submit your daily progress and track your learning history.</p>
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
