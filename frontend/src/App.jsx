import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { hasRole, isAuthenticated } from "./lib/auth";
import { apiRequest } from "./lib/api";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PatientHome from "./pages/patient/PatientHome";
import CaregiverDashboard from "./pages/caregiver/CaregiverDashboard";
import CaregiverAlerts from "./pages/caregiver/CaregiverAlerts";
import CaregiverLocation from "./pages/caregiver/CaregiverLocation";
import CaregiverContacts from "./pages/caregiver/CaregiverContacts";

const queryClient = new QueryClient();

const CLIENT_ID_KEY = "analyticsClientId";

const getAnalyticsClientId = () => {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;

  const fallbackId = `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const newId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : fallbackId;
  localStorage.setItem(CLIENT_ID_KEY, newId);
  return newId;
};

const PatientRoute = ({ children }) => {
  if (!isAuthenticated()) return <Navigate to="/" replace />;
  if (!hasRole("patient")) return <Navigate to="/caregiver" replace />;
  return children;
};

const CaregiverRoute = ({ children }) => {
  if (!isAuthenticated()) return <Navigate to="/" replace />;
  if (!hasRole("caregiver")) return <Navigate to="/patient" replace />;
  return children;
};

const App = () => {
  const sessionIdRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const startSession = async () => {
      try {
        const clientId = getAnalyticsClientId();
        const auth = JSON.parse(localStorage.getItem("auth") || "null");
        const payload = {
          clientId,
          userId: auth?.user?._id || null,
          role: auth?.user?.role || "guest",
          pagePath: window.location.pathname || "/"
        };

        const response = await apiRequest("/api/analytics/session/start", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        if (!cancelled) {
          sessionIdRef.current = response?.sessionId || null;
        }
      } catch (_err) {
        // Silent fail: analytics should not break the app.
      }
    };

    startSession();

    const endSession = () => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;

      const url = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:5001"}/api/analytics/session/end-beacon`;
      const body = JSON.stringify({ sessionId });
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    };

    window.addEventListener("beforeunload", endSession);

    return () => {
      cancelled = true;
      endSession();
      window.removeEventListener("beforeunload", endSession);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/patient" element={<PatientRoute><PatientHome /></PatientRoute>} />
            <Route path="/caregiver" element={<CaregiverRoute><CaregiverDashboard /></CaregiverRoute>} />
            <Route path="/caregiver/alerts" element={<CaregiverRoute><CaregiverAlerts /></CaregiverRoute>} />
            <Route path="/caregiver/location" element={<CaregiverRoute><CaregiverLocation /></CaregiverRoute>} />
            <Route path="/caregiver/contacts" element={<CaregiverRoute><CaregiverContacts /></CaregiverRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
