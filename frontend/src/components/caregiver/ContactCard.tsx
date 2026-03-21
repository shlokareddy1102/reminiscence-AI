 import { Phone, MessageCircle, MoreVertical } from "lucide-react";
 
 interface ContactCardProps {
   name: string;
   relationship: string;
   phone: string;
   avatar?: string;
   isCaregiver?: boolean;
 }
 
 const ContactCard = ({ name, relationship, phone, avatar, isCaregiver = false }: ContactCardProps) => {
   const initials = name.split(" ").map(n => n[0]).join("").toUpperCase();
   
   return (
     <div className="bg-card rounded-xl border border-border p-4 shadow-gentle animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
         {avatar ? (
           <img src={avatar} alt={name} className="w-14 h-14 rounded-xl object-cover" />
         ) : (
           <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
             <span className="font-display font-bold text-primary text-lg">{initials}</span>
           </div>
         )}
         
         <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
             <h3 className="font-semibold text-foreground truncate">{name}</h3>
             {isCaregiver && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium whitespace-nowrap">
                 Caregiver
               </span>
             )}
           </div>
           <p className="text-sm text-muted-foreground">{relationship}</p>
           <p className="text-sm text-muted-foreground">{phone}</p>
         </div>
         
         <div className="flex items-center gap-2 sm:self-auto self-end">
           <button className="w-10 h-10 rounded-lg bg-safe/10 text-safe hover:bg-safe/20 flex items-center justify-center transition-colors">
             <Phone className="w-5 h-5" />
           </button>
           <button className="w-10 h-10 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 flex items-center justify-center transition-colors">
             <MessageCircle className="w-5 h-5" />
           </button>
           <button className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
             <MoreVertical className="w-4 h-4 text-muted-foreground" />
           </button>
         </div>
       </div>
     </div>
   );
 };
 
 export default ContactCard;