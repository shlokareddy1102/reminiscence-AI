 import { ReactNode } from "react";
 import { Link, useLocation, useNavigate } from "react-router-dom";
 import { 
   LayoutDashboard, 
   Bell, 
   MapPin, 
   Users,
   Heart,
   Menu,
   X,
   LogOut
 } from "lucide-react";
 import { useState } from "react";
 import { logout } from "@/lib/auth";
 import { disconnectSocket } from "@/lib/socket";
 
 interface CaregiverLayoutProps {
   children: ReactNode;
 }
 
 const navItems = [
   { path: "/caregiver", label: "Dashboard", icon: LayoutDashboard },
   { path: "/caregiver/alerts", label: "Alerts", icon: Bell },
   { path: "/caregiver/location", label: "Location", icon: MapPin },
   { path: "/caregiver/contacts", label: "Contacts", icon: Users },
 ];
 
 const CaregiverLayout = ({ children }: CaregiverLayoutProps) => {
   const location = useLocation();
   const navigate = useNavigate();
   const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

   const handleLogout = () => {
     disconnectSocket();
     logout();
     navigate("/", { replace: true });
   };
 
   return (
     <div className="caregiver-container min-h-screen flex">
       {/* Sidebar - Desktop */}
       <aside className="hidden lg:flex flex-col w-64 bg-sidebar border-r border-sidebar-border">
         <div className="p-6 border-b border-sidebar-border">
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
               <Heart className="w-5 h-5 text-primary-foreground" />
             </div>
             <div>
               <h1 className="font-display font-bold text-lg text-sidebar-foreground">Reminiscence</h1>
               <p className="text-xs text-muted-foreground">Caregiver Portal</p>
             </div>
           </div>
         </div>
         
         <nav className="flex-1 p-4">
           <ul className="space-y-2">
             {navItems.map((item) => {
               const isActive = location.pathname === item.path;
               return (
                 <li key={item.path}>
                   <Link
                     to={item.path}
                     className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all
                       ${isActive 
                         ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-calm" 
                         : "text-sidebar-foreground hover:bg-sidebar-accent"
                       }`}
                   >
                     <item.icon className="w-5 h-5" />
                     <span className="font-medium">{item.label}</span>
                   </Link>
                 </li>
               );
             })}
           </ul>
         </nav>
         
         {/* Patient Quick Status */}
         <div className="p-4 border-t border-sidebar-border">
           <div className="p-4 rounded-xl bg-safe/10 border border-safe/20">
             <div className="flex items-center gap-2 mb-1">
               <div className="w-2 h-2 rounded-full bg-safe animate-pulse-gentle" />
               <span className="text-sm font-medium text-safe">Patient Status</span>
             </div>
             <p className="text-sm text-sidebar-foreground">Josh is safe at home</p>
           </div>
           <button
             onClick={handleLogout}
             className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
           >
             <LogOut className="w-4 h-4" />
             <span className="text-sm font-medium">Log Out</span>
           </button>
         </div>
       </aside>
 
       {/* Mobile Header */}
       <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
         <div className="flex items-center justify-between p-4">
           <div className="flex items-center gap-3">
             <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
               <Heart className="w-4 h-4 text-primary-foreground" />
             </div>
             <span className="font-display font-bold text-foreground">Reminiscence</span>
           </div>
           <button 
             onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
             className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center"
           >
             {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
           </button>
         </div>
         
         {/* Mobile Menu */}
         {mobileMenuOpen && (
           <nav className="p-4 bg-background border-b border-border animate-fade-in">
             <ul className="space-y-2">
               {navItems.map((item) => {
                 const isActive = location.pathname === item.path;
                 return (
                   <li key={item.path}>
                     <Link
                       to={item.path}
                       onClick={() => setMobileMenuOpen(false)}
                       className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all
                         ${isActive 
                           ? "bg-primary text-primary-foreground" 
                           : "text-foreground hover:bg-muted"
                         }`}
                     >
                       <item.icon className="w-5 h-5" />
                       <span className="font-medium">{item.label}</span>
                     </Link>
                   </li>
                 );
               })}
             </ul>
             <button
               onClick={() => {
                 setMobileMenuOpen(false);
                 handleLogout();
               }}
               className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border text-foreground hover:bg-muted transition-colors"
             >
               <LogOut className="w-4 h-4" />
               <span className="font-medium">Log Out</span>
             </button>
           </nav>
         )}
       </div>
 
       {/* Main Content */}
        <main className="flex-1 lg:p-5 p-4 pt-20 lg:pt-5 overflow-auto">
          <div className="max-w-6xl mx-auto">
           {children}
         </div>
       </main>
     </div>
   );
 };
 
 export default CaregiverLayout;