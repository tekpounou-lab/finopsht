import React from "react";
import { Bell, X, Check, Clock, AlertTriangle, ShieldCheck } from "lucide-react";

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    timestamp: string;
    type?: "INFO" | "WARNING" | "SUCCESS";
  }>;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  notifications,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-xs">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-sm h-full p-5 shadow-2xl flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 text-white font-bold text-xs">
              <Bell className="w-4 h-4 text-indigo-400" />
              <span>Centre de Notifications</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2.5 overflow-y-auto max-h-[calc(100vh-140px)]">
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Aucune notification non lue.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{n.title}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(n.timestamp).toLocaleTimeString("fr-FR")}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px]">{n.message}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
        >
          Fermer
        </button>
      </div>
    </div>
  );
};
