import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, CheckCircle, LogOut, XCircle } from 'lucide-react';
import { useIdentity } from '../modules/identity/IdentityContext';
import { useI18n } from '../i18n';
import { auth } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function AcceptInvitation() {
  const { identity, acceptInvitation, rejectInvitation } = useIdentity();
  const { language } = useI18n();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const invitation = identity?.invitation;

  const handleAccept = async () => {
    if (!invitation) return;
    setLoading(true);
    try {
      await acceptInvitation(invitation.id);
      toast.success(language === "fr" ? "Invitation acceptée !" : "Invitation accepted!");
      navigate("/dashboard");
    } catch (e: any) {
      toast.error(e.message);
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!invitation) return;
    setLoading(true);
    try {
      await rejectInvitation(invitation.id);
      toast.success(language === "fr" ? "Invitation refusée." : "Invitation rejected.");
      navigate("/onboarding");
    } catch (e: any) {
      toast.error(e.message);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    navigate("/");
  };

  if (!invitation) return null;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-blue-500" />
        
        <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Mail className="w-10 h-10 text-cyan-500" />
        </div>
        
        <h1 className="text-xl font-bold text-slate-100 mb-2">
          {language === "fr" ? "Invitation d'entreprise" : language === "ht" ? "Envitasyon nan konpayi" : "Company Invitation"}
        </h1>
        <p className="text-slate-400 mb-6 text-sm">
          {language === "fr" ? "Vous avez été invité à rejoindre une entreprise sur le réseau FinOps ERP." : language === "ht" ? "Ou te envite pou rantre nan yon konpayi sou rezo FinOps ERP." : "You have been invited to join a company on the FinOps ERP network."}
        </p>
        
        <div className="bg-slate-950/50 rounded-lg p-5 mb-8 flex flex-col gap-2 text-left border border-slate-800/50">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800/50">
            <span className="text-xs text-slate-500 uppercase font-bold">
              {language === "fr" ? "Rôle assigné" : language === "ht" ? "Wòl ou" : "Assigned Role"}
            </span>
            <span className="text-sm text-cyan-400 font-bold">{invitation.role}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-xs text-slate-500 uppercase font-bold">
              {language === "fr" ? "Entreprise" : language === "ht" ? "Konpayi" : "Business"}
            </span>
            <span className="text-xs text-slate-300 font-mono">
              {identity?.business?.name || invitation.business_name || invitation.business_id}
            </span>
          </div>
        </div>
        
        <div className="flex flex-col gap-3">
          <button 
            disabled={loading}
            onClick={handleAccept}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 rounded-xl font-bold transition-colors"
          >
            <CheckCircle className="w-5 h-5" />
            {loading ? (language === "fr" ? "Acceptation en cours..." : "Accepting...") : (language === "fr" ? "Accepter l'invitation" : "Accept invitation")}
          </button>

          <button 
            disabled={loading}
            onClick={handleReject}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium transition-colors"
          >
            <XCircle className="w-4 h-4" />
            {language === "fr" ? "Refuser l'invitation" : "Reject invitation"}
          </button>
          
          <button 
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-xl text-xs transition-colors mt-2"
          >
            <LogOut className="w-4 h-4" />
            {language === "fr" ? "Se déconnecter" : "Log out"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
