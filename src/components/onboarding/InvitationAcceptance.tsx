import React, { useState } from "react";
import { motion } from "motion/react";
import { 
  Mail, 
  Building2, 
  Loader2,
  UserPlus,
  ArrowRight,
  Shield,
  XCircle,
  CheckCircle
} from "lucide-react";
import { useIdentity } from "../../modules/identity/IdentityContext";
import { toast } from "sonner";

export const InvitationAcceptance: React.FC = () => {
  const { identity, acceptInvitation, rejectInvitation } = useIdentity();
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (!identity?.invitation?.id) return;
    setLoading(true);
    try {
      await acceptInvitation(identity.invitation.id);
      toast.success("Invitation acceptée ! Bienvenue sur FINOPS ERP.");
    } catch (err: any) {
      toast.error(`Erreur: ${err.message}`);
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!identity?.invitation?.id) return;
    setLoading(true);
    try {
      await rejectInvitation(identity.invitation.id);
      toast.success("Invitation refusée.");
    } catch (err: any) {
      toast.error(`Erreur: ${err.message}`);
      setLoading(false);
    }
  };

  if (!identity?.invitation) return null;

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="glass rounded-[32px] p-8 md:p-10 border border-white/5 shadow-2xl relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl" />

          <div className="relative">
            <div className="flex justify-center mb-8">
              <div className="p-4 bg-cyan-500/20 rounded-2xl">
                <UserPlus className="text-cyan-400" size={32} />
              </div>
            </div>

            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-white mb-3">Invitation Reçue</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Vous avez été invité à rejoindre une entreprise sur <span className="text-cyan-400 font-bold tracking-tight">FINOPS ERP</span>.
              </p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-10 space-y-4">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-slate-800 rounded-lg">
                  <Building2 className="text-slate-400" size={20} />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Entreprise</p>
                  <p className="text-slate-100 font-bold text-sm">{identity?.business?.name || identity.invitation.business_name || identity.invitation.business_id}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="p-2 bg-slate-800 rounded-lg">
                  <Shield className="text-slate-400" size={20} />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Rôle Assigné</p>
                  <p className="text-slate-100 font-bold text-sm uppercase">{identity.invitation.role}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={handleAccept}
                disabled={loading}
                className="w-full bg-cyan-600 text-slate-950 py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-cyan-500 transition-all active:scale-95 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <>
                    <CheckCircle size={20} />
                    <span>Accepter l'Invitation</span>
                  </>
                )}
              </button>

              <button 
                onClick={handleReject}
                disabled={loading}
                className="w-full bg-slate-900 text-slate-400 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                <XCircle size={18} />
                <span>Refuser</span>
              </button>
            </div>

            <p className="text-center text-[10px] text-slate-500 mt-6 font-medium uppercase tracking-wider">
              PROTECTED BY FINOPS ENTERPRISE IDENTITY
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
