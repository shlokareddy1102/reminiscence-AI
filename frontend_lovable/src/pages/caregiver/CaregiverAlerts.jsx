import { useState, useEffect, useCallback } from "react";
import CaregiverLayout from "@/components/caregiver/CaregiverLayout";
import AlertItem from "@/components/caregiver/AlertItem";
import { Bell } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { getSocket } from "@/lib/socket";

const initialAlerts = [
  {
    id: "1",
    type: "missed",
    title: "Missed appointment",
    description: "Josh did not attend the scheduled therapy session",
    time: "Yesterday, 3:00 PM",
    location: "Therapy Center",
    suggestedAction: "Reschedule appointment and set additional reminders",
    severity: "high"
  }
];

const incomingAlerts = [
  {
    type: "confusion",
    title: "Repetitive questioning detected",
    description: "Josh asked 'Where am I?' 4 times in 5 minutes",
    location: "Kitchen",
    suggestedAction: "AI Agent is playing calming audio",
    severity: "high"
  },
  {
    type: "location",
    title: "Approaching safe zone boundary",
    description: "Josh is walking toward the front gate",
    location: "Garden",
    suggestedAction: "Monitor closely, AI Agent sent voice reminder",
    severity: "medium"
  }
];

const CaregiverAlerts = () => {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [nextAlertIdx, setNextAlertIdx] = useState(0);
  const [isLive, setIsLive] = useState(true);
  const [patientId, setPatientId] = useState(null);

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const patient = await apiRequest("/api/patient");
        if (!patient?._id) return;
        setPatientId(patient._id);

        const [alertsRes, eventsRes] = await Promise.all([
          apiRequest(`/api/alerts?patientId=${patient._id}`),
          apiRequest(`/api/events?patientId=${patient._id}`)
        ]);

        const fromAlerts = (alertsRes || []).slice(0, 30).map((item) => ({
          id: item._id,
          type: item.riskLevel === "HIGH" ? "missed" : item.riskLevel === "MEDIUM" ? "confusion" : "medication",
          title: item.message,
          description: item.message,
          time: new Date(item.timestamp || item.createdAt).toLocaleString(),
          location: undefined,
          suggestedAction: item.acknowledged ? "Already acknowledged" : "Review and acknowledge",
          severity: item.riskLevel === "HIGH" ? "high" : item.riskLevel === "MEDIUM" ? "medium" : "low"
        }));

        const fromEvents = (eventsRes || []).slice(0, 20).map((event) => ({
          id: event._id,
          type: event.eventType === "unknown_person_detected" ? "location" : "confusion",
          title: event.eventType?.replaceAll("_", " ") || "Event",
          description: event.metadata?.message || "Activity event detected",
          time: new Date(event.timestamp || event.createdAt).toLocaleString(),
          location: event.metadata?.location || undefined,
          suggestedAction: event.handled ? "No action needed" : "Review this event",
          severity: event.riskLevel === "HIGH" ? "high" : event.riskLevel === "MEDIUM" ? "medium" : "low"
        }));

        const merged = [...fromAlerts, ...fromEvents]
          .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
          .slice(0, 40);

        if (merged.length > 0) {
          setAlerts(merged);
        }
      } catch (_err) {
        // Keep local demo alerts as fallback.
      }
    };

    loadAlerts();
  }, []);

  useEffect(() => {
    if (!patientId) return;

    const socket = getSocket();
    socket.emit("join-caregiver-room", patientId);

    const pushAlert = (next) => {
      setAlerts((prev) => [{ ...next, isNew: true }, ...prev].slice(0, 50));
    };

    const onAlertGenerated = (item) => {
      pushAlert({
        id: item._id || `live-${Date.now()}`,
        type: item.riskLevel === "HIGH" ? "missed" : item.riskLevel === "MEDIUM" ? "confusion" : "medication",
        title: item.message || "Alert",
        description: item.message || "New backend alert",
        time: new Date(item.timestamp || Date.now()).toLocaleString(),
        suggestedAction: item.acknowledged ? "Already acknowledged" : "Review and acknowledge",
        severity: item.riskLevel === "HIGH" ? "high" : item.riskLevel === "MEDIUM" ? "medium" : "low"
      });
    };

    const onUnknownDetected = () => {
      pushAlert({
        id: `unknown-${Date.now()}`,
        type: "location",
        title: "Unknown person detected",
        description: "A new unknown face was detected near the patient",
        time: new Date().toLocaleString(),
        suggestedAction: "Review detection and identify person",
        severity: "high"
      });
    };

    const onTaskMissed = (task) => {
      pushAlert({
        id: `task-${task._id || Date.now()}`,
        type: "missed",
        title: "Task missed",
        description: `${task.title || "Task"} was missed`,
        time: new Date().toLocaleString(),
        suggestedAction: "Follow up with patient",
        severity: "high"
      });
    };

    socket.on("alertGenerated", onAlertGenerated);
    socket.on("unknownPersonDetected", onUnknownDetected);
    socket.on("taskMissed", onTaskMissed);

    return () => {
      socket.off("alertGenerated", onAlertGenerated);
      socket.off("unknownPersonDetected", onUnknownDetected);
      socket.off("taskMissed", onTaskMissed);
    };
  }, [patientId]);

  const counts = alerts.reduce(
    (acc, a) => {
      if (a.severity === "high") acc.high++;
      else if (a.severity === "medium") acc.medium++;
      else acc.low++;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );

  const addAlert = useCallback(() => {
    if (nextAlertIdx >= incomingAlerts.length) return;
    const template = incomingAlerts[nextAlertIdx];
    const newAlert = {
      ...template,
      id: `live-${Date.now()}`,
      time: "Just now",
      isNew: true
    };
    setAlerts((prev) => [newAlert, ...prev]);
    setNextAlertIdx((i) => i + 1);
  }, [nextAlertIdx]);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(addAlert, 8000);
    return () => clearInterval(interval);
  }, [isLive, addAlert]);

  return (
    <CaregiverLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground flex items-center gap-3">
              <Bell className="w-8 h-8 text-primary" />
              Notification Center
            </h1>
            <p className="text-muted-foreground mt-1">Review alerts and AI agent activity</p>
          </div>

          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors ${
              isLive ? "border-safe bg-safe/10 text-safe" : "border-border bg-card text-muted-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLive ? "bg-safe animate-pulse-gentle" : "bg-muted-foreground"}`} />
            <span className="text-sm font-medium">{isLive ? "Live" : "Paused"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-alert/10 border border-alert/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-alert">{counts.high}</p>
            <p className="text-sm text-muted-foreground">High Priority</p>
          </div>
          <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-warning">{counts.medium}</p>
            <p className="text-sm text-muted-foreground">Medium Priority</p>
          </div>
          <div className="bg-safe/10 border border-safe/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-safe">{counts.low}</p>
            <p className="text-sm text-muted-foreground">Low Priority</p>
          </div>
        </div>

        <div className="space-y-4">
          {alerts.map((alert) => (
            <div key={alert.id} className={alert.isNew ? "animate-fade-in" : ""}>
              <AlertItem {...alert} />
            </div>
          ))}
        </div>
      </div>
    </CaregiverLayout>
  );
};

export default CaregiverAlerts;
