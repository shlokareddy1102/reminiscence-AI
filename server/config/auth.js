/**
 * config/auth.js
 *
 * Central place for all authentication primitives:
 *   - Password validation rules
 *   - bcrypt hashing / comparison
 *   - JWT generation / verification
 *
 * Nothing here imports from Mongoose — this file is pure logic so
 * it can be tested in isolation without a DB connection.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/* ── Constants ───────────────────────────────────────────────────────── */

const BCRYPT_SALT_ROUNDS = 12; // OWASP-recommended minimum for 2024+

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  // Crash loudly at startup — a missing secret is a critical misconfiguration.
  throw new Error(
    '[auth] JWT_SECRET is not set. Add it to your .env file and restart the server.'
  );
}

/* ── Password validation ─────────────────────────────────────────────── */

/**
 * Regex rules (all must pass):
 *   (?=.*[a-z])        at least one lowercase letter
 *   (?=.*[A-Z])        at least one uppercase letter
 *   (?=.*\d)           at least one digit
 *   (?=.*[^A-Za-z0-9]) at least one special character
 *   .{8,}              minimum 8 characters total
 */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

/**
 * Expand a DOB string into every plausible representation a user might
 * type as their password (YYYY-MM-DD, YYYYMMDD, DD/MM/YYYY, etc.).
 *
 * @param {string|undefined} dob
 * @returns {string[]} lower-cased variants
 */
function getDobVariants(dob) {
  if (!dob) return [];

  const raw = String(dob).trim();
  if (!raw) return [];

  const compact = raw.replace(/\D/g, ''); // strip all non-digits → "19901231"
  const variants = new Set([raw, compact]);

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const year  = String(parsed.getUTCFullYear());
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const day   = String(parsed.getUTCDate()).padStart(2, '0');

    // ISO and common formats
    variants.add(`${year}-${month}-${day}`);
    variants.add(`${year}${month}${day}`);
    variants.add(`${day}/${month}/${year}`);
    variants.add(`${month}/${day}/${year}`);
    variants.add(`${day}-${month}-${year}`);
    variants.add(year);           // just the year
    variants.add(`${day}${month}${year}`);
  }

  return [...variants].map((v) => v.toLowerCase());
}

/**
 * Classify password strength for informational feedback.
 * This is purely UX — validation still uses PASSWORD_REGEX.
 *
 * @param {string} password
 * @returns {'WEAK'|'MEDIUM'|'STRONG'}
 */
function classifyPasswordStrength(password = '') {
  const checks = [
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ];
  const complexity = checks.filter(Boolean).length;

  if (password.length >= 12 && complexity === 4) return 'STRONG';
  if (password.length >= 8  && complexity >= 3)  return 'MEDIUM';
  return 'WEAK';
}

/**
 * Validate a candidate password against all security rules.
 *
 * @param {object} opts
 * @param {string}           opts.password   The raw password to validate
 * @param {string|undefined} opts.username   Compared case-insensitively
 * @param {string|undefined} opts.email      Prefix (before @) compared
 * @param {string|undefined} opts.dob        Date-of-birth string
 * @param {string|undefined} opts.name       Full name compared
 *
 * @returns {{ valid: boolean, error: string|null, strength: string }}
 */
function validatePassword({ password, username, email, dob, name }) {
  const pwd = String(password || '').trim();

  /* 1. Format / complexity */
  if (!PASSWORD_REGEX.test(pwd)) {
    return {
      valid: false,
      error:
        'Password must be at least 8 characters and include an uppercase letter, ' +
        'a lowercase letter, a number, and a special character.',
      strength: 'WEAK'
    };
  }

  const lowerPwd = pwd.toLowerCase();

  /* 2. Must not equal username */
  if (username && lowerPwd === username.toLowerCase()) {
    return { valid: false, error: 'Password must not match your username.', strength: 'WEAK' };
  }

  /* 3. Must not equal email local-part */
  if (email) {
    const localPart = email.split('@')[0].toLowerCase();
    if (lowerPwd === localPart) {
      return { valid: false, error: 'Password must not match your email.', strength: 'WEAK' };
    }
  }

  /* 4. Must not equal full name (case-insensitive, space-stripped) */
  if (name) {
    const normalizedName = name.replace(/\s+/g, '').toLowerCase();
    if (lowerPwd === normalizedName || lowerPwd === name.toLowerCase()) {
      return { valid: false, error: 'Password must not match your name.', strength: 'WEAK' };
    }
  }

  /* 5. Must not match any DOB variant */
  const dobVariants = getDobVariants(dob);
  if (dobVariants.includes(lowerPwd)) {
    return {
      valid: false,
      error: 'Password must not match your date of birth.',
      strength: 'WEAK'
    };
  }

  return { valid: true, error: null, strength: classifyPasswordStrength(pwd) };
}

/* ── bcrypt helpers ──────────────────────────────────────────────────── */

/**
 * Hash a plaintext password using bcrypt with a freshly generated salt.
 *
 * @param {string} plaintext
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, BCRYPT_SALT_ROUNDS);
}

/**
 * Securely compare a plaintext password against a stored hash.
 * Uses bcrypt.compare — timing-safe by design.
 *
 * @param {string} plaintext
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function comparePassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

/* ── JWT helpers ─────────────────────────────────────────────────────── */

/**
 * Sign a JWT containing the minimal claims needed for middleware.
 *
 * @param {{ id: string, role: string }} payload
 * @returns {string} signed JWT
 */
function signToken(payload) {
  return jwt.sign(
    { id: payload.id, role: payload.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' }
  );
}

/**
 * Verify and decode a JWT.
 * Throws `JsonWebTokenError` / `TokenExpiredError` on failure — let
 * callers decide how to handle.
 *
 * @param {string} token
 * @returns {{ id: string, role: string, iat: number, exp: number }}
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}

/* ── Exports ─────────────────────────────────────────────────────────── */

module.exports = {
  validatePassword,
  classifyPasswordStrength,
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  BCRYPT_SALT_ROUNDS,
  JWT_EXPIRES_IN
};
