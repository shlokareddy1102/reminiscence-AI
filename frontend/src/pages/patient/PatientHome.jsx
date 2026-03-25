import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import PatientLayout from "@/components/patient/PatientLayout";
import TimeDisplay from "@/components/patient/TimeDisplay";
import LocationCard from "@/components/patient/LocationCard";
import TaskList from "@/components/patient/TaskList";
import VoicePrompt from "@/components/patient/VoicePrompt";
import NotificationBanner from "@/components/patient/NotificationBanner";
import PatientPersonRecognition from "@/components/patient/PatientPersonRecognition";
import { apiRequest } from "@/lib/api";
import { getSocket } from "@/lib/socket";

const initialTasks = [
  { id: "1", title: "Schedule a meeting with a doctor", completed: false, scheduledTime: null },
  { id: "2", title: "Do groceries", completed: false, scheduledTime: null },
  { id: "3", title: "Take afternoon medication", completed: true, scheduledTime: null }
];

const PatientHome = () => {
  const [tasks, setTasks] = useState(initialTasks);
  const [showNotification, setShowNotification] = useState(true);
  const [patientName, setPatientName] = useState("Josh");
  const [locationLabel, setLocationLabel] = useState("Home");
  const [patientId, setPatientId] = useState(null);
  const [notificationMessage, setNotificationMessage] = useState("Doctor's appointment in 30 minutes");
  const [notificationType, setNotificationType] = useState("warning");
  const [assistantMessage, setAssistantMessage] = useState("You are at home and safe. Your next appointment is at 2:30 PM today.");
  const notifiedTaskIdsRef = useRef(new Set());

  const speakMessage = (message) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };

  const handleToggleTask = async (id) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      )
    );

    try {
      await apiRequest(`/api/tasks/${id}/complete`, { method: "PUT" });
    } catch (_err) {
      // UI remains optimistic even if API call fails.
    }
  };

  useEffect(() => {
    const loadPatientData = async () => {
      try {
        const patient = await apiRequest("/api/patient");
        if (patient?.name) setPatientName(patient.name);
        if (patient?._id) setPatientId(patient._id);

        if (patient?._id) {
          const [taskList, teamLocations] = await Promise.all([
            apiRequest(`/api/tasks?patientId=${patient._id}`),
            apiRequest(`/api/location/team/${patient._id}`).catch(() => [])
          ]);

          if (Array.isArray(taskList) && taskList.length) {
            setTasks(
              taskList.slice(0, 8).map((item) => ({
                id: item._id,
                title: item.title,
                completed: item.status === "completed",
                scheduledTime: item.scheduledTime || null
              }))
            );
          }

          const pLoc = Array.isArray(teamLocations)
            ? teamLocations.find((entry) => entry.role === "patient")
            : null;

          if (pLoc?.coordinates) {
            setLocationLabel(
              `${pLoc.coordinates.latitude.toFixed(4)}, ${pLoc.coordinates.longitude.toFixed(4)}`
            );
          }
        }
      } catch (_err) {
        // Keep demo fallback values if backend is unavailable.
      }
    };

    loadPatientData();
  }, []);

  useEffect(() => {
    if (!patientId) return;

    const socket = getSocket();
    socket.emit("join-patient-room", patientId);

    const onTaskCreated = (task) => {
      setTasks((prev) => [{ id: task._id, title: task.title, completed: false, scheduledTime: task.scheduledTime || null }, ...prev].slice(0, 8));
      setNotificationMessage(`New task: ${task.title}`);
      setNotificationType("info");
      setShowNotification(true);
    };

    const onTaskCompleted = (task) => {
      setTasks((prev) => prev.map((item) => (item.id === task._id ? { ...item, completed: true } : item)));
      setNotificationMessage(`Completed: ${task.title}`);
      setNotificationType("info");
      setShowNotification(true);
    };

    const onLocationUpdated = (payload) => {
      const loc = payload?.location;
      if (payload?.role === "patient" && loc && typeof loc.latitude === "number" && typeof loc.longitude === "number") {
        setLocationLabel(`${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`);
      }
    };

    const onSosAcknowledged = () => {
      setNotificationMessage("Your SOS alert has been acknowledged. Help is on the way.");
      setNotificationType("alert");
      setShowNotification(true);
    };

    socket.on("taskCreated", onTaskCreated);
    socket.on("taskCompleted", onTaskCompleted);
    socket.on("locationUpdated", onLocationUpdated);
    socket.on("sosAlertAcknowledged", onSosAcknowledged);

    return () => {
      socket.off("taskCreated", onTaskCreated);
      socket.off("taskCompleted", onTaskCompleted);
      socket.off("locationUpdated", onLocationUpdated);
      socket.off("sosAlertAcknowledged", onSosAcknowledged);
    };
  }, [patientId]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const dueTask = tasks.find((task) => {
        if (task.completed || !task.scheduledTime) return false;
        if (notifiedTaskIdsRef.current.has(task.id)) return false;
        return new Date(task.scheduledTime).getTime() <= now;
      });

      if (!dueTask) return;

      notifiedTaskIdsRef.current.add(dueTask.id);
      const reminderMessage = `Reminder: ${dueTask.title} is due now.`;
      setNotificationMessage(reminderMessage);
      setNotificationType("warning");
      setShowNotification(true);
      setAssistantMessage(reminderMessage);
      speakMessage(reminderMessage);
    }, 10000);

    return () => clearInterval(interval);
  }, [tasks]);

  return (
    <PatientLayout>
      <div className="text-center py-1">
        <h1 className="text-2xl font-display font-bold text-foreground mb-0.5">
          Hi, {patientName} 👋
        </h1>
        <TimeDisplay />
      </div>

      <div className="flex-1 pb-1 flex flex-row items-start justify-start gap-3 min-h-0 overflow-hidden">
        {/* Left: Face Recognition Widget */}
        <div
          className="flex-shrink-0 flex flex-col min-h-0 sticky top-2 self-start"
          style={{ width: "42rem", maxWidth: "58vw" }}
        >
          <PatientPersonRecognition
            patientId={patientId}
            onAnnouncement={(message) => setAssistantMessage(message)}
          />
        </div>

        {/* Right: Feature Panel */}
        <div className="flex-1 min-w-0 grid grid-cols-1 gap-2 h-full overflow-y-auto pr-2 content-start">
          {showNotification && (
            <div>
              <NotificationBanner
                type={notificationType}
                message={notificationMessage}
                onDismiss={() => setShowNotification(false)}
              />
            </div>
          )}

          <div className="space-y-2">
            <button className="patient-button w-full flex items-center justify-center gap-3 !py-3 !text-base">
              <MapPin className="w-5 h-5" />
              <span>Check your location</span>
            </button>

            <TaskList tasks={tasks} onToggle={handleToggleTask} />
          </div>

          <LocationCard location={locationLabel} isSafe={true} />

          <VoicePrompt
            message={assistantMessage}
            isAiGenerated={true}
          />
        </div>
      </div>
    </PatientLayout>
  );
};

export default PatientHome;
