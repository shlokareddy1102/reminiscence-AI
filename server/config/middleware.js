/**
 * config/middleware.js
 *
 * Express middleware for:
 *   - `protect`      — verify JWT and attach req.user
 *   - `requireRole`  — role-based access control (RBAC) guard
 *   - `requireOwner` — ensure the requesting user owns the resource
 *
 * Usage:
 *   const { protect, requireRole } = require('../config/middleware');
 *
 *   router.get('/admin-only', protect, requireRole('admin'), handler);
 *   router.get('/staff',      protect, requireRole('caregiver', 'admin'), handler);
 */

const { verifyToken } = require('./auth');
const User = require('../models/User');

/* ── protect ─────────────────────────────────────────────────────────── */

/**
 * Extract and verify the Bearer JWT from the Authorization header.
 * On success, attaches `req.user` (the full Mongoose document, without
 * the password field) and calls `next()`.
 *
 * On failure, returns 401 — never 403, to avoid leaking whether the
 * resource exists.
 */
async function protect(req, res, next) {
  try {
    /* 1. Extract token */
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ msg: 'Authentication required. No token provided.' });
    }

    const token = authHeader.slice(7).trim(); // remove "Bearer "
    if (!token) {
      return res.status(401).json({ msg: 'Authentication required. Empty token.' });
    }

    /* 2. Verify signature & expiry */
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      const isExpired = err.name === 'TokenExpiredError';
      return res.status(401).json({
        msg: isExpired
          ? 'Session expired. Please log in again.'
          : 'Invalid token. Please log in again.'
      });
    }

    /* 3. Load user from DB — confirms account still exists and is active */
    const user = await User.findById(decoded.id).select(
      '-password -loginAttempts -lockUntil'
    );

    if (!user) {
      return res.status(401).json({ msg: 'User no longer exists.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ msg: 'Account has been deactivated.' });
    }

    /* 4. Attach to request for downstream handlers */
    req.user = user;
    next();
  } catch (err) {
    console.error('[middleware] protect error:', err.message);
    res.status(500).json({ msg: 'Internal server error during authentication.' });
  }
}

/* ── requireRole ─────────────────────────────────────────────────────── */

/**
 * Factory that returns a middleware allowing only the listed roles.
 * Must be used AFTER `protect` (which populates req.user).
 *
 * @param {...string} roles  e.g. requireRole('admin')
 *                           or  requireRole('caregiver', 'admin')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      // protect() was not called before this middleware
      return res.status(401).json({ msg: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        msg: `Access denied. Requires role: ${roles.join(' or ')}.`
      });
    }

    next();
  };
}

/* ── requireOwner ────────────────────────────────────────────────────── */

/**
 * Ensure the authenticated user is accessing their own resource.
 * Compares req.user._id against a param or body field.
 *
 * Admins bypass this check automatically.
 *
 * @param {string} field  The name of the param/body field holding the user id
 *                        (defaults to 'userId')
 *
 * Example:
 *   router.put('/users/:userId/profile', protect, requireOwner('userId'), handler)
 */
function requireOwner(field = 'userId') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ msg: 'Authentication required.' });
    }

    // Admins may access any resource
    if (req.user.role === 'admin') return next();

    const resourceId = req.params[field] || req.body[field];
    if (!resourceId) {
      return res.status(400).json({ msg: `Missing '${field}' in request.` });
    }

    if (String(req.user._id) !== String(resourceId)) {
      return res.status(403).json({ msg: 'Access denied. You do not own this resource.' });
    }

    next();
  };
}

/* ── Exports ─────────────────────────────────────────────────────────── */

module.exports = { protect, requireRole, requireOwner };
