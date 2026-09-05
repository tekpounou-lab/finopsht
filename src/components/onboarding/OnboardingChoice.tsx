import React from "react";
import { motion } from "motion/react";
import { 
  Building2, 
  Users, 
  ArrowRight, 
  Rocket,
  ShieldCheck,
  Building,
  Key
} from "lucide-react";
import { useIdentity } from "../../modules/identity/IdentityContext";

interface OnboardingChoiceProps {
  onSelect: (choice: "CREATE" | "MEMBER") => void;
}

export const OnboardingChoice: React.FC<OnboardingChoiceProps> = ({ onSelect }) => {
  const { identity } = useIdentity();

  return (
    <div id="onboarding-choice-root" className="min-h-screen bg-[#020617] flex items-center justify-center p-4 font-sans selection:bg-cyan-500/30">
      <div className="w-full max-w-5xl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-950/40 border border-cyan-800/30 rounded-full text-cyan-400 text-[10px] font-mono uppercase font-black tracking-widest mb-6">
            <ShieldCheck className="w-3.5 h-3.5" />
            FinOps Enterprise Identity Gateway
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tight leading-none">
            Bienvenue sur <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">FINOPS ERP</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto font-medium leading-relaxed">
            Votre identité <span className="text-slate-100 font-bold">{identity?.email}</span> a été authentifiée. 
            Sélectionnez votre mode de déploiement pour accéder à l'écosystème.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Create Business Option (Journey A) */}
          <motion.div 
            id="choice-create-owner-card"
            whileHover={{ y: -8, scale: 1.01 }}
            className="group cursor-pointer"
            onClick={() => onSelect("CREATE")}
          >
            <div className="h-full glass rounded-[40px] p-10 border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all relative overflow-hidden flex flex-col shadow-2xl">
              <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity">
                <Building2 size={160} />
              </div>
              
              <div className="mb-10">
                <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-cyan-500/20">
                  <Key className="text-slate-950" size={32} strokeWidth={2.5} />
                </div>
              </div>

              <div className="space-y-4 mb-10">
                <h2 className="text-3xl font-black text-white tracking-tight uppercase">Créer une entreprise</h2>
                <p className="text-slate-400 leading-relaxed font-medium">
                  Devenez le fondateur de votre propre espace de travail ERP. 
                  Gérez vos branches, vos collaborateurs, vos devises et vos caisses en toute autonomie.
                </p>
              </div>

              <div className="mt-auto pt-8 border-t border-white/5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-cyan-400 font-black uppercase text-[10px] tracking-[0.2em]">Fondateur</span>
                  <span className="text-slate-500 text-xs font-mono">Nouvelle Organisation</span>
                </div>
                <div id="choice-create-owner-btn" className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-cyan-500 transition-all duration-500 group-hover:shadow-lg group-hover:shadow-cyan-500/30">
                  <ArrowRight className="text-white group-hover:text-slate-950" size={24} />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Join/Member Option */}
          <motion.div 
            id="choice-join-employee-card"
            whileHover={{ y: -8, scale: 1.01 }}
            className="group cursor-pointer"
            onClick={() => onSelect("MEMBER")}
          >
            <div className="h-full glass rounded-[40px] p-10 border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all relative overflow-hidden flex flex-col shadow-2xl">
              <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity">
                <Users size={160} />
              </div>

              <div className="mb-10">
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center border border-white/10">
                  <Users className="text-white" size={32} />
                </div>
              </div>

              <div className="space-y-4 mb-10">
                <h2 className="text-3xl font-black text-white tracking-tight uppercase">Devenir Membre</h2>
                <p className="text-slate-400 leading-relaxed font-medium">
                  Rejoignez une entreprise existante sur FINOPS ERP. Complétez vos coordonnées et recevez l'invitation de votre organisation.
                </p>
              </div>

              <div className="mt-auto pt-8 border-t border-white/5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-slate-400 font-black uppercase text-[10px] tracking-[0.2em]">Collaborateur</span>
                  <span className="text-slate-500 text-xs font-mono">Rejoindre une Organisation</span>
                </div>
                <div id="choice-join-employee-btn" className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white transition-all duration-500">
                  <ArrowRight className="text-white group-hover:text-slate-950" size={24} />
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="mt-16 text-center">
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">
            Enterprise Grade Infrastructure • Zero Trust Security • High Availability
          </p>
        </div>
      </div>
    </div>
  );
};
