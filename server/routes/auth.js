const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Patient = require('../models/Patient');

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const classifyPasswordStrength = (password = '') => {
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const complexityCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

  if (password.length >= 12 && complexityCount === 4) return 'HARD';
  if (password.length >= 8 && complexityCount >= 3) return 'MEDIUM';
  return 'EASY';
};

const getDobVariants = (dob) => {
  if (!dob) return [];

  const raw = String(dob).trim();
  if (!raw) return [];

  const compact = raw.replace(/\D/g, '');
  const variants = new Set([raw, compact]);

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const year = String(parsed.getUTCFullYear());
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const day = String(parsed.getUTCDate()).padStart(2, '0');
    variants.add(`${year}-${month}-${day}`);
    variants.add(`${year}${month}${day}`);
  }

  return Array.from(variants).map((value) => value.toLowerCase());
};

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, caregiverId, username, dob } = req.body;

    const normalizedUsername = (username || email?.split('@')[0] || name || '').trim().toLowerCase();
    const normalizedPassword = String(password || '').trim();

    if (normalizedUsername && normalizedPassword.toLowerCase() === normalizedUsername) {
      return res.status(400).json({ msg: 'Password must not match username' });
    }

    const dobVariants = getDobVariants(dob);
    if (dobVariants.includes(normalizedPassword.toLowerCase())) {
      return res.status(400).json({ msg: 'Password must not match date of birth' });
    }

    if (!PASSWORD_REGEX.test(normalizedPassword)) {
      return res.status(400).json({
        msg: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character'
      });
    }

    const passwordStrength = classifyPasswordStrength(normalizedPassword);
    
    // Check if user exists
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    // Create new user
    user = new User({
      name,
      email,
      password: await bcrypt.hash(normalizedPassword, 10),
      role,
      username: normalizedUsername || undefined,
      dob: dob || undefined
    });

    await user.save();

    // If patient, create patient record
    if (role === 'patient' && caregiverId) {
      const patient = new Patient({
        userId: user._id,
        caregiverId,
        name
      });
      await patient.save();
      
      user.patientId = patient._id;
      await user.save();
    }

    // Create token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      'your_jwt_secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name,
        email,
        role,
        patientId: user.patientId || null,
        passwordStrength
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email }).select('+password');
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      'your_jwt_secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        patientId: user.patientId || null
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;