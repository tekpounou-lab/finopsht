import { useRef, useEffect } from "react";
import { AnalyticsSnapshot } from "../domains/analytics/types";

export interface SnapshotDiagnostics {
  renderCount: number;
  semanticChangeCount: number;
  identicalRenderCount: number;
  isSemanticChange: boolean;
}

/**
 * Computes a deterministic semantic signature for an AnalyticsSnapshot
 * to distinguish referential churn from actual data/value changes.
 */
export function getSnapshotSemanticSignature(snapshot: AnalyticsSnapshot | null | undefined): string {
  if (!snapshot) return "null";
  return JSON.stringify({
    generatedAt: snapshot.generatedAt,
    period: snapshot.period,
    customRange: snapshot.customRange,
    revenue: snapshot.revenue?.currentValue,
    expenses: snapshot.expenses?.currentValue,
    profit: snapshot.profit?.currentValue,
    payrollCost: snapshot.payrollCost?.currentValue,
    attendanceRate: snapshot.attendanceRate?.currentValue,
    activeStaff: snapshot.activeStaff?.currentValue,
    businessHealthScore: snapshot.businessHealthScore,
    cashOnHand: snapshot.cashOnHand?.currentValue,
    burnRate: snapshot.burnRate?.currentValue,
    operationalExpenses: snapshot.operationalExpenses?.currentValue,
    commissionsPaid: snapshot.commissionsPaid?.currentValue,
    advanceExposure: snapshot.advanceExposure?.currentValue,
    absenceRate: snapshot.absenceRate?.currentValue,
    latenessRate: snapshot.latenessRate?.currentValue,
    departmentCount: snapshot.departmentPerformance?.length ?? 0,
    branchCount: snapshot.branchPerformance?.length ?? 0,
    scorecardsCount: snapshot.employeeScorecards?.length ?? 0,
  });
}

/**
 * Custom hook for executive components that logs render counts,
 * detects semantic vs identical consecutive renders, and provides diagnostic instrumentation.
 */
export function useLoggedSnapshot<T extends AnalyticsSnapshot | null | undefined>(
  label: string,
  snapshot: T
): { stabilizedSnapshot: T; diagnostics: SnapshotDiagnostics } {
  const renderCountRef = useRef<number>(0);
  const semanticChangeCountRef = useRef<number>(0);
  const identicalRenderCountRef = useRef<number>(0);
  const lastSignatureRef = useRef<string>("");
  const stabilizedRef = useRef<T>(snapshot);

  renderCountRef.current += 1;

  const currentSignature = getSnapshotSemanticSignature(snapshot);
  const isFirstRender = renderCountRef.current === 1;
  const isSemanticChange = isFirstRender || currentSignature !== lastSignatureRef.current;

  if (isSemanticChange) {
    semanticChangeCountRef.current += 1;
    lastSignatureRef.current = currentSignature;
    stabilizedRef.current = snapshot;
  } else {
    identicalRenderCountRef.current += 1;
  }

  useEffect(() => {
    if (isSemanticChange) {
      console.debug(
        `[${label}] [RENDER #${renderCountRef.current}] Semantic change (Semantic #${semanticChangeCountRef.current}).`,
        {
          isFirstRender,
          revenue: snapshot?.revenue?.currentValue,
          expenses: snapshot?.expenses?.currentValue,
          profit: snapshot?.profit?.currentValue,
        }
      );
    } else {
      console.debug(
        `[${label}] [RENDER #${renderCountRef.current}] Consecutive identical render absorbed (Identical #${identicalRenderCountRef.current}).`
      );
    }
  });

  return {
    stabilizedSnapshot: stabilizedRef.current,
    diagnostics: {
      renderCount: renderCountRef.current,
      semanticChangeCount: semanticChangeCountRef.current,
      identicalRenderCount: identicalRenderCountRef.current,
      isSemanticChange,
    },
  };
}
