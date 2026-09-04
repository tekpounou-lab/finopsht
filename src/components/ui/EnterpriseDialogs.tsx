import React from "react";
import { AdaptiveModal, ModalAction } from "./AdaptiveModal";
import { 
  AlertTriangle, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Info, 
  Sparkles, 
  Maximize2 
} from "lucide-react";

export interface StandardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  confirmOnEnter?: boolean;
}

export const ConfirmationDialog: React.FC<StandardDialogProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  onConfirm,
  loading,
  disabled,
  confirmOnEnter = true
}) => (
  <AdaptiveModal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    subtitle={subtitle}
    icon={<HelpCircle className="w-5 h-5 sm:w-6 sm:h-6" />}
    iconVariant="blue"
    confirmOnEnter={confirmOnEnter}
    primaryAction={{
      label: confirmLabel,
      onClick: onConfirm,
      loading,
      disabled,
      variant: "blue"
    }}
    secondaryAction={{
      label: cancelLabel,
      onClick: onClose
    }}
  >
    {children}
  </AdaptiveModal>
);

export const DeleteDialog: React.FC<StandardDialogProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  confirmLabel = "Supprimer définitivement",
  cancelLabel = "Annuler",
  onConfirm,
  loading,
  disabled
}) => (
  <AdaptiveModal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    subtitle={subtitle || "Cette action est irréversible."}
    icon={<Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />}
    iconVariant="rose"
    primaryAction={{
      label: confirmLabel,
      onClick: onConfirm,
      loading,
      disabled,
      variant: "rose"
    }}
    secondaryAction={{
      label: cancelLabel,
      onClick: onClose
    }}
  >
    {children}
  </AdaptiveModal>
);

export const ApproveDialog: React.FC<StandardDialogProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  confirmLabel = "Approuver",
  cancelLabel = "Annuler",
  onConfirm,
  loading,
  disabled
}) => (
  <AdaptiveModal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    subtitle={subtitle}
    icon={<CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />}
    iconVariant="emerald"
    primaryAction={{
      label: confirmLabel,
      onClick: onConfirm,
      loading,
      disabled,
      variant: "emerald"
    }}
    secondaryAction={{
      label: cancelLabel,
      onClick: onClose
    }}
  >
    {children}
  </AdaptiveModal>
);

export const RejectDialog: React.FC<StandardDialogProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  confirmLabel = "Rejeter",
  cancelLabel = "Annuler",
  onConfirm,
  loading,
  disabled
}) => (
  <AdaptiveModal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    subtitle={subtitle}
    icon={<XCircle className="w-5 h-5 sm:w-6 sm:h-6" />}
    iconVariant="rose"
    primaryAction={{
      label: confirmLabel,
      onClick: onConfirm,
      loading,
      disabled,
      variant: "rose"
    }}
    secondaryAction={{
      label: cancelLabel,
      onClick: onClose
    }}
  >
    {children}
  </AdaptiveModal>
);

export const WarningDialog: React.FC<StandardDialogProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  confirmLabel = "Compris, continuer",
  cancelLabel = "Annuler",
  onConfirm,
  loading,
  disabled
}) => (
  <AdaptiveModal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    subtitle={subtitle}
    icon={<AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />}
    iconVariant="amber"
    primaryAction={{
      label: confirmLabel,
      onClick: onConfirm,
      loading,
      disabled,
      variant: "amber"
    }}
    secondaryAction={{
      label: cancelLabel,
      onClick: onClose
    }}
  >
    {children}
  </AdaptiveModal>
);

export const SuccessDialog: React.FC<Omit<StandardDialogProps, "cancelLabel"> & { okLabel?: string }> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  okLabel = "Terminé",
  onConfirm
}) => (
  <AdaptiveModal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    subtitle={subtitle}
    icon={<CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />}
    iconVariant="emerald"
    primaryAction={{
      label: okLabel,
      onClick: onConfirm || onClose,
      variant: "emerald"
    }}
  >
    {children}
  </AdaptiveModal>
);

export const ErrorDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  errorDetails?: string | React.ReactNode;
}> = ({
  isOpen,
  onClose,
  title = "Une erreur est survenue",
  subtitle = "Veuillez vérifier vos informations ou réessayer.",
  errorDetails
}) => (
  <AdaptiveModal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    subtitle={subtitle}
    icon={<XCircle className="w-5 h-5 sm:w-6 sm:h-6" />}
    iconVariant="rose"
    primaryAction={{
      label: "Fermer",
      onClick: onClose,
      variant: "rose"
    }}
  >
    <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs font-mono break-words max-h-48 overflow-y-auto">
      {errorDetails || "Aucun détail technique disponible."}
    </div>
  </AdaptiveModal>
);

export interface WizardStep {
  id: string;
  title: string;
  subtitle?: string;
  content: React.ReactNode;
}

export const WizardDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  steps: WizardStep[];
  currentStepIndex: number;
  onStepChange: (index: number) => void;
  onComplete: () => void | Promise<void>;
  loading?: boolean;
}> = ({
  isOpen,
  onClose,
  title,
  steps,
  currentStepIndex,
  onStepChange,
  onComplete,
  loading
}) => {
  const currentStep = steps[currentStepIndex] || steps[0];
  const isLastStep = currentStepIndex === steps.length - 1;

  return (
    <AdaptiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={`Étape ${currentStepIndex + 1} sur ${steps.length}: ${currentStep?.title || ""}`}
      icon={<Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />}
      iconVariant="blue"
      maxWidthClass="w-[95%] sm:w-[85%] md:w-[75%] lg:w-[65%] xl:w-[55%] max-w-3xl"
      primaryAction={{
        label: isLastStep ? "Finaliser" : "Suivant",
        onClick: () => {
          if (isLastStep) {
            onComplete();
          } else {
            onStepChange(currentStepIndex + 1);
          }
        },
        loading,
        variant: "blue"
      }}
      secondaryAction={{
        label: currentStepIndex === 0 ? "Annuler" : "Précédent",
        onClick: () => {
          if (currentStepIndex === 0) {
            onClose();
          } else {
            onStepChange(currentStepIndex - 1);
          }
        }
      }}
    >
      <div className="space-y-4">
        {/* Progress Bar */}
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`h-full flex-1 transition-all duration-300 ${
                idx <= currentStepIndex ? "bg-blue-500" : "bg-transparent"
              } ${idx > 0 ? "border-l border-slate-900" : ""}`}
            />
          ))}
        </div>

        <div>{currentStep?.content}</div>
      </div>
    </AdaptiveModal>
  );
};

export const FullscreenDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  actions
}) => (
  <AdaptiveModal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    subtitle={subtitle}
    icon={<Maximize2 className="w-5 h-5 sm:w-6 sm:h-6" />}
    iconVariant="slate"
    maxWidthClass="w-[98%] h-[96vh] max-w-none"
    tertiaryAction={actions}
  >
    <div className="h-full flex flex-col">{children}</div>
  </AdaptiveModal>
);
