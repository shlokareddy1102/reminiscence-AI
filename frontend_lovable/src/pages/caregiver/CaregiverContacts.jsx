import { useEffect, useState } from "react";
import CaregiverLayout from "@/components/caregiver/CaregiverLayout";
import ContactCard from "@/components/caregiver/ContactCard";
import { Users, Plus, Heart } from "lucide-react";
import { apiRequest } from "@/lib/api";

const lovedOnes = [
  { name: "Emily Johnson", relationship: "Daughter", phone: "(555) 123-4567" },
  { name: "Michael Johnson", relationship: "Son", phone: "(555) 234-5678" },
  { name: "Robert Smith", relationship: "Brother", phone: "(555) 345-6789" }
];

const caregivers = [
  { name: "Sarah Williams", relationship: "Primary Caregiver", phone: "(555) 456-7890", isCaregiver: true },
  { name: "Dr. Amanda Chen", relationship: "Physician", phone: "(555) 567-8901", isCaregiver: true },
  { name: "Nurse Patricia", relationship: "Home Nurse", phone: "(555) 678-9012", isCaregiver: true }
];

const CaregiverContacts = () => {
  const [patientName, setPatientName] = useState("Josh Thompson");
  const [lovedOnesList] = useState(lovedOnes);
  const [caregiversList, setCaregiversList] = useState(caregivers);

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const patient = await apiRequest("/api/patient");
        if (!patient) return;

        if (patient.name) setPatientName(patient.name);

        const cg = Array.isArray(patient.caregivers)
          ? patient.caregivers.map((entry) => ({
              name: entry.name,
              relationship: entry.role === "medical" ? "Medical Caregiver" : "Family Caregiver",
              phone: "Not provided",
              isCaregiver: true
            }))
          : [];

        if (cg.length > 0) {
          setCaregiversList(cg);
        }
      } catch (_err) {
        // Use fallback sample contacts if API fails.
      }
    };

    loadContacts();
  }, []);

  return (
    <CaregiverLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground flex items-center gap-3">
              <Users className="w-8 h-8 text-primary" />
              Contacts & Settings
            </h1>
            <p className="text-muted-foreground mt-1">Manage Josh's care team and loved ones</p>
          </div>

          <button className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-calm">
            <Plus className="w-5 h-5" />
            <span className="font-medium">Add Contact</span>
          </button>
        </div>

        <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl border border-primary/20 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center">
              <span className="text-3xl font-display font-bold text-primary">{patientName?.[0] || "P"}</span>
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold text-foreground">{patientName}</h2>
              <p className="text-muted-foreground">Patient ID: PT-2024-0847</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-xs px-3 py-1 rounded-full bg-safe/20 text-safe font-medium whitespace-nowrap">Active Monitoring</span>
                <span className="text-xs px-3 py-1 rounded-full bg-accent/20 text-accent font-medium whitespace-nowrap">AI Assistant Enabled</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <Heart className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-display font-semibold text-foreground">Loved Ones</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {lovedOnesList.map((contact) => (
              <ContactCard key={contact.phone} {...contact} />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-display font-semibold text-foreground">Care Team</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {caregiversList.map((contact) => (
              <ContactCard key={contact.phone} {...contact} />
            ))}
          </div>
        </div>
      </div>
    </CaregiverLayout>
  );
};

export default CaregiverContacts;
