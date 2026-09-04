import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../i18n";
import { ShieldAlert, LogOut, Clock, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const INACTIVITY_TIME = 15 * 60 * 1000; // 15 minutes
const WARNING_TIME = 60 * 1000; // 60 seconds countdown warning

export function InactivityTimer() {
  const { user, logout } = useAuth();
  const { language } = useI18n();

  const [showWarning, setShowWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60); // 60 seconds warning countdown

  const lastActiveRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!user) {
      setShowWarning(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    const resetActivity = () => {
      lastActiveRef.current = Date.now();
      if (showWarning) {
        setShowWarning(false);
        setTimeLeft(60);
      }
    };

    // Events to track user activity
    const events = ["mousemove", "mousedown", "keypress", "scroll", "touchstart", "click"];
    events.forEach((evt) => {
      window.addEventListener(evt, resetActivity, { passive: true });
    });

    // Main inactivity check running every second
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActiveRef.current;

      if (elapsed >= INACTIVITY_TIME) {
        // Exceeded 15 minutes, trigger logout
        clearInterval(timerRef.current!);
        if (countdownRef.current) clearInterval(countdownRef.current);
        logout();
      } else if (elapsed >= INACTIVITY_TIME - WARNING_TIME) {
        // In warning zone (last 60 seconds)
        const secondsRemaining = Math.max(0, Math.ceil((INACTIVITY_TIME - elapsed) / 1000));
        setTimeLeft(secondsRemaining);
        setShowWarning(true);
      } else {
        // User is active, ensure warning is hidden
        if (showWarning) {
          setShowWarning(false);
        }
      }
    }, 1000);

    return () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, resetActivity);
      });
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [user, showWarning, logout]);

  // Handle manual sign out from the countdown warning
  const handleSignOutNow = async () => {
    setShowWarning(false);
    await logout();
  };

  // Reset timer on clicking keep session
  const handleKeepMeSignedIn = () => {
    lastActiveRef.current = Date.now();
    setShowWarning(false);
    setTimeLeft(60);
  };

  if (!user || !showWarning) return null;

  const isFr = language === "fr";
  const isHt = language === "ht";

  const title = isFr
    ? "Alerte de Déconnexion Imminente"
    : isHt
    ? "Avètisman Dekoneksyon Rapid"
    : "Inactivity Timeout Approaching";

  const desc = isFr
    ? "Pour votre sécurité, vous serez automatiquement déconnecté en raison de votre inactivité."
    : isHt
    ? "Pou sekirite w, sistèm nan ap dekonekte w paske ou pa fè anyen sou li depi kèk tan."
    : "For your security, you will be logged out automatically due to inactivity.";

  const keepBtn = isFr ? "Rester connecté" : isHt ? "Rete konekte" : "Keep me signed in";
  const signoutBtn = isFr ? "Se déconnecter" : isHt ? "Dekonekte kounye a" : "Sign out now";
  const secondsLabel = isFr ? "secondes" : isHt ? "segond" : "seconds";

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl select-none"
        id="inactivity-overlay"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="bg-slate-900 border border-slate-800/80 text-slate-100 rounded-3xl p-6 shadow-2xl max-w-md w-full mx-4 relative overflow-hidden"
          id="inactivity-modal"
        >
          {/* Header Accent */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500"></div>

          {/* Icon and Title */}
          <div className="flex items-start gap-4 mb-5 mt-2">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6 text-amber-500 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm uppercase font-black tracking-wider text-amber-400">
                {title}
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                {desc}
              </p>
            </div>
          </div>

          {/* Countdown Display Circular-style */}
          <div className="bg-slate-950/60 border border-slate-850 p-6 rounded-2xl flex flex-col items-center justify-center gap-2 my-4">
            <div className="relative w-20 h-20 flex items-center justify-center">
              {/* Spinning / glowing accent ring */}
              <div className="absolute inset-0 rounded-full border-2 border-slate-800"></div>
              <svg className="absolute w-20 h-20 -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="url(#countdownGradient)"
                  strokeWidth="3.5"
                  fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 36}`}
                  strokeDashoffset={`${((60 - timeLeft) / 60) * (2 * Math.PI * 36)}`}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-linear"
                />
                <defs>
                  <linearGradient id="countdownGradient" x1="1" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="flex flex-col items-center justify-center">
                <span className="text-2xl font-mono font-black text-white leading-none">
                  {timeLeft}
                </span>
                <span className="text-[8px] text-slate-500 font-bold uppercase mt-1 leading-none">
                  {secondsLabel}
                </span>
              </div>
            </div>
            <p className="text-[10px] font-mono text-rose-400 mt-2 flex items-center gap-1">
              <Clock className="w-3 h-3 animate-spin" /> SECURE_IDLE_TIMEOUT_WARN
            </p>
          </div>

          {/* Control Buttons */}
          <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
            <button
              onClick={handleKeepMeSignedIn}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-extrabold text-xs uppercase tracking-wider py-3 rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-900/10 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              {keepBtn}
            </button>
            <button
              onClick={handleSignOutNow}
              className="bg-slate-950 border border-slate-800 hover:bg-slate-900 text-rose-400 hover:text-rose-300 font-extrabold text-xs uppercase tracking-wider py-3 px-5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              {signoutBtn}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
