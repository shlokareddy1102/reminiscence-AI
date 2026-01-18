import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PatientScreen from './patient/PatientScreen';
import CaregiverDashboard from './caregiver/CaregiverDashboard';

const Navigation = () => {
  const location = useLocation();
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      zIndex: 1000,
      padding: '10px 20px',
      background: '#f0f0f0',
      borderLeft: '1px solid #ddd',
      borderBottom: '1px solid #ddd'
    }}>
      {location.pathname === '/patient' ? (
        <a href="/caregiver" style={{ padding: '8px 12px', textDecoration: 'none', color: '#333' }}>
          Switch to Caregiver
        </a>
      ) : (
        <a href="/patient" style={{ padding: '8px 12px', textDecoration: 'none', color: '#333' }}>
          Switch to Patient
        </a>
      )}
    </div>
  );
};

const App = () => (
  <>
    <Navigation />
    <Routes>
      <Route path="/" element={<Navigate to="/patient" replace />} />
      <Route path="/patient" element={<PatientScreen />} />
      <Route path="/caregiver" element={<CaregiverDashboard />} />
      <Route path="*" element={<Navigate to="/patient" replace />} />
    </Routes>
  </>
);

export default App;
