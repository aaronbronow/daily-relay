/**
 * Formats a date object into a relative string like "Today at 11:19 AM".
 * @param {Date} date 
 * @returns {string}
 */
function formatRelativeDate(date) {
  const now = new Date();
  const isToday = date.getDate() === now.getDate() &&
                  date.getMonth() === now.getMonth() &&
                  date.getFullYear() === now.getFullYear();
  
  const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === date.toDateString();
  
  const options = { hour: 'numeric', minute: '2-digit', hour12: true };
  const timeStr = date.toLocaleTimeString('en-US', options);
  
  if (isToday) {
    return `Today at ${timeStr}`;
  } else if (isYesterday) {
    return `Yesterday at ${timeStr}`;
  } else {
    return `${date.toLocaleDateString()} at ${timeStr}`;
  }
}

/**
 * Returns a simple relative date bucket: today, yesterday, this week, last week, earlier.
 * @param {Date|string} date 
 * @returns {string}
 */
function getBriefingRelativeDate(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  
  // Normalize to start of day for accurate day-based comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  
  const diffTime = today - itemDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return 'this week';
  if (diffDays < 14) return 'last week';
  return 'earlier';
}

module.exports = { formatRelativeDate, getBriefingRelativeDate };
