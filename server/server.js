/**
 * server.js
 *
 * Changes from the original:
 *  1. config/auth.js is imported early so it can throw if JWT_SECRET is
 *     missing — this crashes the server at startup with a clear message
 *     rather than silently accepting bad config.
 *  2. `protect` middleware is applied globally to all /api/* routes
 *     EXCEPT /api/auth and /api/health, which are intentionally public.
 *  3. bootstrapService no longer creates demo users — ensureDemoData only
 *     seeds a Patient document (no credentials).
 *  4. All other route registrations, socket setup, and CORS logic are
 *     identical to the original.
 */

// ── Load env first ────────────────────────────────────────────────────
const dotenv = require('dotenv');
dotenv.config();

// ── Import auth config early so missing JWT_SECRET crashes at startup ─
// (config/auth.js throws if JWT_SECRET is not set)
require('./config/auth');

const express  = require('express');
const cors     = require('cors');
const http     = require('http');
const { Server } = require('socket.io');

const connectDB              = require('./config/db');
const { protect }            = require('./config/middleware');
const registerSocketHandlers = require('./sockets');
const { startTaskMonitoring } = require('./services/monitoringService');
const { ensureDemoData }     = require('./services/bootstrapService');

/* ── App & HTTP server ───────────────────────────────────────────────── */

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 5001;

/* ── CORS ─────────────────────────────────────────────────────────────── */

const CLIENT_ORIGIN  = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const allowedOrigins = CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);

const corsOrigin = (origin, callback) => {
  // Allow non-browser tools (e.g. curl / Postman) that send no Origin header
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);

  // In development, permit any localhost port for convenience
  if (
    process.env.NODE_ENV !== 'production' &&
    (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))
  ) {
    return callback(null, true);
  }

  return callback(new Error(`CORS: origin '${origin}' is not allowed.`));
};

/* ── Socket.IO ────────────────────────────────────────────────────────── */

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST', 'PUT'] }
});

/* ── Express middleware ──────────────────────────────────────────────── */

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.set('io', io);
registerSocketHandlers(io);

/* ── Public routes (no auth required) ───────────────────────────────── */

app.use('/api/auth', require('./routes/auth'));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* ── Protected routes (JWT required for everything below) ────────────── */
/*
 * Applying `protect` here as a router-level middleware means every route
 * registered after this line automatically requires a valid JWT.
 * Individual routes can still be made public by registering them ABOVE
 * this line (like /api/auth and /api/health above).
 */
app.use('/api', protect);

app.use('/api/patient',      require('./routes/patient'));
app.use('/api/tasks',        require('./routes/tasks'));
app.use('/api/alerts',       require('./routes/alerts'));
app.use('/api/events',       require('./routes/events'));
app.use('/api/activity',     require('./routes/activity'));
app.use('/api/known-people', require('./routes/knownPeople'));
app.use('/api/analytics',    require('./routes/analytics'));
app.use('/api/reports',      require('./routes/reports'));
app.use('/api/calendar',     require('./routes/calendar'));
app.use('/api/location',     require('./routes/location'));

/* ── Global error handler ────────────────────────────────────────────── */

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status  = err.statusCode || err.status || 500;
  const message = err.message    || 'Internal server error';

  if (process.env.NODE_ENV !== 'production') {
    console.error('[server error]', err);
  }

  res.status(status).json({ success: false, msg: message });
});

/* ── Start ───────────────────────────────────────────────────────────── */

const startServer = async () => {
  try {
    await connectDB();
    await ensureDemoData(); // seeds Patient + Tasks only — no demo credentials
    startTaskMonitoring(io);

    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🔒 JWT auth active — all /api/* routes (except /api/auth and /api/health) are protected`);
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error.message);
    process.exit(1);
  }
};

startServer();