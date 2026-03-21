import { ReactNode } from "react";

interface PatientLayoutProps {
  children: ReactNode;
}

const PatientLayout = ({ children }: PatientLayoutProps) => {
  return (
    <div className="patient-container h-screen overflow-hidden flex flex-col">
      <main className="flex-1 flex flex-col max-w-[1400px] mx-auto w-full min-h-0 px-3 py-2 overflow-hidden">
        {children}
      </main>
    </div>
  );
};

export default PatientLayout;
