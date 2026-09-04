import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, SlidersHorizontal, Globe, Languages, Clock } from "lucide-react";

export const Drawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  position?: "right" | "left";
}> = ({ isOpen, onClose, title, children, position = "right" }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[9999] flex">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        />
        <motion.div
          initial={{ x: position === "right" ? "100%" : "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: position === "right" ? "100%" : "-100%" }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={`relative z-10 w-full sm:w-[480px] h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col ${
            position === "right" ? "ml-auto" : "mr-auto"
          }`}
        >
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-100">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

export const SidePanel = Drawer;
export const InspectorPanel = Drawer;
export const DetailsPanel = Drawer;

export const PopoverMenu: React.FC<{
  trigger: React.ReactNode;
  children: React.ReactNode;
}> = ({ trigger, children }) => {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative inline-block">
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div
          className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 shadow-2xl rounded-xl p-1 z-50 animate-fadeIn"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export const ContextMenu = PopoverMenu;

export const FloatingToolbar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-slate-900/90 border border-slate-800 backdrop-blur-md rounded-2xl shadow-2xl flex items-center gap-3">
    {children}
  </div>
);

export const BottomSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ isOpen, onClose, title, children }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[9999] flex items-end">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        />
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: 0.25 }}
          className="relative z-10 w-full max-h-[85vh] bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 overflow-y-auto"
        >
          <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <h3 className="text-base font-bold text-slate-100">{title}</h3>
            <button type="button" onClick={onClose} className="text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>
          {children}
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

export const MobileActionBar = FloatingToolbar;
export const FloatingActionButton: React.FC<{ onClick: () => void; icon: React.ReactNode }> = ({
  onClick,
  icon
}) => (
  <button
    type="button"
    onClick={onClick}
    className="fixed bottom-6 right-6 z-40 p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-2xl transition cursor-pointer"
  >
    {icon}
  </button>
);

export const SwipeActions = () => null;
export const MobileFilters = BottomSheet;
export const ResponsiveToolbar = FloatingToolbar;

export const CountryPicker: React.FC<{ value?: string; onChange: (code: string) => void }> = ({
  value,
  onChange
}) => (
  <div className="relative">
    <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <select
      value={value || "HT"}
      onChange={(e) => onChange(e.target.value)}
      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
    >
      <option value="HT">Haïti (HT)</option>
      <option value="US">États-Unis (US)</option>
      <option value="FR">France (FR)</option>
      <option value="CA">Canada (CA)</option>
      <option value="DR">République Dominicaine (DO)</option>
    </select>
  </div>
);

export const LanguagePicker: React.FC<{ value?: string; onChange: (lang: string) => void }> = ({
  value,
  onChange
}) => (
  <div className="relative">
    <Languages className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <select
      value={value || "fr"}
      onChange={(e) => onChange(e.target.value)}
      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
    >
      <option value="fr">Français</option>
      <option value="ht">Kreyòl Ayisyen</option>
      <option value="en">English</option>
      <option value="es">Español</option>
    </select>
  </div>
);

export const TimezonePicker: React.FC<{ value?: string; onChange: (tz: string) => void }> = ({
  value,
  onChange
}) => (
  <div className="relative">
    <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <select
      value={value || "America/Port-au-Prince"}
      onChange={(e) => onChange(e.target.value)}
      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
    >
      <option value="America/Port-au-Prince">Port-au-Prince (EST -05:00)</option>
      <option value="America/New_York">New York (EST -05:00)</option>
      <option value="Europe/Paris">Paris (CET +01:00)</option>
    </select>
  </div>
);

export const IconPicker = () => null;
export const ColorPicker = () => null;
export const EmojiPicker = () => null;
