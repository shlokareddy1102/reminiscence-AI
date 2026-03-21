import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, User, Users, Lock, Mail, ArrowRight, Bot, MapPin, Shield } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { getCurrentUser, isAuthenticated } from "@/lib/auth";

const Index = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) return;

    const user = getCurrentUser();
    const role = String(user?.role || "").toLowerCase();

    if (role === "caregiver") {
      navigate("/caregiver", { replace: true });
      return;
    }

    if (role === "patient") {
      navigate("/patient", { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      const role = String(data.user?.role || activeTab).toLowerCase();
      const normalizedUser = { ...(data.user || {}), role };

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(normalizedUser));

      if (role === "patient") {
        navigate("/patient");
        return;
      }

      if (role === "caregiver") {
        navigate("/caregiver");
        return;
      }

      navigate(activeTab === "patient" ? "/patient" : "/caregiver");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-accent/10 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-calm mx-auto mb-4">
          <Heart className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight">
          reminiscence<span className="text-primary">.ai</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-2">Context-Aware Dementia Assistance</p>
      </div>

      <div className="w-full max-w-md animate-fade-in">
        <div className="bg-card rounded-2xl border border-border shadow-calm p-6">
          <div className="flex rounded-xl bg-muted p-1 mb-6">
            <button
              onClick={() => setActiveTab("patient")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "patient"
                  ? "bg-primary text-primary-foreground shadow-gentle"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="w-4 h-4" />
              Patient
            </button>
            <button
              onClick={() => setActiveTab("caregiver")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "caregiver"
                  ? "bg-primary text-primary-foreground shadow-gentle"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="w-4 h-4" />
              Caregiver
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={activeTab === "patient" ? "josh@example.com" : "sarah@example.com"}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shadow-calm"
            >
              {isSubmitting ? "Signing in..." : `Sign in as ${activeTab === "patient" ? "Patient" : "Caregiver"}`}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {error && <p className="mt-3 text-center text-xs text-red-600">{error}</p>}

          <p className="text-center text-xs text-muted-foreground mt-4">
            Use your backend credentials (example: caregiver@test.com)
          </p>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-3 mt-8 animate-fade-in">
        <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20">
          <Bot className="w-3 h-3" /> AI Agent
        </span>
        <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-accent/10 text-accent border border-accent/20">
          <MapPin className="w-3 h-3" /> Location Aware
        </span>
        <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-safe/10 text-safe border border-safe/20">
          <Shield className="w-3 h-3" /> Peace of Mind
        </span>
      </div>

      <p className="text-center text-[11px] text-muted-foreground mt-6">
        Academic demonstration • AI-powered dementia care
      </p>
    </div>
  );
};

export default Index;
