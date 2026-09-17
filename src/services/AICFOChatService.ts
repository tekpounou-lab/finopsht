import { Business, Branch, Employee, LedgerTransaction, AttendanceRecord, PayrollRecord } from "../types";
import { safeFetchJson } from "../utils/safeFetch";
import { AICFOPermissionEngine } from "./cfo/AICFOPermissionEngine";
import { AICFODataMasking } from "./cfo/AICFODataMasking";
import { AICFOAuditService } from "./cfo/AICFOAuditService";
import { IdentityUserContext } from "./cfo/AICFOGovernanceTypes";

export interface CFOReport {
  summary: string;
  metrics: {
    cash_flow: string;
    fraud_risk: string;
    profit_ratio: string;
    financial_health_score?: number;
  };
  alerts: { type: "info" | "warning" | "success"; text: string }[];
  recommendations: string[];
  chartsData?: { name: string; value: number }[];
  predictions?: {
    next_fortnight_payroll: number;
    end_of_month_cash_flow: number;
    absenteeism_rate_percentage: number;
    budget_overrun_risk: "FAIBLE" | "MOYEN" | "ÉLEVÉ" | "LOW" | "NORMAL" | "HIGH";
    estimated_monthly_profit: number;
    forecast_justification: string;
  };
  governance?: {
    role: string;
    permission_result: string;
    security_level: string;
    masked_fields?: string[];
  };
}

export interface AICFOChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  report?: CFOReport;
  timestamp: string;
}

