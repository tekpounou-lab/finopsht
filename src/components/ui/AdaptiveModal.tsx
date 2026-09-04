import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2 } from "lucide-react";

export interface ModalAction {
  label: React.ReactNode;
  onClick: () => void | Promise<void>;
  variant?: "emerald" | "rose" | "amber" | "blue" | "slate";
  loading?: boolean;
  disabled?: boolean;
  id?: string;
}

export interface AdaptiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  iconVariant?: "emerald" | "rose" | "amber" | "blue" | "slate";
  children: React.ReactNode;
  primaryAction?: ModalAction;
  secondaryAction?: ModalAction;
  tertiaryAction?: React.ReactNode;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  confirmOnEnter?: boolean;
  ariaLabel?: string;
  ariaDescription?: string;
  maxWidthClass?: string;
}

const ICON_VARIANT_CLASSES = {
  emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  rose: "bg-rose-500/10 border-rose-500/30 text-rose-400",
  amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  blue: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  slate: "bg-slate-800 border-slate-700 text-slate-300"
};

const BUTTON_VARIANT_CLASSES = {
  emerald: "bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold shadow-emerald-500/20",
  rose: "bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-slate-100 font-bold shadow-rose-600/20",
  amber: "bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold shadow-amber-500/20",
  blue: "bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-slate-100 font-bold shadow-blue-600/20",
  slate: "bg-slate-800 hover:bg-slate-700 active:bg-slate-850 border border-slate-700 text-slate-200 font-semibold"
};

export const AdaptiveModal: React.FC<AdaptiveModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  iconVariant = "blue",
  children,
  primaryAction,
  secondaryAction,
  tertiaryAction,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  confirmOnEnter = false,
  ariaLabel,
  ariaDescription,
  maxWidthClass = "md:max-w-2xl"
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  // Keyboard navigation: Escape & Enter
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnEscape) {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && confirmOnEnter && primaryAction && !primaryAction.disabled && !primaryAction.loading) {
        e.preventDefault();
        primaryAction.onClick();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEscape, confirmOnEnter, onClose, primaryAction]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center p-0 md:p-6 lg:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === "string" ? title : ariaLabel || "Enterprise Dialog"}
          aria-describedby={ariaDescription}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            onClick={() => closeOnBackdropClick && onClose()}
          />

          {/* Adaptive Dialog Box */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 50 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={`relative z-10 flex flex-col max-h-[90vh] md:max-h-[calc(100vh-4rem)] w-full bg-slate-900 border-t md:border border-slate-800/90 shadow-2xl rounded-t-2xl md:rounded-b-2xl overflow-hidden ${maxWidthClass}`}
          >
            {/* Header - Fixed & Pinned */}
            <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-800/80 flex items-start justify-between gap-4 shrink-0 bg-slate-900/95 backdrop-blur-sm">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                {icon && (
                  <div className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border shrink-0 ${ICON_VARIANT_CLASSES[iconVariant]}`}>
                    {icon}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight leading-snug truncate">
                    {title}
                  </h3>
                  {subtitle && (
                    <p className="text-xs sm:text-sm text-slate-400 font-medium leading-normal mt-0.5">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="p-2 -mr-1 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition cursor-pointer shrink-0"
                aria-label="Fermer la fenêtre"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body - Independently Scrollable */}
            <div className="px-5 py-4 sm:px-6 sm:py-5 flex-1 overflow-y-auto space-y-4 text-slate-300 text-xs sm:text-sm leading-relaxed">
              {children}
            </div>

            {/* Footer - Fixed & Pinned */}
            {(primaryAction || secondaryAction || tertiaryAction) && (
              <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-t border-slate-800/80 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 shrink-0 bg-slate-900/95 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  {tertiaryAction}
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 w-full sm:w-auto">
                  {secondaryAction && (
                    <button
                      type="button"
                      id={secondaryAction.id || "btn-modal-secondary"}
                      onClick={secondaryAction.onClick}
                      disabled={secondaryAction.disabled || secondaryAction.loading}
                      className="w-full sm:w-auto min-h-[48px] sm:min-h-[40px] px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-700/90 active:bg-slate-850 text-slate-200 text-xs sm:text-sm font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {secondaryAction.loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                      <span>{secondaryAction.label}</span>
                    </button>
                  )}

                  {primaryAction && (
                    <button
                      type="button"
                      id={primaryAction.id || "btn-modal-primary"}
                      onClick={primaryAction.onClick}
                      disabled={primaryAction.disabled || primaryAction.loading}
                      className={`w-full sm:w-auto min-h-[48px] sm:min-h-[40px] px-5 py-2.5 rounded-xl text-xs sm:text-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg ${BUTTON_VARIANT_CLASSES[primaryAction.variant || "emerald"]}`}
                    >
                      {primaryAction.loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                      <span>{primaryAction.label}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
