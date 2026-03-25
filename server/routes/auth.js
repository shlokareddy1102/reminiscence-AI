const router = require('express').Router();
const { register, login } = require('../services/authService');
const { protect } = require('../config/middleware');

router.post('/register', async (req, res) => {
  try {
    const result = await register(req.body || {});
    res.status(201).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      msg: error.message || 'Registration failed'
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const result = await login(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      msg: error.message || 'Login failed'
    });
  }
});

router.get('/me', protect, async (req, res) => {
  try {
    const user = req.user?.toPublicJSON ? req.user.toPublicJSON() : req.user;
    res.json({ user });
  } catch (error) {
    res.status(500).json({
      msg: error.message || 'Unable to fetch current user'
    });
  }
});

module.exports = router;
