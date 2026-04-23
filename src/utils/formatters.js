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

module.exports = { formatRelativeDate };
