import { useEffect, useMemo, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { io } from 'socket.io-client';
import { API_BASE_URL, api } from '../lib/api';
import { SimpleTracker } from './tracker';

const VOICE_PHRASES = ['i took it', 'i have taken my medicine', 'done'];

const reassuranceMessages = [
  'You are at home. Everything is okay.',
  'You are safe. Your caregiver is connected.',
  'Take your time. You are doing well today.'
];

const formatTime = (date) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);

const formatDate = (date) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(date);

const toBbox = (detection) => {
  const box = detection.boundingBox;
  if (!box) return null;
  const x1 = Math.max(0, Math.floor(box.originX));
  const y1 = Math.max(0, Math.floor(box.originY));
  const x2 = Math.max(x1 + 1, Math.floor(box.originX + box.width));
  const y2 = Math.max(y1 + 1, Math.floor(box.originY + box.height));
  return [x1, y1, x2, y2];
};

const iou = (a, b) => {
  const xA = Math.max(a[0], b[0]);
  const yA = Math.max(a[1], b[1]);
  const xB = Math.min(a[2], b[2]);
  const yB = Math.min(a[3], b[3]);
  const inter = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const areaA = Math.max(1, (a[2] - a[0]) * (a[3] - a[1]));
  const areaB = Math.max(1, (b[2] - b[0]) * (b[3] - b[1]));
  return inter / (areaA + areaB - inter);
};

const bboxToBase64 = (video, bbox) => {
  const [x1, y1, x2, y2] = bbox;
  const w = x2 - x1;
  const h = y2 - y1;
  const padX = w * 0.25;
  const padY = h * 0.25;
  const px1 = Math.max(0, Math.floor(x1 - padX));
  const py1 = Math.max(0, Math.floor(y1 - padY));
  const px2 = Math.min(video.videoWidth, Math.ceil(x2 + padX));
  const py2 = Math.min(video.videoHeight, Math.ceil(y2 + padY));
  const paddedW = px2 - px1;
  const paddedH = py2 - py1;
  const canvas = document.createElement('canvas');
  const size = Math.max(256, Math.max(paddedW, paddedH));
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 0, size, size);
  const offsetX = (size - paddedW) / 2;
  const offsetY = (size - paddedH) / 2;
  ctx.drawImage(video, px1, py1, paddedW, paddedH, offsetX, offsetY, paddedW, paddedH);
  return canvas.toDataURL('image/jpeg', 0.8);
};

