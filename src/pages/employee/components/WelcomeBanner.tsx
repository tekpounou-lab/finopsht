import React from "react";
import { Sparkles, Fingerprint, Globe } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Employee } from "../../../types";

interface WelcomeBannerProps {
  employee: Employee;
  deptName: string;
  tw: any;
  onClockIn: () => void;
  isClockingIn: boolean;
  buttonText?: string;
  showClockIn?: boolean;
}

export const WelcomeBanner: React.FC<WelcomeBannerProps> = ({
  employee,
  deptName,
  tw,
  onClockIn,
  isClockingIn,
  buttonText,
  showClockIn,
}) => {
  const navigate = useNavigate();

  const isElevatedRole = ["SUPERVISOR", "MANAGER", "OWNER", "DIRECTOR", "SUPER_ADMIN"].includes((employee?.role || "").toUpperCase());
  const canShowClockIn = showClockIn !== undefined ? showClockIn : isElevatedRole;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return tw.welcome || "Bonjour";
    if (hour < 18) return tw.welcome || "Bonjour";
    return tw.welcome || "Bonsoir";
  };

  return (
    <div
      id="workspace-welcome-banner"
      className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 border border-slate-800/60 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden"
    >
      <div>
        <span className="text-[9px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2.5 py-0.5 rounded font-black tracking-widest uppercase">
          {tw.bannerSubtitle}
        </span>
        <h2 className="text-xl md:text-2xl font-black text-slate-100 uppercase tracking-tight font-sans mt-2 flex items-center gap-1.5">
          {getGreeting()}, {employee.name}{" "}
          <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
        </h2>
        <p className="text-xs text-slate-400 mt-1 font-mono">
          {tw.refRh} : <code className="text-amber-400 font-bold">{employee.id}</code> |{" "}
          {tw.affectation} : <strong className="text-slate-200">{deptName}</strong>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <motion.button
          id="workspace-landing-btn"
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate("/landing")}
          className="px-4 py-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-700/80 hover:border-cyan-500/50 text-slate-200 hover:text-cyan-400 rounded-xl text-xs font-black font-mono uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-sm transition-all"
          title="Retourner à la page d'accueil"
        >
          <Globe className="w-4 h-4 text-cyan-400" />
          <span>Page d'Accueil</span>
        </motion.button>

        {canShowClockIn && (
          <motion.button
            id="workspace-clockin-btn"
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClockIn}
            disabled={isClockingIn}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 disabled:opacity-55 rounded-xl text-xs font-black font-mono uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/10 transition-all"
          >
            <Fingerprint className={`w-4 h-4 text-slate-950 ${isClockingIn ? "animate-ping" : ""}`} />
            {isClockingIn ? "Synchronization..." : (buttonText || tw.clockIn)}
          </motion.button>
        )}
      </div>
    </div>
  );
};
