import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Clock, ShieldAlert, LogOut, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'sonner';

export default function WaitingApproval() {
  const { logout, user, dbUser } = useAuth();
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode || !user || !dbUser) return;
    
    setLoading(true);
    try {
      // 1. Verify business exists
      const bizRef = doc(db, 'businesses', joinCode);
      const bizSnap = await getDoc(bizRef);
      if (!bizSnap.exists()) {
        toast.error("Code d'entreprise invalide");
        setLoading(false);
        return;
      }
      
      // 2. We can auto-create a pending invitation or just assign them as employee
      // For this demo, let's create a pending invitation that an admin must approve
      // OR direct assignment if we have a special join code, but let's just make it direct since they want to "become employee"
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        ...dbUser,
        business_id: joinCode,
        role: "EMPLOYEE",
        account_status: "WAITING_APPROVAL"
      });
      
      toast.success("Succès ! Votre demande a été envoyée.");
      setTimeout(() => window.location.reload(), 1500);
      
    } catch(err: any) {
      toast.error(err.message || "Erreur de connexion");
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />
        
        <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Clock className="w-8 h-8 text-amber-500" />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-100 mb-2">En attente d'approbation</h1>
        <p className="text-slate-400 mb-6 text-sm">
          Votre compte a été créé avec succès ({user?.email}). Vous n'êtes rattaché à aucune entreprise.
        </p>
        
        <div className="bg-slate-950/50 rounded-lg p-4 mb-6 flex items-start gap-3 text-left border border-slate-800/50">
          <ShieldAlert className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-400">
            <span className="text-slate-300 font-semibold mb-1 block">Pourquoi suis-je ici ?</span>
            Les accès au système FinOps ERP sont strictement cloisonnés. Demandez à votre administrateur un "Code Entreprise" pour vous y affilier.
          </div>
        </div>

        <form onSubmit={handleJoin} className="mb-8 flex flex-col gap-3 text-left">
          <label className="text-sm font-medium text-slate-300">Code Entreprise (ID)</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Ex: b1 ou biz_1234"
              className="px-4 py-2 flex-grow bg-slate-950 border border-slate-800 rounded-xl focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-slate-200 outline-none"
              required
            />
            <button 
              type="submit"
              disabled={loading || !joinCode}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl flex items-center justify-center"
            >
              {loading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <ArrowRight className="w-5 h-5" />}
            </button>
          </div>
        </form>
        
        <button 
          onClick={() => logout()}
          className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Se déconnecter
        </button>
      </motion.div>
    </div>
  );
}