export class AICFOChatService {
  /**
   * Queries the server-side Gemini AI CFO analyzer endpoint with full Role-Based Governance Context.
   */
  static async queryCFO(params: {
    business: Business;
    branch: Branch | null;
    employees: Employee[];
    ledger: LedgerTransaction[];
    attendance: AttendanceRecord[];
    payroll: PayrollRecord[];
    userQuestion: string;
    snapshot?: any;
    userContext?: Partial<IdentityUserContext>;
  }): Promise<CFOReport> {
    const { business, branch, employees, ledger, attendance, payroll, userQuestion, snapshot, userContext } = params;

    const resolvedUserContext: IdentityUserContext = {
      userId: userContext?.userId || "usr_current",
      userName: userContext?.userName || "Opérateur FinOps",
      userEmail: userContext?.userEmail || "",
      role: userContext?.role || "OWNER",
      businessId: userContext?.businessId || business.id || "biz_demo",
      branchId: userContext?.branchId || branch?.id || null,
      departmentId: userContext?.departmentId || null
    };

    // Pre-flight client-side permission evaluation
    const evaluation = AICFOPermissionEngine.evaluate(resolvedUserContext, userQuestion);

    if (!evaluation.allowed) {
      // Log refusal audit
      await AICFOAuditService.logAudit({
        business_id: resolvedUserContext.businessId,
        user_id: resolvedUserContext.userId,
        user_name: resolvedUserContext.userName,
        role: resolvedUserContext.role,
        branch_id: resolvedUserContext.branchId,
        department_id: resolvedUserContext.departmentId,
        question: userQuestion,
        data_accessed: evaluation.dataAccessed,
        permission_result: "DENIED",
        ai_response_type: "SECURITY_REFUSAL",
        security_level: evaluation.securityLevel,
        refusal_reason: evaluation.refusalReason
      });

      return {
        summary: evaluation.refusalMessage || "🛡️ [SÉCURITÉ AI CFO] : Accès refusé en vertu de vos droits RBAC.",
        metrics: {
          cash_flow: "[ACCÈS REFUSÉ]",
          fraud_risk: "LOW",
          profit_ratio: "[MASQUÉ]",
          financial_health_score: 0
        },
        alerts: [
          {
            type: "warning",
            text: `Accès non autorisé aux données de niveau ${evaluation.securityLevel} pour le rôle ${resolvedUserContext.role}.`
          }
        ],
        recommendations: [
          `Périmètre autorisé pour le rôle ${resolvedUserContext.role} : ${evaluation.policy.allowedDataCategories.join(", ")}.`
        ],
        governance: {
          role: resolvedUserContext.role,
          permission_result: "DENIED",
          security_level: evaluation.securityLevel
        }
      };
    }

    try {
      const report: CFOReport = await safeFetchJson<CFOReport>("/api/cfo/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          business,
          branch,
          employees,
          ledger,
          attendance,
          payroll,
          userQuestion,
          snapshot,
          userContext: resolvedUserContext
        }),
      });

      return report;
    } catch (error: any) {
      console.error("[AICFOChatService API Governance Fallback Helper]:", error);
      
      // Dynamic local fallbacks when server routes or networks fail with governance
      return this.generateImmediateLocalReport({
        business,
        ledger,
        employees,
        attendance,
        payroll,
        userQuestion,
        snapshot,
        errorString: error.message || String(error),
        userContext: resolvedUserContext
      });
    }
  }

  /**
   * Generates a governance-compliant structural diagnostic fallback report if the server is offline or fails.
   * STRICT SSOT: Uses canonical AnalyticsSnapshot if provided; otherwise reports NO_DATA rather than summing raw ledger entries.
   */
  private static generateImmediateLocalReport(params: {
    business: Business;
    ledger: LedgerTransaction[];
    employees: Employee[];
    attendance: AttendanceRecord[];
    payroll: PayrollRecord[];
    userQuestion: string;
    errorString: string;
    userContext: IdentityUserContext;
    snapshot?: any;
  }): CFOReport {
    const { business, ledger, employees, attendance, payroll, userQuestion, errorString, userContext, snapshot } = params;

    // Apply data masking to local dataset
    const maskedLists = AICFODataMasking.maskRawDataLists({
      employees,
      ledger,
      attendance,
      payroll
    }, userContext);

    let totalRevenue = 0;
    let totalExpenses = 0;
    let netProfit = 0;
    let hasCanonicalSnapshot = false;

    // FROZEN SSOT INVARIANT: Extract macro metrics strictly from AnalyticsSnapshot if available
    if (snapshot) {
      hasCanonicalSnapshot = true;
      if (snapshot.incomeStatement) {
        const revCents = Number(snapshot.incomeStatement.revenue?.totalRevenueCents ?? snapshot.incomeStatement.totalRevenueCents ?? 0);
        const expCents = Number(snapshot.incomeStatement.expenses?.totalExpensesCents ?? snapshot.incomeStatement.totalExpensesCents ?? 0);
        const netCents = Number(snapshot.incomeStatement.netIncomeCents ?? (revCents - expCents));
        totalRevenue = revCents / 100;
        totalExpenses = expCents / 100;
        netProfit = netCents / 100;
      } else if (snapshot.metrics) {
        totalRevenue = Number(snapshot.metrics.revenue?.totalHTG ?? snapshot.metrics.revenue?.currentValue ?? 0);
        totalExpenses = Number(snapshot.metrics.expenses?.totalHTG ?? snapshot.metrics.expenses?.currentValue ?? 0);
        netProfit = Number(snapshot.metrics.profit?.netHTG ?? snapshot.metrics.profit?.netProfit ?? (totalRevenue - totalExpenses));
      } else {
        totalRevenue = Number(snapshot.revenue?.currentValue ?? (typeof snapshot.revenue === "number" ? snapshot.revenue : snapshot.totalRevenue ?? 0));
        totalExpenses = Number(snapshot.expenses?.currentValue ?? (typeof snapshot.expenses === "number" ? snapshot.expenses : snapshot.totalExpenses ?? 0));
        netProfit = Number(snapshot.profit?.currentValue ?? snapshot.netProfit ?? (typeof snapshot.profit === "number" ? snapshot.profit : snapshot.netIncome ?? (totalRevenue - totalExpenses)));
      }
    }

    const isOwner = userContext.role === "OWNER";
    
    // Dynamic derivation of health score (0-100) or undefined if no snapshot
    let financialHealthScore: number | undefined = undefined;
    if (hasCanonicalSnapshot && totalRevenue > 0) {
      const marginPct = (netProfit / totalRevenue) * 100;
      financialHealthScore = Math.max(0, Math.min(100, Math.round(50 + (marginPct >= 20 ? 30 : marginPct >= 0 ? 15 : -20) + (isOwner ? 10 : 0))));
    }

    return {
      summary: `[Analyste Hors-ligne Gouverné] Diagnostic de secours pour ${business.name || "FinOps"}. Question : "${userQuestion}". (Rôle: ${userContext.role})`,
      metrics: {
        cash_flow: hasCanonicalSnapshot ? (isOwner ? `${netProfit >= 0 ? "+" : ""}${netProfit.toLocaleString()} HTG` : "[MASQUÉ / DEPT_LEVEL]") : "[DONNÉES INDISPONIBLES / NO_DATA]",
        fraud_risk: "LOW",
        profit_ratio: hasCanonicalSnapshot && isOwner && totalRevenue > 0 ? `${((netProfit / totalRevenue) * 100).toFixed(1)}%` : (hasCanonicalSnapshot ? "[MASQUÉ]" : "[DONNÉES INDISPONIBLES / NO_DATA]"),
        financial_health_score: financialHealthScore,
      },
      alerts: [
        {
          type: "info",
          text: `Mode Résilience Local Actif • Gouvernance RBAC Appliquée pour le rôle ${userContext.role}.`,
        },
      ],
      recommendations: [
        "Vérifier la connectivité réseau du serveur AI CFO Governance.",
        "Vos droits d'accès ont été validés localement avant d'afficher ce rapport.",
      ],
      governance: {
        role: userContext.role,
        permission_result: "ALLOW_LOCAL_FALLBACK",
        security_level: "INTERNAL"
      }
    };
  }
}
