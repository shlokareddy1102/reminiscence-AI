const mongoose = require('mongoose');

/**
 * User schema supporting 'patient', 'caregiver', and 'admin' roles.
 *
 * Security notes:
 *  - `password` has `select: false` — NEVER returned in queries unless
 *    explicitly opted-in with `.select('+password')`.
 *  - `dob` is stored as an original string for password-comparison purposes.
 *  - `loginAttempts` / `lockUntil` enable brute-force protection.
 */
const UserSchema = new mongoose.Schema(
  {
    /* ── Identity ─────────────────────────────────────────────────── */
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters']
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
    },

    username: {
      type: String,
      unique: true,
      sparse: true, // allows multiple docs with null username
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [
        /^[a-z0-9_]+$/,
        'Username may only contain lowercase letters, numbers, and underscores'
      ]
    },

    dob: {
      type: String, // stored as the original string for comparison; never used for date arithmetic
      trim: true
    },

    /* ── Auth ─────────────────────────────────────────────────────── */
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false // NEVER returned by default — must use .select('+password')
    },

    /* ── Role & relations ─────────────────────────────────────────── */
    role: {
      type: String,
      enum: {
        values: ['patient', 'caregiver', 'admin'],
        message: "Role must be 'patient', 'caregiver', or 'admin'"
      },
      required: [true, 'Role is required']
    },

    // Populated only when role === 'patient'
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      default: null
    },

    // Populated only when role === 'caregiver'
    caregiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    /* ── Brute-force protection ────────────────────────────────────── */
    loginAttempts: {
      type: Number,
      default: 0,
      select: false
    },

    lockUntil: {
      type: Date,
      default: null,
      select: false
    },

    /* ── Lifecycle ────────────────────────────────────────────────── */
    isActive: {
      type: Boolean,
      default: true
    },

    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true // adds createdAt + updatedAt
  }
);

/* ── Indexes ─────────────────────────────────────────────────────────── */
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ role: 1 });

/* ── Virtual: is the account currently locked? ───────────────────────── */
UserSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

/* ── Safe public representation (never exposes sensitive fields) ─────── */
UserSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    username: this.username || null,
    role: this.role,
    patientId: this.patientId || null,
    caregiverId: this.caregiverId || null,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', UserSchema);
