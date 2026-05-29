/**
 * Global event system for cross-component data synchronization
 * Allows pages to notify each other when data changes
 */

// Event types
export const EVENTS = {
  BATCH_UPDATED: 'batchUpdated',
  TL_UPDATED: 'tlUpdated',
  INTERN_UPDATED: 'internUpdated',
  TASK_UPDATED: 'taskUpdated',
  EVALUATION_UPDATED: 'evaluationUpdated',
  SUBMISSION_UPDATED: 'submissionUpdated',
  NOTIFICATION_UPDATED: 'notificationUpdated',
}

/**
 * Emit a custom event
 * @param {string} eventName - Event name from EVENTS constant
 * @param {*} detail - Optional event data
 */
export function emitEvent(eventName, detail = null) {
  const event = new CustomEvent(eventName, { detail })
  window.dispatchEvent(event)
}

/**
 * Listen to a custom event
 * @param {string} eventName - Event name from EVENTS constant
 * @param {Function} handler - Event handler function
 * @returns {Function} Cleanup function to remove listener
 */
export function onEvent(eventName, handler) {
  window.addEventListener(eventName, handler)
  
  // Return cleanup function
  return () => window.removeEventListener(eventName, handler)
}

/**
 * Emit batch update event
 * Triggers refresh on: BatchManagement, TLManagement, Tasks, Evaluations, Notifications
 */
export function emitBatchUpdate() {
  emitEvent(EVENTS.BATCH_UPDATED)
}

/**
 * Emit TL update event
 * Triggers refresh on: TLManagement, BatchManagement, Tasks, Evaluations, Notifications
 */
export function emitTLUpdate() {
  emitEvent(EVENTS.TL_UPDATED)
}

/**
 * Emit intern update event
 * Triggers refresh on: InternManagement, Tasks, Evaluations, Attendance
 */
export function emitInternUpdate() {
  emitEvent(EVENTS.INTERN_UPDATED)
}

/**
 * Emit task update event
 */
export function emitTaskUpdate() {
  emitEvent(EVENTS.TASK_UPDATED)
}

/**
 * Emit evaluation update event
 */
export function emitEvaluationUpdate() {
  emitEvent(EVENTS.EVALUATION_UPDATED)
}

/**
 * Emit submission update event
 */
export function emitSubmissionUpdate() {
  emitEvent(EVENTS.SUBMISSION_UPDATED)
}

/**
 * Emit notification update event
 */
export function emitNotificationUpdate() {
  emitEvent(EVENTS.NOTIFICATION_UPDATED)
}
