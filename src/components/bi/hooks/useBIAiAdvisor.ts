import { useState, useEffect } from "react";
import { safeFetchJson } from "../../../utils/safeFetch";
import { FinancialRatioEngine } from "../../../services/cfo/FinancialRatioEngine";
import { getLocalIP } from "../../../data";
import { finopsEventOrchestrator } from "../../../services/finopsEventOrchestrator";
import { Business, Branch, Employee, LedgerTransaction, AttendanceRecord, PayrollRecord, ForensicLog, Role } from "../../../types";
import { useOptionalAuth } from "../../../hooks/useAuth";
import { ForensicLogRepository } from "../../../repositories/ForensicLogRepository";

interface UseBIAiAdvisorParams {
  currentBusiness?: Business;
  currentBranch?: Branch | null;
  selectedBranchId: string;
  selectedDeptId: string;
  branches: Branch[];
  filteredEmployees: Employee[];
  filteredTx: LedgerTransaction[];
  filteredAttendance: AttendanceRecord[];
  payrollRecords: PayrollRecord[];
  snapshot: any;
  currentRole: Role;
  onAddForensicLog: (log: ForensicLog) => void;
  isAuthorized: boolean;
}

export function useBIAiAdvisor({
  currentBusiness,
  currentBranch,
  selectedBranchId,
  selectedDeptId,
  branches,
  filteredEmployees,
  filteredTx,
  filteredAttendance,
  payrollRecords,
  snapshot,
  currentRole,
  onAddForensicLog,
  isAuthorized,
}: UseBIAiAdvisorParams) {
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState<any | null>(null);

  const authState = useOptionalAuth();
  const authUser = authState?.user || null;
  const authIdentity = authState?.identity || null;
  const authDbUser = authState?.dbUser || null;
  const authDbEmployee = authState?.dbEmployee || null;

  const handleGenerateAiReport = async () => {
    if (!currentBusiness) return;
    setAiLoading(true);
    setAiReport(null);

    // Audit action trigger with verified identity
    const actorUid = authUser?.uid || "SYSTEM";
    const resolvedUserName =
      authIdentity?.displayName ||
      authIdentity?.userProfile?.name ||
      authIdentity?.employee?.name ||
      authDbEmployee?.name ||
      authDbUser?.name ||
      authUser?.displayName ||
      authUser?.email ||
      actorUid;

    const forecastLog = await ForensicLogRepository.createAndSignLog({
      timestamp: new Date().toISOString(),
      actorId: actorUid,
      userId: actorUid,
      userName: resolvedUserName,
      userRole: currentRole,
      userEmail: authUser?.email || undefined,
      business_id: currentBusiness.id,
      action: "GENERATE_AI_REPORT",
      beforeState: JSON.stringify({ query: aiQuery }),
      afterState: JSON.stringify({ triggered: true, scope: selectedBranchId }),
      details: `Generated AI Advisor report for branch ${selectedBranchId || "ALL"} with query: ${aiQuery || "DEFAULT_OPERATIONAL"}`,
      ipAddress: getLocalIP(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "UNKNOWN",
      severity: "AUDIT_GRADE",
    });
    onAddForensicLog(forecastLog);

    const payload = {
      business: currentBusiness,
      branch: currentBranch || branches.find((b) => b.id === selectedBranchId) || null,
      employees: filteredEmployees.slice(0, 500),
      ledger: filteredTx.slice(0, 1000),
      attendance: filteredAttendance.slice(0, 1000),
      payroll: payrollRecords.slice(0, 500),
      userQuestion: aiQuery || "Analyse la rentabilité opérationnelle globale, les contributions fiscales et l'optimisation des structures.",
      snapshot,
    };

    try {
      const info = await safeFetchJson("/api/cfo/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setAiReport(info);
      finopsEventOrchestrator.emit("AI_CFO", currentBusiness.id, { action: "AI_CFO_ANALYSIS_COMPLETED" });
    } catch (err: any) {
      console.warn("[useBIAiAdvisor] API report response unavailable, activating FinancialRatioEngine fallback:", err?.message || err);
      const fallbackReport = FinancialRatioEngine.calculate(payload, err?.message || "Service momentanément indisponible");
      setAiReport(fallbackReport);
      finopsEventOrchestrator.emit("AI_CFO", currentBusiness.id, { action: "AI_CFO_ANALYSIS_COMPLETED", offline: true });
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized && currentBusiness) {
      handleGenerateAiReport();
    }
  }, [selectedBranchId, selectedDeptId]);

  return {
    aiQuery,
    setAiQuery,
    aiLoading,
    aiReport,
    handleGenerateAiReport,
  };
}
