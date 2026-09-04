import { useState, useCallback } from "react";
import { SalaryStructure, SalaryAdvance, PayrollBonus, PayrollDeduction } from "../../../types";

export type PayrollTabType = "dashboard" | "structures" | "advances" | "bonuses_deductions" | "payslips";

export function usePayrollUIState(initialTab: PayrollTabType = "dashboard") {
  const [activeTab, setActiveTab] = useState<PayrollTabType>(initialTab);

  // Modals & Editing entities
  const [editingStructure, setEditingStructure] = useState<Partial<SalaryStructure> | null>(null);
  const [showStructureModal, setShowStructureModal] = useState<boolean>(false);

  const [editingAdvance, setEditingAdvance] = useState<Partial<SalaryAdvance> | null>(null);
  const [showAdvanceModal, setShowAdvanceModal] = useState<boolean>(false);

  const [editingBonus, setEditingBonus] = useState<Partial<PayrollBonus> | null>(null);
  const [showBonusModal, setShowBonusModal] = useState<boolean>(false);

  const [editingDeduction, setEditingDeduction] = useState<Partial<PayrollDeduction> | null>(null);
  const [showDeductionModal, setShowDeductionModal] = useState<boolean>(false);

  const [selectedPayslipEmployeeId, setSelectedPayslipEmployeeId] = useState<string | null>(null);

  // Confirmation dialog IDs
  const [advIdToConfirm, setAdvIdToConfirm] = useState<string | null>(null);
  const [bonusIdToConfirm, setBonusIdToConfirm] = useState<string | null>(null);
  const [deductionIdToConfirm, setDeductionIdToConfirm] = useState<string | null>(null);

  // Live projection vs snapshot mode
  const [liveProjectionMode, setLiveProjectionMode] = useState<boolean>(true);
  const [activeCycleId, setActiveCycleId] = useState<string>("");

  const resetModals = useCallback(() => {
    setShowStructureModal(false);
    setEditingStructure(null);
    setShowAdvanceModal(false);
    setEditingAdvance(null);
    setShowBonusModal(false);
    setEditingBonus(null);
    setShowDeductionModal(false);
    setEditingDeduction(null);
    setSelectedPayslipEmployeeId(null);
    setAdvIdToConfirm(null);
    setBonusIdToConfirm(null);
    setDeductionIdToConfirm(null);
  }, []);

  return {
    activeTab,
    setActiveTab,
    editingStructure,
    setEditingStructure,
    showStructureModal,
    setShowStructureModal,
    editingAdvance,
    setEditingAdvance,
    showAdvanceModal,
    setShowAdvanceModal,
    editingBonus,
    setEditingBonus,
    showBonusModal,
    setShowBonusModal,
    editingDeduction,
    setEditingDeduction,
    showDeductionModal,
    setShowDeductionModal,
    selectedPayslipEmployeeId,
    setSelectedPayslipEmployeeId,
    advIdToConfirm,
    setAdvIdToConfirm,
    bonusIdToConfirm,
    setBonusIdToConfirm,
    deductionIdToConfirm,
    setDeductionIdToConfirm,
    liveProjectionMode,
    setLiveProjectionMode,
    activeCycleId,
    setActiveCycleId,
    resetModals
  };
}
