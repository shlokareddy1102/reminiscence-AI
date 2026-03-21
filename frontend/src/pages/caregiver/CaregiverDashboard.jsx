import { useEffect, useState } from "react";
import { Phone, MessageCircle, MapPin, Activity, Clock, Shield, Bot } from "lucide-react";
import CaregiverLayout from "@/components/caregiver/CaregiverLayout";
import StatusCard from "@/components/caregiver/StatusCard";
import QuickAction from "@/components/caregiver/QuickAction";
import AlertItem from "@/components/caregiver/AlertItem";
import KnownPeopleManager from "@/components/caregiver/KnownPeopleManager";
import { apiRequest } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { toast } from "@/hooks/use-toast";

const CaregiverDashboard = () => {
  const [patientName, setPatientName] = useState("Patient");
  const [currentState, setCurrentState] = useState("STABLE");
  const [pendingTasks, setPendingTasks] = useState(0);
  const [lastActivity, setLastActivity] = useState("-");
  const [patientId, setPatientId] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([
    {
      id: "1",
      type: "confusion",
      title: "Repeated confusion detected",
      description: "Josh asked about location 3 times in 10 minutes",
      time: "15 minutes ago",
      location: "Living Room",
      suggestedAction: "Call to provide reassurance",
      severity: "medium"
    },
    {
      id: "2",
      type: "medication",
      title: "Medication reminder sent",
      description: "Afternoon medication reminder was acknowledged",
      time: "1 hour ago",
      suggestedAction: "No action needed",
      severity: "low"
    }
  ]);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const patient = await apiRequest("/api/patient");
        if (!patient?._id) return;
        setPatientId(patient._id);

        setPatientName(patient.name || "Patient");
        setCurrentState(patient.currentState || "STABLE");
        setLastActivity(
          patient.lastActivityTime
            ? new Date(patient.lastActivityTime).toLocaleTimeString()
            : "Unknown"
        );

        const [tasks, alerts] = await Promise.all([
          apiRequest(`/api/tasks?patientId=${patient._id}`),
          apiRequest(`/api/alerts?patientId=${patient._id}`)
        ]);

        if (Array.isArray(tasks)) {
          setPendingTasks(tasks.filter((t) => t.status === "pending").length);
        }

        if (Array.isArray(alerts) && alerts.length) {
          const mapped = alerts.slice(0, 5).map((item) => ({
            id: item._id,
            type: item.riskLevel === "HIGH" ? "missed" : item.riskLevel === "MEDIUM" ? "confusion" : "medication",
            title: item.message,
            description: item.message,
            time: new Date(item.timestamp || item.createdAt).toLocaleString(),
            suggestedAction: item.acknowledged ? "Already acknowledged" : "Review and acknowledge",
            severity: item.riskLevel === "HIGH" ? "high" : item.riskLevel === "MEDIUM" ? "medium" : "low"
          }));

          setRecentAlerts(mapped);
        }
      } catch (_err) {
        // Keep graceful fallback values.
      }
    };

    loadDashboard();
  }, []);

  useEffect(() => {
    if (!patientId) return;

    const socket = getSocket();
    socket.emit("join-caregiver-room", patientId);

    const onAlertGenerated = (item) => {
      setRecentAlerts((prev) => [
        {
          id: item._id || `alert-${Date.now()}`,
          type: item.riskLevel === "HIGH" ? "missed" : item.riskLevel === "MEDIUM" ? "confusion" : "medication",
          title: item.message || "Alert",
          description: item.message || "New alert",
          time: new Date(item.timestamp || Date.now()).toLocaleString(),
          suggestedAction: item.acknowledged ? "Already acknowledged" : "Review and acknowledge",
          severity: item.riskLevel === "HIGH" ? "high" : item.riskLevel === "MEDIUM" ? "medium" : "low",
          isNew: true
        },
        ...prev
      ].slice(0, 8));
    };

    const onTaskMissed = (task) => {
      setPendingTasks((prev) => prev + 1);
      setRecentAlerts((prev) => [
        {
          id: `task-missed-${task._id || Date.now()}`,
          type: "missed",
          title: "Task missed",
          description: `${task.title || "Task"} was not completed on time`,
          time: new Date().toLocaleString(),
          suggestedAction: "Check in with patient",
          severity: "high",
          isNew: true
        },
        ...prev
      ].slice(0, 8));
    };

    const onTaskCreated = () => setPendingTasks((prev) => prev + 1);
    const onTaskCompleted = () => setPendingTasks((prev) => Math.max(0, prev - 1));
    const onRiskUpdated = (payload) => setCurrentState(payload?.currentState || "STABLE");
    const onStateChanged = (payload) => setCurrentState(payload?.currentState || "STABLE");
    const onUnknownDetected = () => {
      const now = new Date().toLocaleString();
      setRecentAlerts((prev) => [
        {
          id: `unknown-${Date.now()}`,
          type: "location",
          title: "Unknown person detected",
          description: "A new unknown face was detected near the patient",
          time: now,
          suggestedAction: "Review immediately and confirm identity",
          severity: "high",
          isNew: true
        },
        ...prev
      ].slice(0, 8));

      toast({
        title: "Unknown Person Detected",
        description: "A new face was detected near the patient. Please review now.",
        variant: "destructive"
      });
    };

    socket.on("alertGenerated", onAlertGenerated);
    socket.on("unknownPersonDetected", onUnknownDetected);
    socket.on("taskMissed", onTaskMissed);
    socket.on("taskCreated", onTaskCreated);
    socket.on("taskCompleted", onTaskCompleted);
    socket.on("riskUpdated", onRiskUpdated);
    socket.on("stateChanged", onStateChanged);

    return () => {
      socket.off("alertGenerated", onAlertGenerated);
      socket.off("unknownPersonDetected", onUnknownDetected);
      socket.off("taskMissed", onTaskMissed);
      socket.off("taskCreated", onTaskCreated);
      socket.off("taskCompleted", onTaskCompleted);
      socket.off("riskUpdated", onRiskUpdated);
      socket.off("stateChanged", onStateChanged);
    };
  }, [patientId]);

  return (
    <CaregiverLayout>
      <div className="space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-foreground">
              Good afternoon, Caregiver
            </h1>
            <p className="text-sm text-muted-foreground break-words">
              Here's how {patientName} is doing today
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs px-3 py-1 rounded-full bg-safe/10 text-safe border border-safe/20 whitespace-nowrap">
              AI Agent Active
            </span>
            <span className="text-xs px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 whitespace-nowrap">
              LLM Monitoring
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <StatusCard title="Patient Status" value={currentState} subtitle="Live backend state" icon={Shield} status={currentState === "CRITICAL" ? "alert" : currentState === "ELEVATED_RISK" ? "warning" : "safe"} />
          <StatusCard title="Last Activity" value={lastActivity} subtitle="From patient stream" icon={Activity} status="neutral" />
          <StatusCard title="Pending Tasks" value={String(pendingTasks)} subtitle="Needs follow-up" icon={Clock} status={pendingTasks > 0 ? "warning" : "safe"} />
          <StatusCard title="AI Agent" value="Active" subtitle="Monitoring enabled" icon={Bot} status="safe" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h2 className="text-base font-display font-semibold text-foreground mb-2">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <QuickAction label="Call Josh" icon={Phone} variant="primary" />
              <QuickAction label="Message" icon={MessageCircle} />
              <QuickAction label="Location" icon={MapPin} />
              <QuickAction label="Activity" icon={Activity} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-display font-semibold text-foreground">Recent Alerts</h2>
              <a href="/caregiver/alerts" className="text-xs text-primary hover:underline">View all</a>
            </div>
            <div className="space-y-2">
              {recentAlerts.map((alert) => (
                <AlertItem key={alert.id} {...alert} />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <KnownPeopleManager patientId={patientId} />
        </div>
      </div>
    </CaregiverLayout>
  );
};

export default CaregiverDashboard;
