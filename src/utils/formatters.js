/**
 * Format multiple tech leads for display
 * @param {Array} techLeads - Array of tech lead objects or names
 * @returns {string} Formatted string like "A/B/C" or "Unassigned"
 */
export function formatTechLeads(techLeads) {
  if (!techLeads || techLeads.length === 0) {
    return 'Unassigned'
  }
  
  // Handle array of objects with name property
  if (typeof techLeads[0] === 'object' && techLeads[0]?.name) {
    return techLeads.map(tl => tl.name).join(' / ')
  }
  
  // Handle array of strings
  if (typeof techLeads[0] === 'string') {
    return techLeads.join(' / ')
  }
  
  return 'Unassigned'
}

/**
 * Format batch name safely
 * @param {string|null} batchId - Batch ID
 * @param {Array} batches - Array of batch objects
 * @returns {string} Batch name or "Unassigned"
 */
export function formatBatchName(batchId, batches) {
  if (!batchId || !batches || batches.length === 0) {
    return 'Unassigned'
  }
  
  const batch = batches.find(b => b.id === batchId)
  return batch?.name || 'Unassigned'
}

/**
 * Format date safely
 * @param {string|Date} date - Date to format
 * @param {string} format - Format type: 'short', 'long', 'iso'
 * @returns {string} Formatted date or "N/A"
 */
export function formatDate(date, format = 'short') {
  if (!date) return 'N/A'
  
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return 'N/A'
    
    switch (format) {
      case 'short':
        return d.toLocaleDateString()
      case 'long':
        return d.toLocaleString()
      case 'iso':
        return d.toISOString().split('T')[0]
      default:
        return d.toLocaleDateString()
    }
  } catch (err) {
    console.error('Date formatting error:', err)
    return 'N/A'
  }
}

/**
 * Safely access nested object properties
 * @param {Object} obj - Object to access
 * @param {string} path - Dot-separated path like "user.profile.name"
 * @param {*} defaultValue - Default value if path doesn't exist
 * @returns {*} Value at path or default value
 */
export function safeGet(obj, path, defaultValue = null) {
  if (!obj || !path) return defaultValue
  
  try {
    const keys = path.split('.')
    let result = obj
    
    for (const key of keys) {
      if (result === null || result === undefined) {
        return defaultValue
      }
      result = result[key]
    }
    
    return result !== undefined ? result : defaultValue
  } catch (err) {
    console.error('Safe get error:', err)
    return defaultValue
  }
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncate(text, maxLength = 50) {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

/**
 * Format file size
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`
}
