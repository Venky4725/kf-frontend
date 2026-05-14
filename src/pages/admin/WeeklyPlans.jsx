import { useEffect, useState, useMemo } from 'react'
import React from 'react'

import api from '../../lib/api'

const EMPTY_FORM = { title: '', description: '', batch_id: '', due_date: '', assigned_to: '' }

export default function WeeklyPlans() {
  const [tasks, setTasks] = useState([])
  const [batches, setBatches] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [interns, setInterns] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedBatch, setSelectedBatch] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState('desc')
  const [editingId, setEditingId] = useState(null)
  const [editingForm, setEditingForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Filter interns by selected batch for assignee dropdown
  const filteredInterns = React.useMemo(() => {
    if (!form.batch_id) return []
    return interns.filter(intern => String(intern.batch_id) === String(form.batch_id))
  }, [interns, form.batch_id])
  
  // Filter interns for editing form
  const filteredInternsForEdit = React.useMemo(() => {
    if (!editingForm.batch_id) return []
    return interns.filter(intern => String(intern.batch_id) === String(editingForm.batch_id))
  }, [interns, editingForm.batch_id])

  async function load() {
    try {
      const params = { limit: 500 }
      if (selectedBatch) params.batch_id = selectedBatch
      if (sortBy) {
        params.sort_by = sortBy
        params.order = sortOrder
      }
      
      const [taskList, batchList, userList, internList] = await Promise.all([
        api.get('/tasks', { params }),
        api.get('/batches', { params: { limit: 500 } }),
        api.get('/profiles', { params: { limit: 500 } }),
        api.get('/profiles', { params: { role: 'INTERN', limit: 500 } }),
      ])
      setTasks(taskList.data || [])
      setBatches(batchList.data || [])
      setAllUsers(userList.data || [])
      setInterns(internList.data || [])
      setError('')
    } catch (err) {
      console.error('❌ Failed to load tasks:', err)
      setError(err.response?.data?.detail || 'Failed to load tasks.')
      setTasks([])
      setBatches([])
      setAllUsers([])
      setInterns([])
    }
  }

  useEffect(() => { load() }, [selectedBatch, sortBy, sortOrder])

  // No longer need to load users based on batch selection
  // Users are loaded once with all data

  async function createTask(event) {
    event.preventDefault()
    try {
      const payload = { 
        title: form.title,
        description: form.description,
        batch_id: form.batch_id,
        due_date: form.due_date || null,
      }
      if (form.assigned_to) {
        payload.assigned_to = form.assigned_to
      }
      
      await api.post('/tasks', payload)
      setForm(EMPTY_FORM)
      setSuccess('Task created successfully!')
      setTimeout(() => setSuccess(''), 3000)
      load()
    } catch (err) {
      console.error('Failed to create task:', err)
      setError(err.response?.data?.detail || 'Failed to create task.')
    }
  }

  async function saveTask(id) {
    try {
      await api.put(`/tasks/${id}`, editingForm)
      setEditingId(null)
      setError('')
      load()
    } catch (err) {
      if (err.response?.status === 403) {
        setError('You can only manage resources in your assigned batches.')
      } else {
        setError(err.response?.data?.detail || 'Failed to update task.')
      }
    }
  }

  async function deleteTask(id) {
    if (!window.confirm('Delete this task?')) return
    try {
      await api.delete(`/tasks/${id}`)
      setError('')
      load()
    } catch (err) {
      if (err.response?.status === 403) {
        setError('You can only manage resources in your assigned batches.')
      } else {
        setError(err.response?.data?.detail || 'Failed to delete task.')
      }
    }
  }

  function batchName(batchId) {
    return batches.find((batch) => batch.id === batchId)?.name || 'Unknown batch'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Tasks</h1>
        <p className="text-sm text-slate-500 mt-2">Manage batch-level tasks that interns work on.</p>
      </div>

      {error && <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>}
      {success && <div className="card border border-green-200 bg-green-50 text-green-700">{success}</div>}

      {/* 1. Create New Task Form (TOP) */}
      <form onSubmit={createTask} className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Create New Task</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <input 
            className="input" 
            placeholder="Task title *" 
            value={form.title} 
            onChange={(e) => setForm({ ...form, title: e.target.value })} 
            required 
          />
          <input 
            className="input" 
            placeholder="Description" 
            value={form.description} 
            onChange={(e) => setForm({ ...form, description: e.target.value })} 
          />
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <select 
            className="input" 
            value={form.batch_id} 
            onChange={(e) => setForm({ ...form, batch_id: e.target.value, assigned_to: '' })} 
            required
          >
            <option value="">Select batch *</option>
            {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
          </select>
          <select 
            className="input" 
            value={form.assigned_to} 
            onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            disabled={!form.batch_id}
          >
            <option value="">All batch members</option>
            {filteredInterns.map((intern) => (
              <option key={intern.id} value={intern.id}>
                {intern.name}
              </option>
            ))}
          </select>
          {!form.batch_id && (
            <p className="text-xs text-slate-500 mt-1">Select a batch first to see interns</p>
          )}
          <input 
            className="input" 
            type="date" 
            value={form.due_date} 
            onChange={(e) => setForm({ ...form, due_date: e.target.value })} 
            placeholder="Due date (optional)"
          />
        </div>
        <button className="btn-primary w-full" type="submit">Create Task</button>
      </form>

      {/* 2. Filters Section (MIDDLE) */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Filter & Sort Tasks</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Batch</label>
            <select className="input" value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)}>
              <option value="">All batches</option>
              {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sort By</label>
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="created_at">Created Date</option>
              <option value="title">Title</option>
              <option value="due_date">Due Date</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Order</label>
            <select className="input" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Tasks Table (BOTTOM) */}
      <div className="card overflow-x-auto">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">All Tasks</h2>
        <table className="table">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Title</th>
              <th className="th">Description</th>
              <th className="th">Batch</th>
              <th className="th">Assigned To</th>
              <th className="th">Due Date</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((item) => (
              <tr key={item.id}>
                <td className="td">
                  {editingId === item.id ? (
                    <input className="input" value={editingForm.title} onChange={(e) => setEditingForm({ ...editingForm, title: e.target.value })} />
                  ) : item.title}
                </td>
                <td className="td">
                  {editingId === item.id ? (
                    <input className="input" value={editingForm.description || ''} onChange={(e) => setEditingForm({ ...editingForm, description: e.target.value })} />
                  ) : (item.description || '—')}
                </td>
                <td className="td">{batchName(item.batch_id)}</td>
                <td className="td">
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded-full">
                    {item.assigned_to_name || 'All batch members'}
                  </span>
                </td>
                <td className="td">
                  {editingId === item.id ? (
                    <input className="input" type="date" value={editingForm.due_date || ''} onChange={(e) => setEditingForm({ ...editingForm, due_date: e.target.value })} />
                  ) : (item.due_date || '—')}
                </td>
                <td className="td space-x-3">
                  {editingId === item.id ? (
                    <>
                      <button className="text-sm text-brand-700 font-semibold" onClick={() => saveTask(item.id)}>Save</button>
                      <button className="text-sm text-slate-500" onClick={() => setEditingId(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="text-sm text-brand-700 font-semibold" onClick={() => {
                        setEditingId(item.id)
                        setEditingForm({
                          title: item.title,
                          description: item.description || '',
                          due_date: item.due_date || '',
                        })
                      }}>Edit</button>
                      <button className="text-sm text-rose-700 font-semibold" onClick={() => deleteTask(item.id)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr><td className="td text-slate-500" colSpan={6}>No tasks found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
