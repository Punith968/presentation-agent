const path = require('path');

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.pptx']);

/**
 * Turn a client-supplied filename into a safe, flat name for the uploads
 * directory: strips any directory components (both / and \), replaces
 * characters outside [A-Za-z0-9._-] and prevents leading dots.
 */
function safeUploadName(originalName, now = Date.now()) {
  const base = path.basename(String(originalName).replace(/\\/g, '/'));
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120) || 'upload';
  return `${now}-${cleaned}`;
}

function hasAllowedExtension(originalName) {
  return ALLOWED_EXTENSIONS.has(path.extname(String(originalName)).toLowerCase());
}

module.exports = { safeUploadName, hasAllowedExtension, ALLOWED_EXTENSIONS };
