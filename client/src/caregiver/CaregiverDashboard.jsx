import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL, api } from '../lib/api';

const CaregiverDashboard = () => {
  const [patient, setPatient] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [events, setEvents] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [knownPeople, setKnownPeople] = useState([]);
  const [unknownFaces, setUnknownFaces] = useState([]);
  const [selectedUnknownFace, setSelectedUnknownFace] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [newVisitorBadge, setNewVisitorBadge] = useState(false);

  const [unknownPersonForm, setUnknownPersonForm] = useState({ name: '', relationship: '', notes: '' });
  const [taskForm, setTaskForm] = useState({ title: '', type: 'medication', scheduledTime: '' });
  const [personForm, setPersonForm] = useState({ name: '', relationship: '', notes: '', photo: null });
  const [savingPerson, setSavingPerson] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Fetch all data ──────────────────────────────────────────────────────────
  const fetchAll = async () => {
    const patientRes = await api.get('/api/patient');
    const patientData = patientRes.data;
    setPatient(patientData);

    const [tasksRes, alertsRes, eventsRes, activityRes, knownPeopleRes] = await Promise.all([
      api.get('/api/tasks', { params: { patientId: patientData._id } }),
      api.get('/api/alerts', { params: { patientId: patientData._id } }),
      api.get('/api/events', { params: { patientId: patientData._id } }),
      api.get('/api/activity', { params: { patientId: patientData._id } }),
      api.get('/api/known-people', { params: { patientId: patientData._id } })
    ]);

    setTasks(tasksRes.data);
    setAlerts(alertsRes.data);
    setEvents(eventsRes.data);
    setActivityLogs(activityRes.data);
    setKnownPeople(knownPeopleRes.data);
  };

  useEffect(() => { fetchAll(); }, []);

  // ── Socket listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!patient?._id) return;

    const socket = io(API_BASE_URL);
    socket.emit('join-caregiver-room', patient._id);

    socket.on('taskMissed', (task) => setTasks((prev) => prev.map((t) => t._id === task._id ? task : t)));
    socket.on('taskCompleted', (task) => setTasks((prev) => prev.map((t) => t._id === task._id ? task : t)));
    socket.on('taskCreated', (task) => setTasks((prev) => [...prev, task]));
    socket.on('activityLogged', (log) => setActivityLogs((prev) => [log, ...prev].slice(0, 100)));
    socket.on('eventCreated', (event) => setEvents((prev) => [event, ...prev].slice(0, 50)));
    socket.on('knownPersonAdded', (person) => setKnownPeople((prev) => [...prev, person]));
    socket.on('knownPersonSeen', (person) => setKnownPeople((prev) => prev.map((p) => p._id === person._id ? person : p)));
    socket.on('alertGenerated', (alert) => setAlerts((prev) => [alert, ...prev].slice(0, 50)));
    socket.on('riskUpdated', ({ riskScore, currentState }) => setPatient((prev) => prev ? { ...prev, riskScore, currentState } : prev));
    socket.on('stateChanged', ({ currentState }) => setPatient((prev) => prev ? { ...prev, currentState } : prev));

    // ── Unknown face received ──
    socket.on('unknownFaceDetected', (data) => {
      console.log('[Socket] unknownFaceDetected received:', data);
      setUnknownFaces((prev) => {
        const exists = prev.some((f) => f.trackId === data.trackId);
        if (exists) return prev;
        const updated = [{ ...data, id: `${data.trackId}-${Date.now()}` }, ...prev].slice(0, 10);
        console.log('[State] unknownFaces updated to', updated);
        return updated;
      });
      // Flash badge if not already on visitors tab
      setNewVisitorBadge(true);
      if (activeTab !== 'unknown') setActiveTab('unknown');
    });

    return () => socket.disconnect();
  }, [patient?._id]);

  // Clear badge when user views the tab
  useEffect(() => {
    if (activeTab === 'unknown') setNewVisitorBadge(false);
  }, [activeTab]);

  const pendingCount = useMemo(() => tasks.filter((t) => t.status === 'pending').length, [tasks]);
  const unackAlerts = useMemo(() => alerts.filter((a) => !a.acknowledged).length, [alerts]);

  useEffect(() => {
    console.log('[UseEffect] unknownFaces is now', unknownFaces);
  }, [unknownFaces]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const acknowledge = async (alertId) => {
    const res = await api.put(`/api/alerts/${alertId}/acknowledge`);
    setAlerts((prev) => prev.map((a) => a._id === alertId ? res.data : a));
  };

  const scheduleTask = async (e) => {
    e.preventDefault();
    if (!patient?._id) return;
    const res = await api.post('/api/tasks', {
      patientId: patient._id,
      title: taskForm.title,
      type: taskForm.type,
      scheduledTime: taskForm.scheduledTime
    });
    setTasks((prev) => [...prev, res.data]);
    setTaskForm({ title: '', type: 'medication', scheduledTime: '' });
  };

  const addKnownPerson = async (e) => {
    e.preventDefault();
    if (!patient?._id || !personForm.photo) return;
    const formData = new FormData();
    formData.append('patientId', patient._id);
    formData.append('name', personForm.name);
    formData.append('relationship', personForm.relationship);
    formData.append('notes', personForm.notes);
    formData.append('photo', personForm.photo);
    const res = await api.post('/api/known-people', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    setKnownPeople((prev) => [...prev, res.data]);
    setPersonForm({ name: '', relationship: '', notes: '', photo: null });
  };

  const removeKnownPerson = async (id) => {
    await api.delete(`/api/known-people/${id}`);
    setKnownPeople((prev) => prev.filter((p) => p._id !== id));
  };

  // Save unknown face as known person
  const saveUnknownAsKnown = async (e) => {
    e.preventDefault();
    if (!selectedUnknownFace || !unknownPersonForm.name || !patient?._id) return;
    setSavingPerson(true);
    setSaveSuccess(false);

    try {
      const base64Data = selectedUnknownFace.image.split(',')[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      const file = new File([blob], 'unknown-face.jpg', { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('patientId', patient._id);
      formData.append('name', unknownPersonForm.name);
      formData.append('relationship', unknownPersonForm.relationship);
      formData.append('notes', unknownPersonForm.notes || 'Added from unknown visitor alert');
      formData.append('photo', file);

      const res = await api.post('/api/known-people', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setKnownPeople((prev) => [...prev, res.data]);
      setUnknownFaces((prev) => prev.filter((f) => f.id !== selectedUnknownFace.id));
      setSaveSuccess(true);

      setTimeout(() => {
        setSelectedUnknownFace(null);
        setUnknownPersonForm({ name: '', relationship: '', notes: '' });
        setSaveSuccess(false);
      }, 1500);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSavingPerson(false);
    }
  };

  const dismissUnknownFace = (id) => {
    setUnknownFaces((prev) => prev.filter((f) => f.id !== id));
    if (selectedUnknownFace?.id === id) setSelectedUnknownFace(null);
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'unknown', label: 'Visitors', icon: '👤', badge: unknownFaces.length },
    { id: 'tasks', label: 'Tasks', icon: '✓', badge: pendingCount },
    { id: 'people', label: 'Contacts', icon: '👥' },
    { id: 'alerts', label: 'Alerts', icon: '⚠️', badge: unackAlerts },
    { id: 'activity', label: 'Activity', icon: '📊' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">

      {/* Header */}
      <div className="border-b border-blue-300 bg-white shadow">
        <div className="mx-auto max-w-7xl px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-blue-900">Caregiver Dashboard</h1>
            {patient && <p className="mt-1 text-blue-600">Monitoring <strong>{patient.name}</strong></p>}
          </div>
          {/* Live unknown visitor notification bell */}
          {unknownFaces.length > 0 && (
            <button
              onClick={() => setActiveTab('unknown')}
              className="flex items-center gap-3 rounded-2xl bg-red-50 border-2 border-red-400 px-5 py-3 shadow-md hover:bg-red-100 transition animate-pulse"
            >
              <span className="text-2xl">🚨</span>
              <div className="text-left">
                <p className="text-sm font-bold text-red-700">Unknown Visitor Alert</p>
                <p className="text-xs text-red-500">{unknownFaces.length} unidentified person{unknownFaces.length > 1 ? 's' : ''} detected</p>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      {patient && (
        <div className="bg-blue-100 border-b border-blue-300 px-6 py-4">
          <div className="mx-auto max-w-7xl grid gap-4 md:grid-cols-4">
            {[
              { label: 'RISK SCORE', value: patient.riskScore, color: 'blue' },
              { label: 'STATUS', value: patient.currentState, color: 'cyan', small: true },
              { label: 'PENDING TASKS', value: pendingCount, color: 'purple' },
              { label: 'ALERTS', value: unackAlerts, color: 'amber' },
            ].map(({ label, value, color, small }) => (
              <div key={label} className={`bg-white rounded-lg p-4 border-l-4 border-${color}-500`}>
                <p className={`text-xs text-${color}-600 font-semibold`}>{label}</p>
                <p className={`font-bold text-${color}-900 ${small ? 'text-lg' : 'text-3xl'}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex gap-0 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-4 font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'border-teal-600 text-teal-700 bg-teal-50'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.badge > 0 && (
                  <span className={`ml-1 inline-flex items-center justify-center h-5 w-5 rounded-full text-white text-xs font-bold ${
                    tab.id === 'unknown' ? 'bg-red-600 animate-pulse' : 'bg-red-600'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* ── Overview ── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Create Task */}
              <div className="bg-white rounded-lg p-6 border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Create Task</h2>
                <form className="space-y-4" onSubmit={scheduleTask}>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Task Title</label>
                    <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent" placeholder="e.g. Take medication" value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                    <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent" value={taskForm.type} onChange={(e) => setTaskForm((p) => ({ ...p, type: e.target.value }))}>
                      <option value="medication">Medication</option>
                      <option value="appointment">Appointment</option>
                      <option value="meal">Meal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Scheduled Time</label>
                    <input type="datetime-local" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent" value={taskForm.scheduledTime} onChange={(e) => setTaskForm((p) => ({ ...p, scheduledTime: e.target.value }))} required />
                  </div>
                  <button className="w-full rounded-md bg-teal-600 py-2 font-medium text-white hover:bg-teal-700 transition">Create Task</button>
                </form>
              </div>

              {/* Add Contact */}
              <div className="bg-white rounded-lg p-6 border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Add Contact</h2>
                <form className="space-y-4" onSubmit={addKnownPerson}>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                    <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent" placeholder="Full name" value={personForm.name} onChange={(e) => setPersonForm((p) => ({ ...p, name: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Relationship</label>
                    <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent" placeholder="e.g. Son, Doctor" value={personForm.relationship} onChange={(e) => setPersonForm((p) => ({ ...p, relationship: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                    <textarea className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent" placeholder="Additional notes" value={personForm.notes} onChange={(e) => setPersonForm((p) => ({ ...p, notes: e.target.value }))} rows="2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Photo</label>
                    <input type="file" accept="image/*" className="w-full text-sm" onChange={(e) => setPersonForm((p) => ({ ...p, photo: e.target.files?.[0] || null }))} required />
                  </div>
                  <button className="w-full rounded-md bg-teal-600 py-2 font-medium text-white hover:bg-teal-700 transition">Add Contact</button>
                </form>
              </div>
            </div>

            {/* Quick unknown visitor summary if any pending */}
            {unknownFaces.length > 0 && (
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-4xl">🚨</span>
                  <div>
                    <p className="font-bold text-red-800 text-lg">
                      {unknownFaces.length} Unknown Visitor{unknownFaces.length > 1 ? 's' : ''} Detected
                    </p>
                    <p className="text-red-600 text-sm">
                      Detected at {new Date(unknownFaces[0].timestamp).toLocaleTimeString()} — Review and identify or dismiss
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('unknown')}
                  className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700 transition"
                >
                  Review Now →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Unknown Visitors Tab ── */}
        {activeTab === 'unknown' && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Unknown Visitors</h2>
                <p className="text-slate-500 text-sm mt-1">
                  {unknownFaces.length > 0
                    ? `${unknownFaces.length} unidentified person${unknownFaces.length > 1 ? 's' : ''} — identify them or skip`
                    : 'No unidentified visitors at the moment'}
                </p>
              </div>
              {unknownFaces.length > 0 && (
                <button
                  onClick={() => setUnknownFaces([])}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                  Clear All
                </button>
              )}
            </div>

            {unknownFaces.length === 0 ? (
              <div className="bg-white rounded-2xl p-16 text-center border border-slate-200">
                <p className="text-5xl mb-4">✅</p>
                <p className="text-xl font-semibold text-slate-700">All clear!</p>
                <p className="text-slate-500 mt-2">No unidentified visitors detected right now.</p>
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {unknownFaces.map((face) => (
                  <div
                    key={face.id}
                    className={`rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${
                      selectedUnknownFace?.id === face.id
                        ? 'border-red-500 shadow-lg shadow-red-100 scale-[1.02]'
                        : 'border-slate-200 bg-white hover:border-red-300 hover:shadow-md'
                    }`}
                    onClick={() => setSelectedUnknownFace(face)}
                  >
                    {/* Face photo */}
                    <div className="relative">
                      <img
                        src={face.image}
                        alt="Unknown visitor"
                        className="h-52 w-full object-cover bg-slate-200"
                      />
                      {/* Overlay badge */}
                      <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                        UNKNOWN
                      </div>
                      <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                        {new Date(face.timestamp).toLocaleTimeString()}
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="p-4 bg-white">
                      <p className="text-sm text-slate-500 mb-3">
                        Detected near patient at {new Date(face.timestamp).toLocaleTimeString()}
                      </p>
                      <div className="flex gap-2">
                        <button
                          className="flex-1 rounded-xl bg-teal-600 text-sm font-bold text-white hover:bg-teal-700 py-2.5 transition"
                          onClick={(e) => { e.stopPropagation(); setSelectedUnknownFace(face); }}
                        >
                          ✏️ Identify
                        </button>
                        <button
                          className="flex-1 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600 hover:bg-slate-200 py-2.5 transition"
                          onClick={(e) => { e.stopPropagation(); dismissUnknownFace(face.id); }}
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tasks ── */}
        {activeTab === 'tasks' && (
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">All Tasks</h2>
            <div className="space-y-3">
              {tasks.length === 0 && <p className="text-slate-500 text-center py-8">No tasks yet.</p>}
              {tasks.map((task) => (
                <div key={task._id} className={`rounded-lg border-l-4 p-4 ${
                  task.status === 'completed' ? 'border-teal-500 bg-teal-50' :
                  task.status === 'missed' ? 'border-red-500 bg-red-50' :
                  'border-slate-400 bg-slate-50'
                }`}>
                  <p className="font-semibold text-slate-900">{task.title}</p>
                  <p className="text-sm text-slate-600">{task.type} • {new Date(task.scheduledTime).toLocaleString()}</p>
                  <p className={`text-xs font-bold mt-1 uppercase ${
                    task.status === 'completed' ? 'text-teal-600' :
                    task.status === 'missed' ? 'text-red-600' : 'text-slate-500'
                  }`}>{task.status}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Contacts ── */}
        {activeTab === 'people' && (
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Known Contacts ({knownPeople.length})</h2>
            {knownPeople.length === 0 && <p className="text-slate-500 text-center py-8">No contacts added yet.</p>}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {knownPeople.map((person) => (
                <div key={person._id} className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <img src={person.photo} alt={person.name} className="h-40 w-full object-cover" />
                  <div className="p-4">
                    <p className="font-semibold text-slate-900">{person.name}</p>
                    <p className="text-sm text-slate-600">{person.relationship}</p>
                    {person.notes && <p className="text-xs text-slate-400 mt-1 italic">{person.notes}</p>}
                    <p className="text-xs text-slate-500 mt-2">Visits: {person.visitCount || 0}</p>
                    <button
                      className="mt-3 w-full rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-100 transition"
                      onClick={() => removeKnownPerson(person._id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Alerts ── */}
        {activeTab === 'alerts' && (
          <div className="space-y-3">
            {alerts.length === 0 && (
              <div className="bg-white rounded-lg p-12 text-center border border-slate-200">
                <p className="text-slate-500">No alerts yet.</p>
              </div>
            )}
            {alerts.map((alert) => (
              <div key={alert._id} className={`bg-white rounded-lg p-4 border border-slate-200 border-l-4 ${alert.acknowledged ? 'border-l-slate-300' : 'border-l-red-600'}`}>
                <p className="font-semibold text-slate-900">{alert.message}</p>
                <p className="text-sm text-slate-500">{new Date(alert.timestamp).toLocaleString()}</p>
                {!alert.acknowledged && (
                  <button
                    className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 transition"
                    onClick={() => acknowledge(alert._id)}
                  >
                    Acknowledge
                  </button>
                )}
                {alert.acknowledged && <p className="mt-1 text-xs text-slate-400 font-medium">✓ Acknowledged</p>}
              </div>
            ))}
          </div>
        )}

        {/* ── Activity ── */}
        {activeTab === 'activity' && (
          <div className="bg-white rounded-lg p-6 border border-slate-200 space-y-2">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Activity Log</h2>
            {activityLogs.length === 0 && <p className="text-slate-500 text-center py-8">No activity yet.</p>}
            {activityLogs.map((log) => (
              <div key={log._id} className="flex justify-between items-center rounded-md border border-slate-200 p-3 hover:bg-slate-50 transition">
                <p className="font-medium text-slate-900">{log.interactionType}</p>
                <p className="text-sm text-slate-500">{new Date(log.timestamp).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Identify Modal ───────────────────────────────────────────────────── */}
      {selectedUnknownFace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">

            {/* Modal header */}
            <div className="bg-gradient-to-r from-red-600 to-orange-500 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">Identify Unknown Visitor</h3>
                <p className="text-red-100 text-sm">Detected at {new Date(selectedUnknownFace.timestamp).toLocaleTimeString()}</p>
              </div>
              <button onClick={() => setSelectedUnknownFace(null)} className="text-white/70 hover:text-white text-2xl leading-none">✕</button>
            </div>

            {/* Face photo */}
            <div className="relative mx-6 mt-6 rounded-xl overflow-hidden border-4 border-slate-200">
              <img src={selectedUnknownFace.image} alt="Unknown visitor" className="w-full h-64 object-cover bg-slate-100" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
            </div>

            {/* Success state */}
            {saveSuccess ? (
              <div className="px-6 py-10 text-center">
                <p className="text-5xl mb-3">✅</p>
                <p className="text-xl font-bold text-teal-700">Person saved to contacts!</p>
                <p className="text-slate-500 text-sm mt-1">They'll be recognised next time.</p>
              </div>
            ) : (
              <form className="p-6 space-y-4" onSubmit={saveUnknownAsKnown}>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1">Full Name *</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Enter their name"
                    value={unknownPersonForm.name}
                    onChange={(e) => setUnknownPersonForm((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1">Relationship</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="e.g. Son, Doctor, Neighbour"
                    value={unknownPersonForm.relationship}
                    onChange={(e) => setUnknownPersonForm((p) => ({ ...p, relationship: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1">Notes</label>
                  <textarea
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Any extra details about this person"
                    value={unknownPersonForm.notes}
                    onChange={(e) => setUnknownPersonForm((p) => ({ ...p, notes: e.target.value }))}
                    rows="2"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => dismissUnknownFace(selectedUnknownFace.id)}
                    className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-600 hover:bg-slate-50 transition text-sm"
                  >
                    Skip — Not a concern
                  </button>
                  <button
                    type="submit"
                    disabled={savingPerson}
                    className="flex-1 rounded-xl bg-teal-600 px-4 py-3 font-bold text-white hover:bg-teal-700 transition text-sm disabled:opacity-60"
                  >
                    {savingPerson ? 'Saving...' : '✓ Save to Contacts'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CaregiverDashboard;