import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '../../hooks/AuthContext'
import api from '../../lib/api'
import { onEvent, EVENTS } from '../../utils/events'

const EMPTY_FORM = { user_id: '', title: '', message: '' }
const EMPTY_BROADCAST_FORM = { message: '' }

export default function Announcements() {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [batches, setBatches] = useState([])
  const [notifications, setNotifications] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [broadcastForm, setBroadcastForm] = useState(EMPTY_BROADCAST_FORM)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Edit modal state
  const [editingNotification, setEditingNotification] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', message: '', user_id: '' })
  const [editLoading, setEditLoading] = useState(false)
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [readFilter, setReadFilter] = useState('')
  const [batchFilter, setBatchFilter] = useState('')

  const canManage = user?.role === 'ADMIN' || user?.role === 'TECHNICAL_LEAD'
  const isAdmin = user?.role === 'ADMIN'
  const profileMap = useMemo(() => Object.fromEntries(profiles.map((profile) => [profile.id, profile])), [profiles])
  
  // Filter profiles by selected batch for dropdown
  const filteredProfilesForDropdown = useMemo(() => {
    if (!batchFilter) return profiles
    return profiles.filter(profile => String(profile.batch_id) === String(batchFilter))
  }, [profiles, batchFilter])

  async function load() {
    try {
      const batchesPromise = api.get('/batches', { params: { limit: 500 } })
      
      const profilePromise = canManage
        ? api.get('/profiles', { params: { limit: 500 } })
        : Promise.resolve({ data: [user] })
      
      // Build query params for notifications
      const notificationParams = { limit: 500 }
      if (!canManage && user?.id) notificationParams.user_id = user.id
      if (searchQuery) notificationParams.search = searchQuery
      if (readFilter) notificationParams.is_read = readFilter === 'read'

      const notificationPromise = api.get('/notifications', { params: notificationParams })

      const [batchesList, profileList, notificationList] = await Promise.all([batchesPromise, profilePromise, notificationPromise])
      
      // Set batches
      const allBatches = batchesList.data || []
      
      // For TL, filter to assigned batches only
      if (user?.role === 'TECHNICAL_LEAD') {
        setBatches(allBatches) // TL sees only assigned batches from backend
        
        // Filter profiles to only show interns in assigned batches
        const allowedBatchIds = new Set(allBatches.map(batch => batch.id))
        const filteredProfiles = (profileList.data || []).filter(profile => 
          allowedBatchIds.has(profile.batch_id)
        )
        setProfiles(filteredProfiles)
      } else {
        setBatches(allBatches)
        setProfiles(profileList.data || [])
      }
      
      setNotifications(notificationList.data || [])
      setError('')
    } catch (err) {
      console.error('Failed to load notifications:', err)
      setError(err.response?.data?.detail || 'Failed to load notifications.')
      setNotifications([])
      setProfiles([])
      setBatches([])
    }
  }

  useEffect(() => { if (user?.id) load() }, [user?.id, searchQuery, readFilter])
  
  // Listen for batch/TL/intern updates from other pages
  useEffect(() => {
    if (!user?.id) return
    
    const cleanupBatch = onEvent(EVENTS.BATCH_UPDATED, () => {
      load() // Reload all data
    })
    const cleanupTL = onEvent(EVENTS.TL_UPDATED, () => {
      load() // Reload all data
    })
    const cleanupIntern = onEvent(EVENTS.INTERN_UPDATED, () => {
      load() // Reload all data
    })
    
    return () => {
      cleanupBatch()
      cleanupTL()
      cleanupIntern()
    }
  }, [user?.id])

  async function createNotification(event) {
    event.preventDefault()
    try {
      await api.post('/notifications', form)
      setForm(EMPTY_FORM)
      setSuccess('Notification sent successfully!')
      setTimeout(() => setSuccess(''), 3000)
      load()
      // Trigger unread count refresh
      window.dispatchEvent(new Event('notificationUpdate'))
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create notification.')
    }
  }

  async function sendBroadcast(event) {
    event.preventDefault()
    if (!window.confirm('Send this notification to all users?')) return
    
    try {
      await api.post('/notifications/broadcast', { message: broadcastForm.message })
      setBroadcastForm(EMPTY_BROADCAST_FORM)
      setSuccess('Broadcast notification sent to all users!')
      setTimeout(() => setSuccess(''), 3000)
      load()
      // Trigger unread count refresh
      window.dispatchEvent(new Event('notificationUpdate'))
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send broadcast notification.')
    }
  }

  async function markRead(id, isRead) {
    try {
      await api.put(`/notifications/${id}`, { is_read: isRead })
      load()
      // Trigger unread count refresh
      window.dispatchEvent(new Event('notificationUpdate'))
    } catch (err) {
      console.error('Failed to update notification:', err)
      setError(err.response?.data?.detail || 'Failed to update notification.')
    }
  }

  async function deleteNotification(id) {
    if (!window.confirm('Delete this notification? This action cannot be undone.')) return
    
    try {
      await api.delete(`/notifications/${id}`)
      setSuccess('Notification deleted successfully!')
      setTimeout(() => setSuccess(''), 3000)
      load()
      // Trigger unread count refresh
      window.dispatchEvent(new Event('notificationUpdate'))
    } catch (err) {
      console.error('Failed to delete notification:', err)
      // Show the actual backend error message
      const errorMsg = err.response?.data?.detail || 'Failed to delete notification.'
      setError(errorMsg)
    }
  }

  // Open edit modal
  function openEditModal(notification) {
    setEditingNotification(notification)
    setEditForm({
      title: notification.title || '',
      message: notification.message || '',
      user_id: String(notification.user_id || '') // Convert to string for form
    })
    setError('')
    setSuccess('')
  }

  // Close edit modal
  function closeEditModal() {
    setEditingNotification(null)
    setEditForm({ title: '', message: '', user_id: '' })
    setError('')
  }

  // Update notification
  async function updateNotification(event) {
    event.preventDefault()
    if (!editingNotification) return
    
    // Permission check: Only ADMIN/TECH_LEAD can edit
    if (user?.role !== 'ADMIN' && user?.role !== 'TECHNICAL_LEAD') {
      setError('Only administrators and technical leads can edit notifications.')
      return
    }
    
    setEditLoading(true)
    setError('')
    
    try {
      // Build update payload - match backend schema
      const updateData = {
        title: editForm.title.trim(),
        message: editForm.message.trim(),
      }
      
      // For non-broadcast notifications, include user_id if changed
      if (!editingNotification.is_broadcast) {
        const targetUserId = editForm.user_id || editingNotification.user_id
        if (!targetUserId) {
          setError('Receiver is required for non-broadcast notifications.')
          setEditLoading(false)
          return
        }
        // Ensure it's a number
        updateData.user_id = parseInt(targetUserId, 10)
        
        if (isNaN(updateData.user_id)) {
          setError('Invalid receiver ID.')
          setEditLoading(false)
          return
        }
      }
      
      // DO NOT send is_read when editing - that's only for mark as read functionality
      
      const response = await api.put(`/notifications/${editingNotification.id}`, updateData)
      
      setSuccess('Notification updated successfully!')
      setTimeout(() => setSuccess(''), 3000)
      closeEditModal()
      load()
      // Trigger unread count refresh
      window.dispatchEvent(new Event('notificationUpdate'))
    } catch (err) {
      console.error('Failed to update notification:', err)
      console.error('Error response:', err.response?.data)
      console.error('Request data sent:', {
        title: editForm.title,
        message: editForm.message,
        user_id: editForm.user_id,
        notification_id: editingNotification.id
      })
      
      // Handle validation errors (422)
      if (err.response?.status === 422) {
        const detail = err.response?.data?.detail
        console.error('422 Validation detail:', detail)
        
        if (Array.isArray(detail)) {
          // FastAPI validation errors are arrays of objects
          // Each object has: type, loc (array), msg, input
          const errorMessages = detail.map(e => {
            // Safely extract location path
            const location = Array.isArray(e.loc) ? e.loc.join('.') : 'unknown'
            // Safely extract message
            const message = e.msg || e.message || 'validation error'
            return `${location}: ${message}`
          }).join('; ')
          setError(`Validation error: ${errorMessages}`)
        } else if (typeof detail === 'string') {
          setError(detail)
        } else if (detail && typeof detail === 'object') {
          // Convert object to readable string
          setError(`Validation error: ${JSON.stringify(detail)}`)
        } else {
          setError('Validation error: The backend rejected this update. Please check the console for details.')
        }
      } else if (err.response?.status === 403) {
        setError('You can only edit notifications you created.')
        console.error('403 Forbidden - Permission denied')
        console.error('User role:', user?.role)
        console.error('User ID:', user?.id)
        console.error('Notification sender_id:', editingNotification.sender_id)
        console.error('Notification is_sender:', editingNotification.is_sender)
      } else if (err.response?.status === 404) {
        setError('Notification not found.')
      } else {
        const errorMsg = err.response?.data?.detail
        if (typeof errorMsg === 'string') {
          setError(errorMsg)
        } else {
          setError('Failed to update notification. Please try again.')
        }
      }
    } finally {
      setEditLoading(false)
    }
  }

  function getTypeBadgeColor(type) {
    const colors = {
      SYSTEM: 'bg-slate-100 text-slate-700 border-slate-300',
      INFO: 'bg-blue-100 text-blue-700 border-blue-300',
      WARNING: 'bg-amber-100 text-amber-700 border-amber-300',
      SUCCESS: 'bg-green-100 text-green-700 border-green-300',
      ERROR: 'bg-rose-100 text-rose-700 border-rose-300',
    }
    return colors[type] || colors.SYSTEM
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Notifications</h1>
        <p className="text-sm text-slate-500 mt-2">
          {canManage ? 'Send direct notifications to platform users.' : 'Track your notifications and mark them as read.'}
        </p>
      </div>

      {error && <div className="card border border-rose-200 bg-rose-50 text-rose-700">{error}</div>}
      {success && <div className="card border border-green-200 bg-green-50 text-green-700">{success}</div>}

      {/* 1. Send Notification Forms (TOP) */}
      {isAdmin && (
        <form onSubmit={sendBroadcast} className="card space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
            <h2 className="text-lg font-semibold text-slate-900">Broadcast to All Users</h2>
          </div>
          <input
            className="input"
            placeholder="Broadcast message"
            value={broadcastForm.message}
            onChange={(e) => setBroadcastForm({ message: e.target.value })}
            required
          />
          <button className="btn-primary w-full" type="submit">
            Send to All Users
          </button>
        </form>
      )}

      {canManage && (
        <form onSubmit={createNotification} className="card space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Send Individual Notification</h2>
          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Batch</label>
              <select 
                className="input" 
                value={batchFilter} 
                onChange={(e) => {
                  setBatchFilter(e.target.value)
                  setForm({ ...form, user_id: '' })
                }}
              >
                <option value="">All Batches</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>{batch.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Recipient *</label>
              <select 
                className="input" 
                value={form.user_id} 
                onChange={(e) => setForm({ ...form, user_id: e.target.value })} 
                required
                disabled={!batchFilter}
              >
                <option value="">Select recipient</option>
                {filteredProfilesForDropdown.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name} ({profile.role})</option>
                ))}
              </select>
              {!batchFilter && (
                <p className="text-xs text-slate-500 mt-1">Select a batch first</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
              <input 
                className="input" 
                placeholder="Title" 
                value={form.title} 
                onChange={(e) => setForm({ ...form, title: e.target.value })} 
                required 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Message *</label>
              <input 
                className="input" 
                placeholder="Message" 
                value={form.message} 
                onChange={(e) => setForm({ ...form, message: e.target.value })} 
                required 
              />
            </div>
          </div>
          <button className="btn-primary w-full" type="submit">Send Notification</button>
        </form>
      )}

      {/* 2. Search and Filters */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Search & Filter Notifications</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
            <input
              type="text"
              className="input"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select className="input" value={readFilter} onChange={(e) => setReadFilter(e.target.value)}>
              <option value="">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Notifications List (BOTTOM) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">All Notifications</h2>
        {notifications.length === 0 && <div className="card text-slate-500">No notifications found.</div>}
        {notifications.map((item) => {
          // Determine user's relationship to this notification
          const isSender = item.is_sender === true
          const isReceiver = !isSender
          
          // Permission logic based on role
          const canEdit = user?.role === 'ADMIN' || user?.role === 'TECHNICAL_LEAD' // ADMIN/TL can edit any notification
          const canMarkRead = isReceiver // Only receiver can mark as read
          
          return (
            <div key={item.id} className={`card ${item.is_read ? 'bg-white' : 'bg-blue-50 border-l-4 border-blue-500'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-slate-900">{item.title}</div>
                    
                    {/* Edited badge - show if notification was edited */}
                    {item.edited_at && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-300 rounded-full">
                        Edited
                      </span>
                    )}
                    
                    {/* New badge - only for receiver if unread */}
                    {isReceiver && !item.is_read && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-blue-500 text-white rounded-full">New</span>
                    )}
                    
                    {/* Read status - only for sender */}
                    {isSender && (
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                        item.is_read 
                          ? 'bg-green-100 text-green-700 border-green-300' 
                          : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}>
                        {item.is_read ? 'Seen' : 'Sent'}
                      </span>
                    )}
                    
                    {/* Type badge */}
                    {item.type && (
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${getTypeBadgeColor(item.type)}`}>
                        {item.type}
                      </span>
                    )}
                    
                    {/* Broadcast badge */}
                    {item.is_broadcast && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-300 rounded-full">
                        Broadcast
                      </span>
                    )}
                  </div>
                  
                  {/* Sender name - only show to receiver */}
                  {isReceiver && item.sender_name && (
                    <div className="text-xs text-slate-500 mt-1">
                      From: <span className="font-medium">{item.sender_name}</span>
                    </div>
                  )}
                  
                  {/* Receiver name - only show to sender */}
                  {isSender && !item.is_broadcast && (
                    <div className="text-xs text-slate-500 mt-1">
                      To: <span className="font-medium">{profileMap[item.user_id]?.name || item.user_id}</span>
                    </div>
                  )}
                  
                  {/* Message */}
                  <div className="text-sm text-slate-700 mt-2">{item.message}</div>
                  
                  {/* Timestamp */}
                  <div className="text-xs text-slate-400 mt-3">
                    {item.is_broadcast && 'Sent to all users · '}
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                </div>
                
                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                  {/* Mark as read/unread - only for receiver */}
                  {canMarkRead && (
                    <button 
                      className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg transition-colors flex items-center gap-2 justify-center min-w-[140px]"
                      onClick={() => markRead(item.id, !item.is_read)}
                    >
                      {item.is_read ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Mark as Unread
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Mark as Read
                        </>
                      )}
                    </button>
                  )}
                  
                  {/* Edit - ADMIN/TECH_LEAD can edit any notification */}
                  {canEdit && (
                    <button 
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 justify-center min-w-[120px]"
                      onClick={() => openEditModal(item)}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                  )}
                  
                  {/* Delete button removed - notifications cannot be deleted */}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Edit Notification Modal */}
      {editingNotification && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">Edit Notification</h2>
              <button
                onClick={closeEditModal}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                disabled={editLoading}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={updateNotification} className="space-y-4">
              {/* Receiver (if not broadcast) */}
              {!editingNotification.is_broadcast && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Receiver *
                  </label>
                  <select
                    className="input"
                    value={editForm.user_id}
                    onChange={(e) => setEditForm({ ...editForm, user_id: e.target.value })}
                    required
                    disabled={editLoading}
                  >
                    <option value="">Select recipient</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} ({profile.role})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Current: {profileMap[editingNotification.user_id]?.name || 'Unknown'}
                  </p>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  className="input"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="Notification title"
                  required
                  disabled={editLoading}
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Message *
                </label>
                <textarea
                  className="input min-h-[120px] resize-y"
                  value={editForm.message}
                  onChange={(e) => setEditForm({ ...editForm, message: e.target.value })}
                  placeholder="Notification message"
                  required
                  disabled={editLoading}
                  rows={5}
                />
              </div>

              {/* Notification Info */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-600">Type:</span>{' '}
                    <span className="font-medium text-slate-900">{editingNotification.type || 'SYSTEM'}</span>
                  </div>
                  <div>
                    <span className="text-slate-600">Status:</span>{' '}
                    <span className="font-medium text-slate-900">
                      {editingNotification.is_read ? 'Read' : 'Unread'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600">Created:</span>{' '}
                    <span className="font-medium text-slate-900">
                      {new Date(editingNotification.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {editingNotification.edited_at && (
                    <div>
                      <span className="text-slate-600">Last Edited:</span>{' '}
                      <span className="font-medium text-slate-900">
                        {new Date(editingNotification.edited_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {editingNotification.is_broadcast && (
                    <div className="col-span-2">
                      <span className="font-medium text-purple-700">Broadcast to all users</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                  disabled={editLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  disabled={editLoading}
                >
                  {editLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
