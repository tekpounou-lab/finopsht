export interface OnboardingDraft {
  activeState: "SELECT_PATH" | "CREATE" | "JOIN" | "WAITING_APPROVAL" | "INVITATION";
  wizardStep: number;
  businessFormData: {
    personalName: string;
    businessName: string;
    nif: string;
    domain: string;
    branchName: string;
    location: string;
  };
  joinCode: string;
  lastSavedAt: string;
}

const DEFAULT_DRAFT: OnboardingDraft = {
  activeState: "SELECT_PATH",
  wizardStep: 1,
  businessFormData: {
    personalName: "",
    businessName: "",
    nif: "",
    domain: "SME",
    branchName: "Siège Social",
    location: "Port-au-Prince"
  },
  joinCode: "",
  lastSavedAt: new Date().toISOString()
};

export class OnboardingDraftManager {
  private static getKey(uid: string): string {
    return `finops_onboarding_draft_v2_${uid}`;
  }

  static getDraft(uid: string): OnboardingDraft {
    if (!uid) return DEFAULT_DRAFT;
    try {
      const raw = sessionStorage.getItem(this.getKey(uid));
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_DRAFT,
          ...parsed,
          businessFormData: {
            ...DEFAULT_DRAFT.businessFormData,
            ...(parsed.businessFormData || {})
          }
        };
      }
    } catch (e) {
      console.warn("[OnboardingDraftManager] Failed to read draft from sessionStorage:", e);
    }
    return DEFAULT_DRAFT;
  }

  static saveDraft(uid: string, updates: Partial<OnboardingDraft>): void {
    if (!uid) return;
    try {
      const current = this.getDraft(uid);
      const updated: OnboardingDraft = {
        ...current,
        ...updates,
        businessFormData: {
          ...current.businessFormData,
          ...(updates.businessFormData || {})
        },
        lastSavedAt: new Date().toISOString()
      };
      sessionStorage.setItem(this.getKey(uid), JSON.stringify(updated));
    } catch (e) {
      console.warn("[OnboardingDraftManager] Failed to save draft to sessionStorage:", e);
    }
  }

  static clearDraft(uid: string): void {
    if (!uid) return;
    try {
      sessionStorage.removeItem(this.getKey(uid));
    } catch (e) {
      console.warn("[OnboardingDraftManager] Failed to clear draft from sessionStorage:", e);
    }
  }
}
