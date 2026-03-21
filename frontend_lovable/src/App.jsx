import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { hasRole, isAuthenticated } from "./lib/auth";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PatientHome from "./pages/patient/PatientHome";
import CaregiverDashboard from "./pages/caregiver/CaregiverDashboard";
import CaregiverAlerts from "./pages/caregiver/CaregiverAlerts";
import CaregiverLocation from "./pages/caregiver/CaregiverLocation";
import CaregiverContacts from "./pages/caregiver/CaregiverContacts";

const queryClient = new QueryClient();

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

const App = () => (
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

export default App;
