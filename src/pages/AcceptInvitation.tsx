import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Mail, CheckCircle, LogOut, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { useIdentity } from '../modules/identity/IdentityContext';
import { useI18n } from '../i18n';
import { auth } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function AcceptInvitation() {
  const { identity, acceptInvitation, rejectInvitation } = useIdentity();
  const { language } = useI18n();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const navigate = useNavigate();

  const invitation = identity?.invitation;
  const targetBusinessId = invitation?.business_id || (invitation as any)?.businessId || '';
  const invitationId = invitation?.id || '';
  const cachedBusinessName =
    identity?.business?.name ||
    invitation?.business_name ||
    (invitation as any)?.businessName ||
    (invitation as any)?.companyName ||
    null;

  useEffect(() => {
    if (cachedBusinessName) {
      setBusinessName(cachedBusinessName);
      return;
    }
    if (!invitationId) return;

    let active = true;
    const controller = new AbortController();
    const fetchBusinessName = async () => {
      try {
        const res = await fetch(
          `/api/invitations/lookup?token=${encodeURIComponent(invitationId)}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        const resolvedName = body?.invitation?.businessName;
        if (resolvedName && active) {
          setBusinessName(resolvedName);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('[AcceptInvitation] Business name lookup skipped:', err?.message || err);
        }
      }
    };

    fetchBusinessName();

    return () => {
      active = false;
      controller.abort();
    };
  }, [invitationId, cachedBusinessName]);

  const handleAccept = async () => {
    if (!invitation || loading) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await acceptInvitation(invitation.id);
      toast.success(language === "fr" ? "Invitation acceptée !" : "Invitation accepted!");
      navigate("/dashboard");
    } catch (e: any) {
      const msg = e?.message || (language === "fr" ? "Erreur lors de l'acceptation." : "Failed to accept invitation.");
      setErrorMsg(msg);
      toast.error(msg);
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!invitation || loading) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await rejectInvitation(invitation.id);
      toast.success(language === "fr" ? "Invitation refusée." : "Invitation rejected.");
      navigate("/onboarding");
    } catch (e: any) {
      const msg = e?.message || (language === "fr" ? "Erreur lors du refus." : "Failed to reject invitation.");
      setErrorMsg(msg);
      toast.error(msg);
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
        
        <div className="bg-slate-950/50 rounded-lg p-5 mb-6 flex flex-col gap-2 text-left border border-slate-800/50">
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
              {businessName || cachedBusinessName || targetBusinessId || "FINOPS Enterprise"}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 rounded-xl border border-rose-500/40 bg-rose-950/30 p-3.5 text-left">
            <div className="flex items-start gap-2.5 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-rose-300 mb-1">
                  {language === "fr" ? "Impossible de finaliser l'opération" : "Unable to complete action"}
                </p>
                <p className="text-rose-200/80 break-words">{errorMsg}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleAccept}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {language === "fr" ? "Réessayer" : "Retry"}
            </button>
          </div>
        )}
        
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
            className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl font-medium transition-colors"
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