// ─── Unknown Face Alert Overlay ───────────────────────────────────────────────
const UnknownFaceAlert = ({ face, onNotify, onDismiss }) => {
  const [status, setStatus] = useState('idle');

  const handleNotify = () => {
    setStatus('notifying');
    onNotify();
    setTimeout(() => {
      setStatus('done');
      setTimeout(() => onDismiss(), 2500);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: 'linear-gradient(145deg, #1e293b, #0f172a)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Warning strip */}
        <div className="bg-amber-500 px-6 py-3 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <p className="font-bold text-amber-950 text-sm tracking-wide uppercase">
            Unfamiliar person detected
          </p>
        </div>

        {/* Face image */}
        <div className="relative mx-6 mt-6 rounded-2xl overflow-hidden border-4 border-amber-400/40 shadow-lg">
          <img src={face.image} alt="Unknown visitor" className="w-full h-56 object-cover" />
          <div className="absolute inset-0 rounded-2xl border-4 border-amber-400 animate-pulse opacity-40 pointer-events-none" />
          <div className="absolute bottom-3 left-3 bg-black/60 rounded-full px-3 py-1 text-xs text-amber-300 font-semibold">
            {new Date(face.timestamp).toLocaleTimeString()}
          </div>
        </div>

        {/* Message */}
        <div className="px-6 py-5 text-center">
          <p className="text-white text-lg font-semibold leading-snug">Do you recognise this person?</p>
          <p className="text-slate-400 text-sm mt-1">If you don't know them, let your caregiver know.</p>
        </div>

        {/* Actions */}
        {status === 'idle' && (
          <div className="px-6 pb-6 flex flex-col gap-3">
            <button
              onClick={handleNotify}
              className="w-full rounded-2xl bg-red-500 hover:bg-red-600 active:scale-95 transition-all py-4 font-bold text-white text-base shadow-lg shadow-red-900/40"
            >
              🚨 I don't know them — Alert caregiver
            </button>
            <button
              onClick={onDismiss}
              className="w-full rounded-2xl bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all py-4 font-semibold text-slate-200 text-base"
            >
              ✅ It's okay, I know them
            </button>
          </div>
        )}

        {status === 'notifying' && (
          <div className="px-6 pb-8 text-center">
            <div className="inline-flex items-center gap-3 text-amber-400 font-semibold text-base">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Notifying your caregiver...
            </div>
          </div>
        )}

        {status === 'done' && (
          <div className="px-6 pb-8 text-center">
            <p className="text-green-400 font-bold text-lg">✓ Caregiver has been notified!</p>
            <p className="text-slate-400 text-sm mt-1">They will check on you shortly.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Known Person Card Overlay ─────────────────────────────────────────────────
const KnownPersonCard = ({ person, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000); // auto-dismiss after 8s
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-10 px-4 pointer-events-none">
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl pointer-events-auto"
        style={{ background: 'linear-gradient(145deg, #0f2027, #1a3a2a)', border: '1px solid rgba(52,211,153,0.3)' }}
      >
        {/* Green top strip */}
        <div className="bg-emerald-500 px-6 py-3 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <p className="font-bold text-emerald-950 text-sm tracking-wide uppercase">Person Recognised</p>
        </div>

        <div className="flex gap-5 p-6 items-center">
          {/* Photo */}
          <img
            src={person.photo}
            alt={person.name}
            className="h-24 w-24 rounded-2xl object-cover border-4 border-emerald-400/40 flex-shrink-0"
          />
          {/* Info */}
          <div>
            <p className="text-3xl font-bold text-white">{person.name}</p>
            <p className="text-emerald-300 text-lg mt-1">{person.relationship}</p>
            <p className="text-slate-400 text-sm mt-2">
              Last visited:{' '}
              {person.lastVisitedTime
                ? new Date(person.lastVisitedTime).toLocaleDateString()
                : 'First visit today!'}
            </p>
            {person.notes && (
              <p className="text-slate-300 text-sm mt-1 italic">"{person.notes}"</p>
            )}
          </div>
        </div>

        <div className="px-6 pb-5">
          <button
            onClick={onDismiss}
            className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all py-3 font-bold text-white text-base"
          >
            Got it 👍
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────
const PatientScreen = () => {
  const [patient, setPatient] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [knownPeople, setKnownPeople] = useState([]);
  const [trackedFaces, setTrackedFaces] = useState([]);
  const [now, setNow] = useState(new Date());
  const [detectorReady, setDetectorReady] = useState(false);
  const [faceStatus, setFaceStatus] = useState('Checking presence...');
  const [lastFaceSeen, setLastFaceSeen] = useState(Date.now());
  const [listening, setListening] = useState(false);
  const [recognitionBusy, setRecognitionBusy] = useState(false);

  // Overlay states
  const [unknownFaceAlert, setUnknownFaceAlert] = useState(null); // { image, timestamp, trackId }
  const [knownPersonCard, setKnownPersonCard] = useState(null);   // person object

  const webcamRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const detectorRef = useRef(null);
  const trackerRef = useRef(new SimpleTracker(85));
  const trackIdToNameRef = useRef({});
  const lastVisitedSentAtRef = useRef({});
  const inactivityLoggedAtRef = useRef(0);
  const lastFaceEventAtRef = useRef(0);
  const lastReminderSpokenTaskRef = useRef(null);
  const recognitionRef = useRef(null);
  const socketRef = useRef(null);
  const unknownFacesSentRef = useRef({});

  const activeTask = useMemo(() => {
    return tasks
      .filter((t) => t.status === 'pending' && new Date(t.scheduledTime).getTime() <= Date.now())[0] || null;
  }, [tasks]);

  const reassurance = useMemo(() => reassuranceMessages[now.getMinutes() % reassuranceMessages.length], [now]);

  const timeAwareGreeting = useMemo(() => {
    const hour = now.getHours();
    const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now);
    return `${salutation}. Today is ${day}.`;
  }, [now]);

  const speak = (text) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };

  const refreshPatientAndTasks = async () => {
    const patientRes = await api.get('/api/patient');
    const patientData = patientRes.data;
    setPatient(patientData);
    const [taskRes, knownPeopleRes] = await Promise.all([
      api.get('/api/tasks', { params: { patientId: patientData._id } }),
      api.get('/api/known-people', { params: { patientId: patientData._id } })
    ]);
    setTasks(taskRes.data);
    setKnownPeople(knownPeopleRes.data);
  };

  const markTaskComplete = async (taskId, confirmedBy) => {
    await api.post('/api/tasks/complete', { taskId, confirmedBy });
    await refreshPatientAndTasks();
  };

  const drawOverlay = (faces) => {
    const canvas = overlayCanvasRef.current;
    const video = webcamRef.current?.video;
    if (!canvas || !video) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    faces.forEach((face) => {
      const [x1, y1, x2, y2] = face.bbox;
      ctx.strokeStyle = face.name === 'Unknown' ? '#f97316' : '#16a34a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      const label = face.name === 'Unknown' ? 'Unknown' : `${face.name} (${face.relationship})`;
      ctx.fillStyle = face.name === 'Unknown' ? '#7c2d12' : '#14532d';
      ctx.fillRect(x1, Math.max(0, y1 - 24), ctx.measureText(label).width + 14, 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px sans-serif';
      ctx.fillText(label, x1 + 6, Math.max(15, y1 - 8));
    });
  };

  useEffect(() => {
    refreshPatientAndTasks();
    const timer = setInterval(() => setNow(new Date()), 1000);
    const taskPoll = setInterval(refreshPatientAndTasks, 15000);
    return () => { clearInterval(timer); clearInterval(taskPoll); };
  }, []);

  useEffect(() => {
    if (!patient?._id) return;
    socketRef.current = io(API_BASE_URL);
    socketRef.current.emit('join-patient-room', patient._id);
    return () => socketRef.current?.disconnect();
  }, [patient?._id]);

  useEffect(() => {
    const setup = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
      detectorRef.current = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
        },
        runningMode: 'VIDEO'
      });
      setDetectorReady(true);
    };
    setup().catch(() => setFaceStatus('Face detection unavailable'));
  }, []);

  useEffect(() => {
    if (!patient || !detectorReady) return;
    const interval = setInterval(async () => {
      const video = webcamRef.current?.video;
      if (!video || video.readyState < 2 || !detectorRef.current) return;
      const detections = detectorRef.current.detectForVideo(video, Date.now());
      const count = detections.detections?.length || 0;
      if (count > 0) {
        setLastFaceSeen(Date.now());
        setFaceStatus(count > 1 ? 'Multiple faces detected' : 'Face detected');
        if (Date.now() - lastFaceEventAtRef.current > 30000) {
          lastFaceEventAtRef.current = Date.now();
          await api.post('/api/activity', { patientId: patient._id, interactionType: 'face_detected' });
        }
      } else {
        setFaceStatus('No face currently detected');
      }
      const inactiveMs = Date.now() - lastFaceSeen;
      if (inactiveMs > 90_000 && Date.now() - inactivityLoggedAtRef.current > 90_000) {
        inactivityLoggedAtRef.current = Date.now();
        await api.post('/api/activity', { patientId: patient._id, interactionType: 'inactivity' });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [patient, detectorReady, lastFaceSeen]);

  // Auto-detect every 20 seconds
  useEffect(() => {
    if (!patient || !detectorReady) return;
    const autoDetectInterval = setInterval(() => {
      detectKnownPerson().catch((err) => console.warn('Auto-detect failed:', err));
    }, 20000);
    return () => clearInterval(autoDetectInterval);
  }, [patient, detectorReady]);

  useEffect(() => {
    if (!activeTask) { lastReminderSpokenTaskRef.current = null; return; }
    if (lastReminderSpokenTaskRef.current !== activeTask._id) {
      lastReminderSpokenTaskRef.current = activeTask._id;
      speak(`It's time for your task. ${activeTask.title}.`);
    }
  }, [activeTask]);

  useEffect(() => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = async (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
      const matched = VOICE_PHRASES.some((phrase) => transcript.includes(phrase));
      if (matched && activeTask) await markTaskComplete(activeTask._id, 'voice');
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => { if (listening) recognition.start(); };
    recognitionRef.current = recognition;
  }, [activeTask, listening]);

  useEffect(() => {
    if (!recognitionRef.current) return;
    if (listening) recognitionRef.current.start();
    else recognitionRef.current.stop();
    return () => recognitionRef.current?.stop();
  }, [listening]);

  const detectKnownPerson = async () => {
    const video = webcamRef.current?.video;
    if (!video || !detectorRef.current) return;

    const detections = detectorRef.current.detectForVideo(video, Date.now());
    const boxes = (detections.detections || []).map(toBbox).filter(Boolean);

    if (boxes.length === 0) {
      setTrackedFaces([]);
      drawOverlay([]);
      return;
    }

    setRecognitionBusy(true);

    try {
      const recognitionCandidates = [];

      for (const bbox of boxes) {
        const imageBase64 = bboxToBase64(video, bbox);
        try {
          const response = await api.post('/api/known-people/recognize', {
            image: imageBase64, top_k: 1, threshold: 0.6
          });
          const matches = response.data.matches || [];
          const bestMatch = matches[0] || null;
          const person = bestMatch ? (knownPeople.find(p => p._id === bestMatch.person_id) || null) : null;
          console.log('[Recognition] bbox', bbox, 'bestMatch', bestMatch, 'resolved person', person);
          recognitionCandidates.push({ bbox, person, score: bestMatch?.confidence || 0 });
        } catch (err) {
          console.log('[Recognition] request failed', err);
          recognitionCandidates.push({ bbox, person: null, score: 0 });
        }
      }

      const tracks = trackerRef.current.update(boxes);
      const nextTracked = [];

      for (const [trackId, bbox] of Object.entries(tracks)) {
        let matchedCandidate = null;
        let bestIou = 0;
        for (const candidate of recognitionCandidates) {
          const score = iou(bbox, candidate.bbox);
          if (score > bestIou) { bestIou = score; matchedCandidate = candidate; }
        }

        if (matchedCandidate?.person) {
          trackIdToNameRef.current[trackId] = matchedCandidate.person;
        } else {
          delete trackIdToNameRef.current[trackId];
        }

        const currentPerson = matchedCandidate?.person || null;

        if (currentPerson) {
          const lastSent = lastVisitedSentAtRef.current[currentPerson._id] || 0;
          if (Date.now() - lastSent > 60000) {
            lastVisitedSentAtRef.current[currentPerson._id] = Date.now();
            const updated = await api.put(`/api/known-people/${currentPerson._id}/mark-visited`);
            const updatedPerson = updated.data;
            trackIdToNameRef.current[trackId] = updatedPerson;
            setKnownPeople((prev) => prev.map((p) => (p._id === updatedPerson._id ? updatedPerson : p)));

            // ✅ Show known person card overlay
            setKnownPersonCard({ ...updatedPerson });
            speak(`This is ${updatedPerson.name}, your ${updatedPerson.relationship}.`);
          }
        }

        nextTracked.push({
          trackId, bbox,
          name: currentPerson?.name || 'Unknown',
          relationship: currentPerson?.relationship || '',
          lastVisitedTime: currentPerson?.lastVisitedTime || null,
          score: matchedCandidate?.score || 0
        });
      }

      setTrackedFaces(nextTracked);
      drawOverlay(nextTracked);

      // ⚠️ Handle unknown faces — show alert on patient screen
      const unknownFaces = nextTracked.filter((f) => f.name === 'Unknown');
      if (unknownFaces.length > 0) console.log('[Unknown detection] faces', unknownFaces);
      for (const unknownFace of unknownFaces) {
        const trackId = unknownFace.trackId;
        const lastSent = unknownFacesSentRef.current[trackId] || 0;
        if (Date.now() - lastSent > 30000) {
          unknownFacesSentRef.current[trackId] = Date.now();
          try {
            const imageBase64 = bboxToBase64(video, unknownFace.bbox);
            console.log('[Unknown detection] emitting', trackId);

            // Show overlay on patient screen
            setUnknownFaceAlert({
              image: imageBase64,
              timestamp: new Date(),
              trackId
            });

            // Also notify caregiver via socket (caregiver dashboard picks this up)
            if (socketRef.current && patient?._id) {
              socketRef.current.emit('unknownFaceDetected', {
                patientId: patient._id,
                trackId,
                image: imageBase64,
                timestamp: new Date()
              });
            }
          } catch (error) {
            console.error('Failed to capture unknown face:', error);
          }
        }
      }
    } finally {
      setRecognitionBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-8 text-slate-900">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="rounded-3xl bg-blue-100 p-8 shadow-sm border border-blue-200">
          <p className="text-2xl text-blue-600">{timeAwareGreeting}</p>
          <h1 className="mt-2 text-5xl font-semibold text-slate-900">{formatTime(now)}</h1>
          <p className="mt-2 text-2xl text-slate-700">{formatDate(now)}</p>
          <p className="mt-6 text-lg text-slate-600 italic">{reassurance}</p>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Camera + Face Detection */}
          <section className="rounded-3xl bg-slate-50 p-6 shadow-sm border border-slate-200">
            <h2 className="text-2xl font-semibold text-slate-900">Presence Monitor</h2>
            <p className="mt-2 text-lg text-slate-600">{faceStatus}</p>
            <div className="relative mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <Webcam
                ref={webcamRef}
                audio={false}
                mirrored
                className="h-72 w-full object-cover"
                screenshotFormat="image/jpeg"
              />
              <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>

            <button
              className={`mt-4 rounded-xl px-5 py-3 text-lg font-medium text-white transition ${
                listening ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
              onClick={() => setListening((prev) => !prev)}
            >
              {listening ? 'Stop Voice Listening' : 'Start Voice Listening'}
            </button>

            <button
              className="mt-3 w-full rounded-xl bg-slate-700 px-5 py-3 text-lg font-medium text-white hover:bg-slate-800 transition disabled:opacity-50"
              onClick={detectKnownPerson}
              disabled={recognitionBusy}
            >
              {recognitionBusy ? 'Detecting...' : '🔍 Detect Who Is Here'}
            </button>

            {/* Tracked faces list */}
            {trackedFaces.length > 0 && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-600">Tracked Faces</p>
                <div className="mt-2 space-y-2">
                  {trackedFaces.map((face) => (
                    <div key={`${face.trackId}-${face.name}`} className={`rounded-lg p-2 text-sm font-medium ${face.name === 'Unknown' ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {face.name === 'Unknown' ? '⚠️ Unknown Person' : `✅ ${face.name}`}
                      {face.relationship ? ` — ${face.relationship}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Tasks */}
          <section className="rounded-3xl bg-slate-50 p-6 shadow-sm border border-slate-200">
            <h2 className="text-2xl font-semibold text-slate-900">Today's Tasks</h2>
            <div className="mt-4 space-y-3">
              {tasks.map((task) => (
                <div key={task._id} className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition">
                  <p className="text-xl font-medium text-slate-900">{task.title}</p>
                  <p className="text-slate-600">{task.type} • {new Date(task.scheduledTime).toLocaleTimeString()}</p>
                  <p className={`mt-1 text-sm uppercase tracking-wide font-semibold ${task.status === 'completed' ? 'text-emerald-600' : 'text-blue-600'}`}>{task.status}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Known People */}
        <section className="mt-6 rounded-3xl bg-slate-50 p-6 shadow-sm border border-slate-200">
          <h2 className="text-2xl font-semibold text-slate-900">People You Might Know</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {knownPeople.map((person) => (
              <div key={person._id} className="rounded-2xl border border-slate-200 bg-white p-3 hover:shadow-md transition">
                <img src={person.photo} alt={person.name} className="h-32 w-full rounded-xl object-cover" />
                <p className="mt-2 text-lg font-semibold text-slate-900">{person.name}</p>
                <p className="text-slate-600">{person.relationship}</p>
                <p className="text-xs text-slate-500">
                  Visited: {person.lastVisitedTime ? new Date(person.lastVisitedTime).toLocaleString() : 'Not yet'}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Task Reminder Modal ── */}
      {activeTask && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/65 p-6">
          <div className="w-full max-w-2xl rounded-lg bg-white p-10 text-center shadow-2xl border border-blue-200">
            <p className="text-xl text-blue-600 font-semibold">Task Reminder</p>
            <h3 className="mt-3 text-4xl font-semibold text-slate-900">It's time for your task</h3>
            <p className="mt-4 text-2xl text-slate-800">{activeTask.title}</p>
            <button
              className="mt-8 rounded-lg bg-emerald-600 px-10 py-5 text-3xl font-semibold text-white hover:bg-emerald-700 transition"
              onClick={() => markTaskComplete(activeTask._id, 'button')}
            >
              I've taken it
            </button>
          </div>
        </div>
      )}

      {/* ── Unknown Face Alert Overlay (z-50, above task modal) ── */}
      {unknownFaceAlert && (
        <UnknownFaceAlert
          face={unknownFaceAlert}
          onNotify={() => {
            // Socket already emitted in detectKnownPerson above.
            // This callback can be used for extra logging if needed.
          }}
          onDismiss={() => setUnknownFaceAlert(null)}
        />
      )}

      {/* ── Known Person Card (slides up from bottom) ── */}
      {knownPersonCard && !unknownFaceAlert && (
        <KnownPersonCard
          person={knownPersonCard}
          onDismiss={() => setKnownPersonCard(null)}
        />
      )}
    </div>
  );
};

export default PatientScreen;