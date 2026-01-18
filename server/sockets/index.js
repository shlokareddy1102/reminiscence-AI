
Copy

/**
 * sockets/index.js
 * Handles all Socket.IO room registration and event forwarding.
 * Caches the last 10 unknown faces per patient so caregivers who
 * connect after the event still receive them.
 */

// In-memory store: patientId → array of recent unknown face payloads
const unknownFaceCache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // keep entries for 5 minutes
const MAX_CACHED = 10;

const registerSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // ── Room joins ────────────────────────────────────────────────────────────

    socket.on('join-patient-room', (patientId) => {
      socket.join(`patient-${patientId}`);
      console.log(`🏠 Patient joined room: patient-${patientId}`);
    });

    socket.on('join-caregiver-room', (patientId) => {
      socket.join(`caregiver-${patientId}`);
      console.log(`👩‍⚕️ Caregiver joined room: caregiver-${patientId}`);

      // Replay any cached unknown faces the caregiver may have missed
      const cached = unknownFaceCache[patientId] || [];
      const now = Date.now();
      const fresh = cached.filter((f) => now - new Date(f.timestamp).getTime() < CACHE_TTL_MS);
      unknownFaceCache[patientId] = fresh; // prune stale entries

      if (fresh.length > 0) {
        console.log(`[Cache] Replaying ${fresh.length} cached unknown face(s) to new caregiver for patient ${patientId}`);
        fresh.forEach((face) => socket.emit('unknownFaceDetected', face));
      }
    });

    // ── Unknown face detected (patient → caregiver) ───────────────────────────

    socket.on('unknownFaceDetected', (data) => {
      const { patientId, trackId, image, timestamp } = data;
      console.log(`🚨 Unknown face detected for patient ${patientId}, trackId: ${trackId}`);

      const payload = { patientId, trackId, image, timestamp };

      // Cache it so late-joining caregivers get it too
      if (!unknownFaceCache[patientId]) unknownFaceCache[patientId] = [];
      // Avoid duplicate trackIds
      const alreadyCached = unknownFaceCache[patientId].some((f) => f.trackId === trackId);
      if (!alreadyCached) {
        unknownFaceCache[patientId] = [payload, ...unknownFaceCache[patientId]].slice(0, MAX_CACHED);
      }

      // Check how many caregivers are connected right now
      const room = io.sockets.adapter.rooms.get(`caregiver-${patientId}`);
      const roomSize = room ? room.size : 0;
      console.log(`[Socket] Forwarding unknownFaceDetected to caregiver-${patientId} (${roomSize} connected)`);

      io.to(`caregiver-${patientId}`).emit('unknownFaceDetected', payload);
    });

    // ── Caregiver dismisses a cached unknown face ─────────────────────────────
    socket.on('dismissUnknownFace', ({ patientId, trackId }) => {
      if (unknownFaceCache[patientId]) {
        unknownFaceCache[patientId] = unknownFaceCache[patientId].filter((f) => f.trackId !== trackId);
      }
    });

    // ── Caregiver adds an unknown visitor (caregiver → patient) ───────────────
    socket.on('addUnknownVisitor', (data) => {
      const { patientId, visitorId, name, image } = data;
      console.log(`✅ Caregiver adding visitor for patient ${patientId}: ${visitorId} (${name})`);

      // Remove from cache since it's now identified
      if (unknownFaceCache[patientId]) {
        unknownFaceCache[patientId] = unknownFaceCache[patientId].filter((f) => f.image !== image);
      }

      io.to(`patient-${patientId}`).emit('unknownVisitorAdded', { visitorId, name, image });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────

    socket.on('disconnect', () => {
      console.log(`❌ Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = registerSocketHandlers;