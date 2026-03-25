/**
 * services/authService.js
 *
 * All business logic for user registration and login.
 * Routes call these functions; they are not Express handlers themselves
 * (no req/res) which makes them independently testable.
 *
 * Brute-force policy:
 *   - After MAX_LOGIN_ATTEMPTS failed logins the account is locked for
 *     LOCK_DURATION_MS milliseconds.
 *   - Successful login resets the counter and clears the lock.
 */

const User    = require('../models/User');
const Patient = require('../models/Patient');
const {
  validatePassword,
  hashPassword,
  comparePassword,
  signToken
} = require('../config/auth');

/* ── Brute-force constants ───────────────────────────────────────────── */
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS   = 15 * 60 * 1000; // 15 minutes

/* ── register ────────────────────────────────────────────────────────── */

/**
 * Register a new user.
 *
 * @param {object} data
 * @param {string}           data.name
 * @param {string}           data.email
 * @param {string}           data.password
 * @param {string}           data.role          'patient' | 'caregiver' | 'admin'
 * @param {string|undefined} data.username
 * @param {string|undefined} data.dob
 * @param {string|undefined} data.caregiverId   Required when role === 'patient'
 *
 * @returns {Promise<{ token: string, user: object, passwordStrength: string }>}
 * @throws  {Error}  with a human-readable `.message` and optional `.statusCode`
 */
async function register(data) {
  const {
    name,
    email,
    password,
    role,
    username,
    dob,
    caregiverId
  } = data;

  /* ── 1. Normalise inputs ──────────────────────────────────────────── */
  const normalizedEmail    = (email    || '').trim().toLowerCase();
  const normalizedPassword = (password || '').trim();
  const normalizedUsername = (username || normalizedEmail.split('@')[0] || name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_'); // coerce to allowed chars

  /* ── 2. Validate required fields ─────────────────────────────────── */
  if (!name || !normalizedEmail || !normalizedPassword || !role) {
    const err = new Error('name, email, password, and role are all required.');
    err.statusCode = 400;
    throw err;
  }

  const validRoles = ['patient', 'caregiver', 'admin'];
  if (!validRoles.includes(role)) {
    const err = new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}.`);
    err.statusCode = 400;
    throw err;
  }

  /* ── 3. Password validation ──────────────────────────────────────── */
  const { valid, error: pwError, strength } = validatePassword({
    password: normalizedPassword,
    username: normalizedUsername,
    email:    normalizedEmail,
    dob,
    name
  });

  if (!valid) {
    const err = new Error(pwError);
    err.statusCode = 400;
    throw err;
  }

  /* ── 4. Duplicate checks ─────────────────────────────────────────── */
  const existingEmail = await User.findOne({ email: normalizedEmail });
  if (existingEmail) {
    const err = new Error('An account with this email already exists.');
    err.statusCode = 409;
    throw err;
  }

  if (normalizedUsername) {
    const existingUsername = await User.findOne({ username: normalizedUsername });
    if (existingUsername) {
      const err = new Error('This username is already taken. Please choose another.');
      err.statusCode = 409;
      throw err;
    }
  }

  /* ── 5. Hash password ────────────────────────────────────────────── */
  const hashedPassword = await hashPassword(normalizedPassword);

  /* ── 6. Create user ──────────────────────────────────────────────── */
  const user = await User.create({
    name:     name.trim(),
    email:    normalizedEmail,
    username: normalizedUsername || undefined,
    dob:      dob               || undefined,
    password: hashedPassword,
    role
  });

  /* ── 7. Create Patient record when role === 'patient' ────────────── */
  if (role === 'patient') {
    if (!caregiverId) {
      // Patient must be linked to a caregiver — clean up the created user and reject
      await User.findByIdAndDelete(user._id);
      const err = new Error('caregiverId is required when registering a patient.');
      err.statusCode = 400;
      throw err;
    }

    const caregiver = await User.findOne({ _id: caregiverId, role: 'caregiver' });
    if (!caregiver) {
      await User.findByIdAndDelete(user._id);
      const err = new Error('The provided caregiverId does not match an existing caregiver.');
      err.statusCode = 400;
      throw err;
    }

    const patient = await Patient.create({
      userId:      user._id,
      caregiverId: caregiver._id,
      name:        user.name,
      age:         0 // caregiver should update this via the patient profile endpoint
    });

    user.patientId   = patient._id;
    user.caregiverId = caregiver._id;
    await user.save();
  }

  /* ── 8. Issue token ──────────────────────────────────────────────── */
  const token = signToken({ id: user._id, role: user.role });

  return {
    token,
    user: user.toPublicJSON(),
    passwordStrength: strength
  };
}

/* ── login ───────────────────────────────────────────────────────────── */

/**
 * Authenticate an existing user.
 *
 * @param {object} data
 * @param {string} data.email
 * @param {string} data.password
 *
 * @returns {Promise<{ token: string, user: object }>}
 * @throws  {Error}  with human-readable `.message` and `.statusCode`
 */
async function login(data) {
  const { email, password } = data;

  const normalizedEmail    = (email    || '').trim().toLowerCase();
  const normalizedPassword = (password || '').trim();

  if (!normalizedEmail || !normalizedPassword) {
    const err = new Error('Email and password are required.');
    err.statusCode = 400;
    throw err;
  }

  /* ── 1. Find user (include fields hidden by default) ─────────────── */
  const user = await User.findOne({ email: normalizedEmail }).select(
    '+password +loginAttempts +lockUntil'
  );

  // Always run bcrypt to prevent user-enumeration via timing differences
  const dummyHash = '$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  if (!user) {
    await comparePassword(normalizedPassword, dummyHash); // timing equaliser
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  /* ── 2. Account status checks ────────────────────────────────────── */
  if (!user.isActive) {
    const err = new Error('This account has been deactivated. Please contact support.');
    err.statusCode = 403;
    throw err;
  }

  /* ── 3. Brute-force lock check ───────────────────────────────────── */
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
    const err = new Error(
      `Account temporarily locked due to too many failed attempts. ` +
      `Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`
    );
    err.statusCode = 429;
    throw err;
  }

  /* ── 4. Verify password ──────────────────────────────────────────── */
  const isMatch = await comparePassword(normalizedPassword, user.password);

  if (!isMatch) {
    /* Increment failure counter */
    user.loginAttempts += 1;

    if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
      user.loginAttempts = 0; // reset so the next window starts fresh
    }

    await user.save();

    const attemptsLeft = MAX_LOGIN_ATTEMPTS - user.loginAttempts;
    const err = new Error(
      attemptsLeft > 0
        ? `Invalid email or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining before lockout.`
        : 'Account locked due to too many failed attempts. Try again in 15 minutes.'
    );
    err.statusCode = 401;
    throw err;
  }

  /* ── 5. Reset brute-force counters on success ────────────────────── */
  if (user.loginAttempts > 0 || user.lockUntil) {
    user.loginAttempts = 0;
    user.lockUntil     = null;
  }
  user.lastLoginAt = new Date();
  await user.save();

  /* ── 6. Issue token ──────────────────────────────────────────────── */
  const token = signToken({ id: user._id, role: user.role });

  return {
    token,
    user: user.toPublicJSON()
  };
}

/* ── Exports ─────────────────────────────────────────────────────────── */

module.exports = { register, login };
