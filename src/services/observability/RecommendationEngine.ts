import { SystemSnapshot } from "./MetricRegistry";
import { SystemAlert } from "./AlertEngine";

export interface AutomatedRecommendation {
  id: string;
  category: "runtime" | "firestore" | "ai" | "workflow" | "financial" | "security" | "devops";
  title: string;
  impact: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  effort: "LOW" | "MEDIUM" | "HIGH";
  issueSummary: string;
  actionableSteps: string[];
  codeHint?: string;
  targetModule?: string;
  timestamp: string;
}

class RecommendationEngineClass {
  private recommendations: AutomatedRecommendation[] = [];

  /**
   * Generates actionable enterprise recommendations based on actual snapshot metrics and alerts.
   */
  public generate(snapshot: SystemSnapshot, alerts: SystemAlert[]): AutomatedRecommendation[] {
    const recs: AutomatedRecommendation[] = [];
    const now = new Date().toISOString();

    // 1. Firestore Listener Optimization Recommendation
    if (snapshot.firestore.activeListeners > 15) {
      recs.push({
        id: "rec_fs_listeners_" + Date.now(),
        category: "firestore",
        title: "Consolidate Firestore Listeners into Shared Streams",
        impact: "HIGH",
        effort: "LOW",
        issueSummary: `Active Firestore listeners reached ${snapshot.firestore.activeListeners}. Multiple component tabs are opening separate subscriptions to the same collections.`,
        actionableSteps: [
          "Import `realtimeManager` or `SubscriptionRegistry` in component hooks.",
          "Use ref-counted listener pooling to share snapshot streams across child components.",
          "Add unmount cleanup functions in useEffect dependencies."
        ],
        codeHint: "import { realtimeManager } from '../services/firestore/realtimeManager';",
        targetModule: "src/repositories/",
        timestamp: now
      });
    }

    // 2. AI Prompt Caching Recommendation
    if (snapshot.ai.quotaUsedPct >= 75 || snapshot.ai.cacheHitRatioPct < 60) {
      recs.push({
        id: "rec_ai_cache_" + Date.now(),
        category: "ai",
        title: "Activate AI CFO Forecast Prompt Caching",
        impact: snapshot.ai.quotaUsedPct >= 90 ? "CRITICAL" : "HIGH",
        effort: "LOW",
        issueSummary: `AI Service quota usage is at ${snapshot.ai.quotaUsedPct}% with a prompt cache hit ratio of ${snapshot.ai.cacheHitRatioPct}%. Repeated requests generate unnecessary API calls.`,
        actionableSteps: [
          "Store generated financial forecast snapshots in Firestore with a 24-hour TTL.",
          "Serve cached AI CFO predictions for identical business financial snapshots.",
          "Fallback gracefully to `FinancialRatioEngine` heuristics when API quotas are constrained."
        ],
        codeHint: "const cached = await AiCfoPredictiveService.getCachedForecast(businessId);",
        targetModule: "src/services/cfo/",
        timestamp: now
      });
    }

    // 3. Unbalanced Journal Safety Lock Recommendation
    if (!snapshot.financial.generalLedgerBalanced || !snapshot.financial.journalBalanced) {
      recs.push({
        id: "rec_fin_lock_" + Date.now(),
        category: "financial",
        title: "Enforce Pessimistic Lock on Unbalanced Journal Validation",
        impact: "CRITICAL",
        effort: "MEDIUM",
        issueSummary: "Accounting invariant failure detected: Debits do not equal Credits in pending ledger entries.",
        actionableSteps: [
          "Pessimistically block `payroll.approve` and `journal.post` capabilities until balanced.",
          "Run `applyDoubleEntryRules()` to automatically balance debit/credit entries.",
          "Audit orphan transactions without cost center assignments."
        ],
        codeHint: "applyDoubleEntryRules(transaction, { enforceZeroSum: true });",
        targetModule: "src/services/AccountingEngine.ts",
        timestamp: now
      });
    }

    // 4. React Render Optimization Recommendation
    if (snapshot.runtime.avgRenderTimeMs > 25 || snapshot.runtime.slowComponentCount > 0) {
      recs.push({
        id: "rec_react_memo_" + Date.now(),
        category: "runtime",
        title: "Apply React.memo and useCallback to High-Frequency UI Components",
        impact: "MEDIUM",
        effort: "LOW",
        issueSummary: `Average render time is ${snapshot.runtime.avgRenderTimeMs} ms with ${snapshot.runtime.slowComponentCount} slow render cycle(s) detected.`,
        actionableSteps: [
          "Wrap row item renderers and card components in `React.memo()`.",
          "Memoize callback handlers passed into table lists with `useCallback()`.",
          "Ensure large datasets use `VirtualizedTable` for viewport windowing."
        ],
        codeHint: "export const RowItem = React.memo(function RowItem(props) { ... });",
        targetModule: "src/components/ui/VirtualizedTable.tsx",
        timestamp: now
      });
    }

    // 5. Workflow Circuit Breaker Reset Recommendation
    if (snapshot.workflow.circuitBreakerState === "OPEN" || snapshot.workflow.failedJobsCount > 0) {
      recs.push({
        id: "rec_wf_cb_" + Date.now(),
        category: "workflow",
        title: "Flush DLQ Queue and Reset Workflow Circuit Breaker",
        impact: "HIGH",
        effort: "LOW",
        issueSummary: `Workflow circuit breaker is in state [${snapshot.workflow.circuitBreakerState}] with ${snapshot.workflow.failedJobsCount} deferred job(s).`,
        actionableSteps: [
          "Inspect failed jobs in System Health Console DLQ tab.",
          "Trigger `syncAttendanceQueue()` or manual queue retry pass.",
          "Reset circuit breaker state to CLOSED once upstream database connection stabilizes."
        ],
        codeHint: "finopsEventOrchestrator.resetCircuitBreaker();",
        targetModule: "src/services/finopsEventOrchestrator.ts",
        timestamp: now
      });
    }

    // 6. Security Scoping Recommendation
    if (snapshot.security.rbacViolationsCount > 0 || snapshot.security.crossTenantAttemptsCount > 0) {
      recs.push({
        id: "rec_sec_tenant_" + Date.now(),
        category: "security",
        title: "Verify Tenant Scoping Guardrails on All Repository Queries",
        impact: "CRITICAL",
        effort: "LOW",
        issueSummary: `Recorded ${snapshot.security.rbacViolationsCount} RBAC violation(s) or cross-tenant query attempt(s).`,
        actionableSteps: [
          "Ensure every Firestore `query()` includes `where('business_id', '==', current_business_id)`.",
          "Enforce `PermissionService.can(action)` before executing mutating business actions.",
          "Verify Firestore security rules enforce `verifyTenant(business_id)` on read/write."
        ],
        codeHint: "where('business_id', '==', current_business_id)",
        targetModule: "src/repositories/",
        timestamp: now
      });
    }

    // 7. Developer Code Modularity Recommendation
    if (snapshot.devops.filesOver400LocCount > 0) {
      recs.push({
        id: "rec_dev_split_" + Date.now(),
        category: "devops",
        title: "Refactor Large Component Files Exceeding 400 Lines Limit",
        impact: "LOW",
        effort: "MEDIUM",
        issueSummary: `${snapshot.devops.filesOver400LocCount} file(s) exceed 400 LOC. Large files increase bundle sizes and make maintenance harder.`,
        actionableSteps: [
          "Extract domain UI subcomponents into separate files inside `src/components/`.",
          "Move business logic and calculation helpers out into pure service files in `src/services/`.",
          "Use lazy imports for route-level page split chunks."
        ],
        codeHint: "const SubComponent = lazy(() => import('./SubComponent'));",
        targetModule: "src/components/",
        timestamp: now
      });
    }

    this.recommendations = recs;
    return [...this.recommendations];
  }

  /**
   * Returns current generated recommendations.
   */
  public getRecommendations(): AutomatedRecommendation[] {
    return [...this.recommendations];
  }
}

export const RecommendationEngine = new RecommendationEngineClass();
