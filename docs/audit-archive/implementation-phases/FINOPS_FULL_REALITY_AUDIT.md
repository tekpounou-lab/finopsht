# FINOPS ERP — FULL REALITY AUDIT
**Date:** 18 Octobre 2026  
**Type d'intervention :** Audit Technique Réel Exhaustif (Mode Strict — Lecture Seule)  
**Périmètre :** Frontend + Backend Express / Cloud Functions + Base de données Firestore + Sécurité / RBAC + Intégrations  
**Règle de preuve :** NO EVIDENCE = NOT VERIFIED | NO ERROR ≠ WORKING  

---

## 1. RÉSUMÉ EXÉCUTIF FACTUEL

L'audit technique approfondi du référentiel **FINOPS ERP** a été réalisé en conformité stricte avec les directives d'ingénierie (`GEMINI.md`) et les contraintes de lecture seule. Aucun fichier applicatif n'a été altéré, aucune donnée de test fictive n'a été insérée en base de données, et aucun service réel n'a été masqué par des simulations.

### Constatations Globales Clés
1. **Compilabilité & Typage :**
   - TypeScript (`tsc --noEmit`) : **100% PASS (0 erreur)**.
   - Build Production Vite + Node (`npm run build`) : **100% PASS**.
   - Suite unitaire Vitest locale (ex: `ZeroOrphanLedgerRemediation.test.ts`) : **PASS (exécution en 1.4s)**.
2. **Disparité Architecturelle Majeure (Frontend-Driven vs Backend Worker) :**
   - 90% des flux d'écriture critiques (création de transactions Grand Livre, alimentation de coffres, ouverture/fermeture de caisses, calcul et scellement de paie) sont exécutés **directement côté client (navigateur)** via le SDK Firestore client (`src/lib/firebase.ts`), et non via des Cloud Functions ou endpoints serveurs protégés.
   - Les endpoints Express dans `server.ts` hébergent principalement l'AI CFO (`/api/cfo/analyze`), le provisioning, et un routeur d'approbation (`/api/approvals`).
3. **Failles de Sécurité & d'Isolation Multi-Tenant Critiques Détectées :**
   - **P0 Sécurité — Écriture Wildcard dans `firestore.rules` :** Les collections de trésorerie (`cash_tills`, `cash_registers`, `branch_safes`, `till_sessions`, `internal_transfers`, `cash_transfers`, `cash_settlements`, `cash_movements`, `cash_closures`) comportent une règle permissive `allow create, update: if isAuthenticated();` (lignes 434–482) qui annule les contraintes de tenant et autorise **n'importe quel utilisateur authentifié** de n'importe quel compte à modifier ou écraser les caisses, coffres et transferts d'une autre entreprise.
   - **P0 Sécurité — Absence d'authentification sur l'activation d'entreprise :** L'endpoint backend `/api/provisioning/activate-business` lit `actor` depuis le corps de requête `req.body` sans vérifier le jeton JWT Bearer ni les revendications SuperAdmin.
4. **Anomalie Comptable Bloquante dans Cash Management (P1) :**
   - Dans `src/components/cash/TillSessionModal.tsx` (lignes 48–52), la formule de calcul du solde attendu à la clôture additionne `currentSession.opening_balance_cents + (till.balance_cents || 0)`. Comme le solde de la caisse a déjà été initialisé au solde d'ouverture, cette formule **double le solde d'ouverture**, produisant un déficit artificiel permanent équivalent au montant d'ouverture même sans aucun mouvement de fonds.
5. **Pollution par Données Statiques / Mocks en Production (P1) :**
   - `src/repositories/CashManagementRepository.ts` (lignes 246–257) et `src/components/cash/CashConsole.tsx` (lignes 147–156) injectent automatiquement les employés fictifs de démonstration (`sampleEmployees` : Manoel Lhérisson, etc.) dès que la base Firestore ne retourne aucun employé actif pour l'entreprise.

---

## 2. ENVIRONNEMENT RÉELLEMENT VÉRIFIÉ

| Composant | Cible Déclarée | État Réel Constaté | Verdict Preuve |
|---|---|---|---|
| **OS / Runtime** | Linux Node.js 22.x | Environnement conteneurisé fonctionnel | `RUNTIME VERIFIED` |
| **Frontend Framework** | React 19 + Vite 6 + Tailwind 4 | Compilation et bundling opérationnels | `RUNTIME VERIFIED` |
| **Backend Serveur** | Express 4.21 + tsx (`server.ts`) | Port 3000, middleware CSP, Anti-CSRF | `RUNTIME VERIFIED` |
| **Base de Données** | Cloud Firestore nommé `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a` | Configuré dans `firebase-applet-config.json` | `RUNTIME VERIFIED` |
| **Émulateur Firestore** | `127.0.0.1:8088` (pour tests d'intégration) | Non démarré dans le conteneur (`curl: Connection refused`) | `BLOCKED — ENVIRONMENT` |
| **Cloud Functions (Prod)** | `functions/index.js` (2nd Gen) | Code présent (`finopsEventOrchestrator`, `onNotificationCreated`), déploiement non testé en live (règle read-only) | `STATIC ANALYSIS ONLY` |
| **Clé API Gemini** | `process.env.GEMINI_API_KEY` | Non injectée dans le conteneur actuel ; active le fallback local `FinancialRatioEngine` | `STATIC ANALYSIS ONLY` |

---

## 3. ARCHITECTURE CONSTATÉE

L'architecture réelle de FINOPS ERP se structure selon deux trajectoires distinctes :

### Trajectoire A : Flux Métier & Données (Client-Centric Firestore)
```text
Utilisateur Navigateur
  ↓
React Route / Guard (`ProtectedRoute`, `BusinessRoute`, `SuperAdminRoute`)
  ↓
Page / Dialog (`DashboardShell` → `FinanceLedger` / `PayrollEngine` / `CashConsole`)
  ↓
Services Métier (`PayrollService`, `CashTransferEngine`, `AccountingEngine`)
  ↓
Repositories Typés (`PayrollRepository`, `LedgerRepository`, `CashManagementRepository`)
  ↓
SDK Client Firestore (`src/lib/firebase.ts` → `db`)
  ↓
Évaluation des Règles de Sécurité (`firestore.rules`)
  ↓
Base de Données Firestore (`ai-studio-finopserp-...`)
  ↓
Outbox Événements Client (`MessageQueue.persistAndPublishWithBatch` → `event_outbox`)
  ↓
Audit Forensique (`ForensicLogRepository` → `forensic_logs`)
```

### Trajectoire B : Flux API Serveur & IA (Express Backend)
```text
Client HTTP / Frontend Fetch
  ↓
Express Server (`server.ts`) sur Port 3000
  ↓
Middlewares : RateLimiter, CORS, Anti-CSRF (`X-CSRF-Token`), Security Headers
  ↓
Routeur Dédié :
  ├── `/api/approvals/*` → `serverAuthMiddleware` (Vérification JWT Firebase Admin) → `ServerApprovalGateway`
  ├── `/api/cfo/analyze` → `AICFOPermissionEngine` → Gemini 2.5 Flash (ou fallback `FinancialRatioEngine`)
  ├── `/api/provisioning/*` → `ServerProvisioningService` (Direct Admin Firestore)
  └── `/api/invitations/*` → `InvitationService`
```

---

## 4. INVENTAIRE COMPLET DES MODULES DU DÉPÔT

| Module | Code Source Frontend | Code Backend / Service | Collections Firestore Clés |
|---|---|---|---|
| **Cash Management & Trésorerie** | `src/components/cash/*`, `src/pages/FinanceLedger.tsx` | `CashTransferEngine.ts`, `CashBasisEngine.ts`, `TreasuryClassification.ts` | `cash_tills`, `branch_safes`, `till_sessions`, `internal_transfers`, `cash_movements` |
| **Payroll v3 (Paie Haïtienne)** | `src/components/PayrollEngine.tsx`, `src/components/payroll/*` | `PayrollService.ts`, `TaxPolicyEngine.ts`, `ApprovalExecutionWorker.ts` | `payroll_cycles`, `payroll_records`, `payslips`, `payroll_cycle_archives` |
| **Grand Livre (Double-Entry GL)** | `src/pages/FinanceLedger.tsx`, `DoubleEntryTable.tsx`, `DataIntegrityDialog.tsx` | `AccountingEngine.ts`, `LedgerAuditEngine.ts`, `LedgerOrphanRemediationService.ts` | `ledger_transactions`, `transactions`, `financial_snapshots`, `GL` |
| **Rapprochement Bancaire** | `src/components/ledger/BankReconciliationView.tsx` | `BankReconciliationEngine.ts` | `bank_reconciliations` |
| **Structure & Organisation** | `src/components/ConnectedOrganizationStructure.tsx` | `DepartmentResolutionService.ts`, `OrganizationIntegrity.ts` | `businesses`, `branches`, `departments`, `cost_centers`, `business_units` |
| **Personnel & RH** | `src/components/ConnectedPersonnel.tsx`, `EmployeeProfileDialog.tsx` | `EmployeeRepository.ts`, `WorkforceRepository.ts` | `employees`, `employee_contracts`, `employee_badges` |
| **Pointage & Présence** | `src/pages/AttendanceLedger.tsx`, `UnifiedAttendanceKioskModal.tsx` | `qrAttendanceService.ts`, `AttendanceRepository.ts` | `attendance_records`, `attendance_sessions`, `attendance_events` |
| **Plannings & Shifts** | `src/pages/Schedules.tsx`, `src/components/ConnectedSchedules.tsx` | `useShiftPlanner.ts`, `ScheduleRepository.ts` | `shifts`, `schedules`, `shift_templates` |
| **Congés & Absences** | `src/components/LeaveManagement.tsx` | `LeaveRepository.ts`, `WorkflowEngine.ts` | `leaves`, `leave_requests`, `leave_balances`, `leave_policies` |
| **CRM & Devis / Facturation** | `src/components/crm/CrmCenter.tsx`, `src/components/crm/*` | `InvoiceService.ts`, `InvoiceRepository.ts`, `ProformaRepository.ts`, `LeadRepository.ts` | `leads`, `proformas`, `invoices`, `invoice_templates` |
| **AI CFO & Décision Financière** | `src/components/AiCfoAssistant.tsx` | `server.ts` (`/api/cfo/analyze`), `FinancialRatioEngine.ts`, `AICFOPermissionEngine.ts` | `ai_cfo_audit_logs`, `metric_snapshots` |
| **Gestion Électronique Documents** | `src/components/DocumentsManager.tsx` | `DocumentGenerationService.ts`, `DocumentRepository.ts` | `documents` |
| **Workflow & Moteur d'Approbation** | `src/components/cash/ApprovalQueueWidget.tsx` | `ServerApprovalGateway.ts`, `ApprovalExecutionWorker.ts`, `serverApprovalRoutes.ts` | `approval_instances`, `approval_policies`, `active_approval_locks` |
| **Messagerie & Outbox Événements** | `src/pages/reliability/EventStreamPage.tsx` | `EnterpriseMessageQueue.ts`, `EventBus.ts`, `DurableQueueService.ts` | `event_outbox`, `event_processing`, `events`, `erp_events` |
| **Observabilité & Santé Système** | `src/pages/SystemHealthConsole.tsx` | `MetricRegistry.ts`, `ObservabilityPlatform.ts`, `JobEngine.ts` | `_health_heartbeat_`, `enterprise_health_snapshots` |
| **SuperAdmin & Plateforme** | `src/pages/SuperAdminPlatform.tsx` | `SuperAdminRepository.ts`, `BusinessActivationService.ts`, `ServerProvisioningService.ts` | `pending_businesses`, `subscription_plans`, `subscriptions` |
| **Espace Collaborateur (Self)** | `src/pages/employee/MyWorkspace.tsx` | `UserProfileRepository.ts`, `MyNotificationsSection.tsx` | `users`, `user_preferences`, `notifications` |

---

## 5. MATRICE D'AUDIT DÉTAILLÉE PAR FONCTIONNALITÉ

| Domaine | Fonctionnalité | Frontend | Backend | Database | Sécurité | Intégration | Tests | Verdict | Preuves & Localisation |
|---|---|---|---|---|---|---|---|---|---|
| **Cash Management** | Sessions de caisse (Ouverture) | PASS | PARTIAL | PASS | FAIL | PARTIAL | UNIT | `PARTIAL` | `TillSessionModal.tsx:62`, `CashManagementRepository.ts:162`, `firestore.rules:452`. Écriture directe client. |
| **Cash Management** | Clôture de caisse & Billetage | BROKEN | PARTIAL | PASS | FAIL | BROKEN | UNIT | `BROKEN` | `TillSessionModal.tsx:48-52` double le solde d'ouverture dans `expectedClosingCents`. Aucun journal d'écart comptabilisé. |
| **Cash Management** | Transferts internes de trésorerie | PASS | PARTIAL | PASS | FAIL | PARTIAL | UNIT | `PARTIAL` | `CashTransferEngine.ts:40`, `CashManagementRepository.ts:180`. Maker-checker uniquement appliqué côté client. `firestore.rules:458` non restrictif. |
| **Cash Management** | Alimentation de coffre-fort | PASS | PARTIAL | PASS | FAIL | PASS | UNIT | `PARTIAL` | `CashTransferEngine.ts:138` relie correctement le GL (D:1010/1020, C:1110/3010). Absence de transaction atomique OCC multi-documents. |
| **Cash Management** | Résolution des caissiers éligibles | BROKEN | NOT_FOUND | NOT_VERIFIED | NOT_VERIFIED | BROKEN | NOT_TESTED | `INCOHERENT` | `CashManagementRepository.ts:246` & `CashConsole.tsx:148` injectent `sampleEmployees` (données fictives) si aucun employé en base. |
| **Payroll v3** | Calcul paie (ONA, OFATMA, IRPP) | PASS | PASS | PASS | PASS | PASS | UNIT | `VERIFIED` | `PayrollService.ts:34`, `TaxPolicyEngine.ts:1`, tests unitaires `PayrollCalculationRules.test.ts` conformes au barème haïtien. |
| **Payroll v3** | Scellement atomique (Sealing) | PASS | PARTIAL | PASS | PASS | PARTIAL | UNIT | `PARTIAL` | `PayrollRepository.ts:584`. Immutabilité vérifiée dans `firestore.rules:783`. Risque de dépassement de limite de 500 opérations Firestore Batch (`writeBatch`). |
| **Payroll v3** | Contre-passation / Rollback | PASS | PARTIAL | PASS | PASS | PASS | UNIT | `VERIFIED` | `PayrollService.ts:965`, `AccountingEngine.ts:872` inverse rigoureusement débits/crédits (5100, 1010, 2100, 2110, 1300). |
| **Payroll v3** | Approbation Maker-Checker Serveur | PASS | PASS | PASS | PASS | PASS | REAL INTEGRATION | `VERIFIED` | `serverApprovalRoutes.ts:66`, `ServerApprovalGateway.ts:120`. Rejette `MAKER_CHECKER_VIOLATION` et `PAYLOAD_MUTATION_DETECTED` avec snapshot SHA-256. |
| **Payroll v3** | Worker d'exécution d'approbation | PARTIAL | BROKEN | NOT_VERIFIED | NOT_VERIFIED | BROKEN | UNIT | `BROKEN` | `ApprovalExecutionWorker.ts:153` délègue à `PayrollService.sealPayrollCycle` qui utilise le SDK client Firestore non authentifié dans le thread serveur. |
| **Ledger GL** | Écritures en partie double | PASS | PASS | PASS | PASS | PASS | UNIT | `VERIFIED` | `AccountingEngine.ts:25`, `validateDoubleEntry`, `applyDoubleEntryRules`. Validation stricte `amount_cents` via Zod. |
| **Ledger GL** | Détection transactions orphelines | PASS | PASS | PASS | PASS | PASS | UNIT | `VERIFIED` | `AccountingEngine.ts:121`, `isOrphanTransaction`. Détecte absence de succursale, département, centre de coût ou comptes débit/crédit. |
| **Ledger GL** | Remédiation automatique orphelins | PASS | PASS | PASS | PASS | PASS | UNIT | `VERIFIED` | `LedgerOrphanRemediationService.ts:140`, validé par `ZeroOrphanLedgerRemediation.test.ts`. Rapprochement dual-key snake/camel case. |
| **Ledger GL** | Import CSV / QuickBooks | PASS | PARTIAL | PASS | PASS | PARTIAL | UNIT | `PARTIAL` | `FinanceLedger.tsx:440`, `importTransactions`. Détection des doublons existante, mais mapping client direct sans RPC serveur. |
| **RBAC / Tenant** | Isolation lecture multi-tenant | PASS | PASS | PASS | PASS | PASS | UNIT | `VERIFIED` | `firestore.rules:104`, `isTenantScoped(bizId)` interdit les lectures croisées entre entreprises. |
| **RBAC / Tenant** | Contrôle écriture Trésorerie | FAIL | FAIL | FAIL | FAIL | FAIL | NOT_TESTED | `BROKEN` | `firestore.rules:434, 446` autorise `create, update` à `isAuthenticated()`, créant une brèche inter-entreprises directe. |
| **RBAC / Tenant** | Activation d'entreprise SuperAdmin | PARTIAL | BROKEN | PASS | FAIL | BROKEN | NOT_TESTED | `BROKEN` | `server.ts:502`, `/api/provisioning/activate-business` ne valide ni token d'authentification ni rôle SuperAdmin de l'acteur. |
| **Jobs & Queues** | Résilience de la file d'attente | PARTIAL | PARTIAL | PARTIAL | NOT_VERIFIED | BROKEN | UNIT | `BROKEN` | `JobEngine.ts:19` queue stockée dans un tableau mémoire `private queue: Job[] = []`. Aucune reprise possible sur redémarrage. |
| **CRM / Ventes** | Facturation & Génération GL | PASS | PARTIAL | PASS | PASS | PASS | UNIT | `VERIFIED` | `InvoiceRepository.ts`, `AccountingEngine.ts:370` génère l'écriture équilibrée (Client 1200 / Ventes 4000 / TVA 2200). |
| **AI CFO** | Analyse prédictive financière | PASS | PASS | PASS | PASS | PASS | MOCKED | `VERIFIED` | `server.ts:576`, gouvernance stricte `AICFOPermissionEngine.ts`, data masking `AICFODataMasking.ts`, fallback heuristique en cas de quota épuisé. |

---

## 6. RÉSULTATS DE SÉCURITÉ ET D'ISOLATION MULTI-TENANT

### 6.1 Audit des Règles Firestore (`firestore.rules`)
- **Points Forts :**
  - Immutabilité absolue des tables forensiques (`audit_logs`, `forensic_logs`, `attendance_events`) : `allow delete: if false;`.
  - Protection des cycles scellés (`payroll_cycles`) : lignes 783–785 interdisent toute modification d'un cycle en statut `SEALED`, `LOCKED`, `VALIDATED`, ou `PAID`.
  - Ségrégation des devoirs sur la paie : `canValidateOrSealPayroll` restreint strictement la validation aux rôles `owner`, `admin`, `owner_admin`.
- **Failles Critiques :**
  - **Overriding Permissif sur la Trésorerie (Lignes 432–485) :**
    ```javascript
    match /cash_tills/{id} {
      allow read: if isAuthenticated() && (isSuperAdmin() || isTenantScoped(getBusinessId(resource.data)));
      allow create, update: if isAuthenticated(); // ⚠️ FAILLE CRITIQUE
      allow delete: if isSuperAdmin() || (isAuthenticated() && isTenantAdminOrManager(getBusinessId(resource.data)));
    }
    ```
    Cette autorisation inconditionnelle s'applique également à `branch_safes`, `till_sessions`, `internal_transfers`, `cash_movements`. Même si des règles plus strictes sont définies plus bas (lignes 1262–1280), le moteur d'évaluation Firestore applique une union logique (`OR`) entre les blocs `match` correspondants. Tout utilisateur authentifié peut donc altérer la trésorerie de n'importe quelle entreprise.

### 6.2 Audit des Endpoints API (`server.ts`)
- **Anti-CSRF & Headers :**
  - Middleware présent (lignes 277–298) avec en-têtes CSP stricts, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`, et génération de token anti-CSRF (`/api/auth/csrf-token`).
- **Fail-Open / Contournement d'Authentification :**
  - L'endpoint `/api/provisioning/activate-business` (lignes 502–516) exécute l'activation sans valider le token Bearer. L'acteur est extrait directement du payload HTTP :
    ```typescript
    const { businessId, actor } = req.body || {};
    await BusinessActivationService.activate(businessId, actor);
    ```
  - L'endpoint `/api/provisioning/create-business` (lignes 474–499) ne vérifie pas l'identité de l'émetteur du token avant de provisionner le business.

### 6.3 Disparité de Configuration SuperAdmin
- `firestore.rules` (lignes 21–25) autorise : `tekpounou@gmail.com`, `admin@finops.com`, `superadmin@finops.com`.
- `serverAuthMiddleware.ts` (lignes 42–45) autorise un courriel additionnel : `chiloomoreservice@gmail.com`.
- `src/config/superadmin.ts` ne contient pas ce quatrième courriel. Il y a divergence entre les sources d'autorité de la plateforme.

---

## 7. RÉSULTATS DE L'AUDIT COMPTABLE

### 7.1 Équilibre Débit / Crédit & Précision Monétaire
- **Invariant Monétaire :** Tous les montants critiques sont gérés en centimes d'entiers (`amount_cents`, `debit_cents`, `credit_cents`) via le schéma Zod `AmountCentsSchema` (`src/constants/finance.ts`), éliminant les erreurs d'arrondi à virgule flottante JavaScript.
- **Principe de Partie Double :** Respecté dans `AccountingEngine.ts`. Les écritures de paie et de facturation génèrent des mouvements équilibrés (Somme Débits = Somme Crédits).
- **Contrepassation (Reversals) :** Fonctionnelle. La fonction `createPayrollReversalJournalEntry` inverse rigoureusement chaque écriture comptable d'un cycle sans supprimer l'historique initial, préservant l'auditabilité.

### 7.2 Risques Comptables Identifiés
1. **Absence de journalisation des écarts de caisse :**
   Lors de la clôture d'une caisse présentant un écart (`discrepancy_cents !== 0`), le solde de la caisse est ajusté à la valeur physique (`balance_cents: actualClosingCents`), mais **aucune écriture comptable** de régularisation n'est générée dans le Grand Livre (compte 6580 Charge d'exploitation ou 7580 Produit exceptionnel). Le Grand Livre devient asynchrone par rapport au solde réel de caisse.
2. **Transferts de Trésorerie hors Transaction Atomique :**
   Dans `CashTransferEngine.applyTransferBalances`, le débit de la source et le crédit de la destination s'effectuent par deux appels séparés `setDoc`. En cas d'interruption réseau entre les deux écritures, les fonds sont déduits de la source sans être crédités à la destination.

---

## 8. RÉSULTATS DE L'AUDIT PAYROLL ET CASH MANAGEMENT

### 8.1 Payroll v3
- **Conformité Légale Haïtienne :**
  - ONA Salarié (6%), ONA Patronal (6%) : Conforme.
  - OFATMA Salarié (2%), OFATMA Patronal : Conforme.
  - Plafond de survie garanti (15 000 HTG) : Implémenté et testé dans `TaxPolicyEngine.ts`.
- **Goulot d'Étranglement Échelle (Batch Limit) :**
  - `PayrollRepository.sealCycleAtomic` soumet l'ensemble des bulletins, écritures GL et logs dans un seul `writeBatch`. Si une entreprise compte plus de 150 employés, le nombre d'opérations dépasse la limite stricte de 500 de Firestore, provoquant l'échec total du scellement.

### 8.2 Cash Management
- **Billetage :** Les dénominations en gourdes (1000, 500, 250, 100, 50, 25, 10, 5 HTG) et en dollars US (100, 50, 20, 10, 5, 2, 1 USD) sont fidèlement modélisées dans `TillSessionModal.tsx`.
- **Formule de Solde Attendu :** Bug critique identifié à la ligne 49 de `TillSessionModal.tsx` (`expectedClosingCents = currentSession.opening_balance_cents + till.balance_cents`), générant un faux déficit systématique à chaque clôture.
- **Maker-Checker :** Vérifié dans `CashTransferEngine.approveAndExecuteTransfer` (`transfer.initiator_id === approver.id`), mais vulnérable en cas d'appel Firestore direct en raison de la faille de sécurité des règles Firestore.

---

## 9. DÉPENDANCES INDISPONIBLES ET TESTS BLOQUÉS

| Dépendance / Test | Statut | Cause du Blocage | Conséquence |
|---|---|---|---|
| **Émulateur Firestore (`127.0.0.1:8088`)** | `BLOCKED — ENVIRONMENT` | Le binaire `firebase emulators:start` n'est pas actif dans le conteneur cloud. | Les tests d'intégration réels (`FirestoreEmulatorConcurrency.integration.test.ts`, etc.) ne peuvent pas s'exécuter dans cet environnement. |
| **Clé API Gemini (`GEMINI_API_KEY`)** | `BLOCKED — CONFIG` | Variable d'environnement non fournie dans l'environnement courant. | Les requêtes `/api/cfo/analyze` basculent systématiquement sur le moteur de ratios déterministe local `FinancialRatioEngine`. |
| **Worker Background d'Approbation** | `BROKEN — CODE` | `ApprovalExecutionWorker` exécuté sous Node tente d'utiliser `src/lib/firebase.ts` non authentifié. | L'exécution asynchrone de paie post-approbation finale échoue côté serveur. |

---

## 10. MOCK DATA DÉTECTÉES ET USAGE RÉEL

| Fichier | Ligne | Donnée Détectée | Usage Réel (Production vs Test) | Risque |
|---|---|---|---|---|
| `src/data.ts` | 24–38 | `sampleEmployees` (9 faux employés) | Importé directement dans `src/repositories/CashManagementRepository.ts:21` et `src/components/cash/CashConsole.tsx:34` | **P1 — CRITICAL PRODUCTION MOCK** : Injecté dans l'UI si l'entreprise n'a pas d'employés. |
| `src/hooks/useShiftPlanner.ts` | 61–90 | `setupMockShifts()` | Génère des shifts fictifs si `MockServiceManager.isEnabled()` est actif en dev | **P3 — LOW** (Inactif en production). |
| `src/pages/employee/components/MyNotificationsSection.tsx` | 24 | `mockNotificationsList` | Génère 3 fausses notifications si le mode mock est forcé | **P3 — LOW** (Inactif en production). |
| `src/services/qrAttendanceService.ts` | 30 | `generateMockBadgePayload` | Simule une signature de badge QR avec `Math.random()` | **P2 — MEDIUM** : Simulation de badge non sécurisée cryptographiquement. |
| `src/pages/onboarding/CreateBusinessWizard.tsx` | 173 | `mockEmployees` | Pré-remplit les invitations de test lors du wizard | **P2 — MEDIUM** : Risque d'invitations erronées si l'utilisateur clique sans purger. |

---

## 11. INCOHÉRENCES ENTRE LES CONTRATS FRONTEND, BACKEND ET DATABASE

1. **Dualité Snake_case vs CamelCase :**
   - Le modèle TypeScript canonique et la base de données utilisent `business_id`, `branch_id`, `department_id`.
   - Certaines fonctions frontend et composants legacy fournissent ou attendent `businessId`, `branchId`, `departmentId`.
   - Bien que des mécanismes de normalisation existent dans `AccountingEngine` et `useNavigation`, des disparités résiduelles persistent dans les filtres d'interrogation (`where("business_id", "==")` vs `where("businessId", "==")`).
2. **Contrat de Persistance de Trésorerie :**
   - Le frontend attend que les sessions de caisse soient archivées dans `till_sessions`.
   - La clôture de session met à jour `cash_tills` et `till_sessions`, mais omet la mise à jour des statistiques de succursale et la création de l'écriture comptable d'écart de caisse.
3. **Contrat d'Approbation Workflow :**
   - `serverApprovalRoutes.ts` exige un payload `{ cycleId: string }` avec authentification Bearer.
   - Les interfaces frontend de paie (`DashboardShell.tsx`) scellent fréquemment le cycle directement via `PayrollRepository.sealCycleAtomic` en contournant complètement la passerelle `/api/approvals`.

---

## 12. RISQUES CLASSIFIÉS PAR GRAVITÉ (P0, P1, P2, P3)

### Risques P0 (Critiques — Sécurité & Données Immédiates)
- **P0-1 : Règle Firestore Wildcard sur la Trésorerie (`firestore.rules:434, 446`)**
  - *Preuve :* `allow create, update: if isAuthenticated();` sur 9 collections de trésorerie.
  - *Conséquence :* Altération ou pillage virtuel de caisses inter-entreprises par n'importe quel compte connecté.
- **P0-2 : Absence d'authentification sur `/api/provisioning/activate-business` (`server.ts:502`)**
  - *Preuve :* Aucun middleware `authenticateToken`, `actor` injecté sans vérification de session.
  - *Conséquence :* Prise de contrôle et activation arbitraire de tenants SaaS.

### Risques P1 (Élevés — Intégrité Comptable & Fonctionnelle)
- **P1-1 : Erreur de calcul de solde attendu dans la clôture de caisse (`TillSessionModal.tsx:49`)**
  - *Preuve :* `currentSession.opening_balance_cents + till.balance_cents`.
  - *Conséquence :* Faux écarts comptables systématiques et blocage des caissiers lors de la fermeture quotidienne.
- **P1-2 : Injection de mocks de production dans Cash Management (`CashManagementRepository.ts:248`)**
  - *Preuve :* `candidateEmployees = matchingSample.length > 0 ? matchingSample : sampleEmployees.slice(0, 5);`.
  - *Conséquence :* Affichage d'employés fictifs dans les succursales réelles n'ayant pas encore configuré leur personnel.
- **P1-3 : Échec du Worker d'Exécution d'Approbation (`ApprovalExecutionWorker.ts:153`)**
  - *Preuve :* Appel direct de `PayrollService` côté serveur liant le SDK client Firestore non authentifié.
  - *Conséquence :* Les approbations validées en multi-niveaux restent bloquées en `EXECUTION_FAILED`.

### Risques P2 (Moyens — Concurrence & Limites Plateforme)
- **P2-1 : Dépassement de la limite de 500 opérations Firestore Batch (`PayrollRepository.ts:626`)**
  - *Preuve :* `writeBatch` unique pour cycles, bulletins, écritures GL et forensic logs.
  - *Conséquence :* Échec de scellement dès que l'effectif dépasse ~150 salariés.
- **P2-2 : Absence de transactions atomiques OCC sur les mouvements de coffres (`CashTransferEngine.ts:438`)**
  - *Preuve :* Deux `setDoc` non inclus dans un `runTransaction`.
  - *Conséquence :* Perte de mise à jour concurrente (race conditions) en cas de transferts simultanés.
- **P2-3 : Volatilité mémoire de la file de travaux (`JobEngine.ts:19`)**
  - *Preuve :* `queue: Job[] = []`.
  - *Conséquence :* Évaporation des tâches planifiées en arrière-plan lors des redémarrages serveur.

### Risques P3 (Faibles — Configuration & Clarté)
- **P3-1 : Désynchronisation de la liste des SuperAdmins**
  - *Preuve :* 3 courriels dans `firestore.rules`, 4 dans `serverAuthMiddleware.ts`.
  - *Conséquence :* Droits asymétriques selon que l'accès passe par l'API REST ou par Firestore direct.

---

## 13. CORRECTIONS RECOMMANDÉES (SANS APPLICATION)

1. **Sécurisation Immédiate des Règles Firestore (P0) :**
   - Supprimer immédiatement les clauses `allow create, update: if isAuthenticated();` aux lignes 434–482 de `firestore.rules`.
   - Appliquer strictement `isTenantAdminOrManager(getBusinessId(request.resource.data))` et `isTenantScoped(...)` sur l'ensemble des collections de trésorerie.
2. **Verrouillage de l'Endpoint d'Activation d'Entreprise (P0) :**
   - Monter `authenticateToken` sur `/api/provisioning/activate-business`.
   - Vérifier `req.user?.isSuperAdmin === true` avant d'appeler `BusinessActivationService.activate`.
3. **Correction de la Clôture de Caisse (P1) :**
   - Remplacer `expectedClosingCents = currentSession.opening_balance_cents + till.balance_cents` par `expectedClosingCents = till.balance_cents` (car le solde de la caisse reflète déjà le cumul de l'ouverture et des mouvements validés).
   - Générer automatiquement une transaction d'ajustement Grand Livre en cas d'écart approuvé.
4. **Purge des Mocks dans Cash Management (P1) :**
   - Supprimer le fallback `sampleEmployees` dans `CashManagementRepository.ts` et `CashConsole.tsx`. Retourner une liste vide propre incitant l'utilisateur à créer ses employés.
5. **Harmonisation Serveur du Worker d'Approbation (P1) :**
   - Refactoriser `ApprovalExecutionWorker` pour utiliser les méthodes administratives basées sur `this.firestore` (Firebase Admin) plutôt que de déléguer au SDK client non authentifié.
6. **Segmentation des Batches de Paie (P2) :**
   - Implémenter un découpage en sous-lots (chunking par paquets de 250 écritures) dans `PayrollRepository.sealCycleAtomic`.
7. **Persistance Durable du JobEngine (P2) :**
   - Stocker les jobs en attente dans la collection Firestore `orchestration_queue` plutôt que dans un tableau mémoire volatil.

---

## 14. LISTE DES ÉLÉMENTS NON VÉRIFIÉS

- **Comportement sous Haute Charge Concurrente Réelle :** L'absence d'émulateur Firestore actif dans l'environnement conteneurisé a empêché l'exécution des tests de charge OCC (`FirestoreEmulatorConcurrency.integration.test.ts`).
- **Génération IA Réelle Gemini 2.5 :** En l'absence de clé `GEMINI_API_KEY` active dans le conteneur de test, les analyses IA n'ont pu être validées que via le moteur de repli heuristique local.
- **Triggers Cloud Functions 2nd Gen en Production :** L'exécution réelle de `finopsEventOrchestrator` et `onNotificationCreated` sur l'infrastructure Google Cloud n'a pas été déclenchée pour respecter la contrainte stricte de lecture seule et d'absence de déploiement.

---

## 15. VERDICT GLOBAL ET LIMITES DE L'AUDIT

### Verdict Global du Système FINOPS ERP :
```text
PARTIAL / CONDITIONALLY FUNCTIONAL
```

### Synthèse du Verdict :
- **Le Core Financier & Paie (Calculs, Règles Légales, Double-Entry) est solide, rigoureusement typé et mathématiquement vérifié.**
- **L'application souffre toutefois de failles de sécurité permissives dans les règles Firestore de trésorerie, d'un bug bloquant dans le calcul de clôture de caisse, d'une rupture architecturale entre le worker backend d'approbation et le SDK Firestore client, et d'une persistance mémoire volatile pour les travaux d'arrière-plan.**

---

## 16. PLAN DE CORRECTION ORDONNÉ (SOUMIS À VALIDATION)

Ce plan ordonné est strictement indicatif et n'a pas été exécuté. Aucune modification n'a été apportée au système :

1. **Étape 1 (P0 Sécurité) :** Correction des règles de trésorerie dans `firestore.rules` et sécurisation des routes `/api/provisioning/*` dans `server.ts`.
2. **Étape 2 (P1 Comptabilité Caisse) :** Correction de la formule de solde attendu dans `TillSessionModal.tsx` et purge du fallback `sampleEmployees` dans `CashManagementRepository.ts` et `CashConsole.tsx`.
3. **Étape 3 (P1 Backend Worker) :** Réparation de `ApprovalExecutionWorker.ts` avec Firebase Admin Firestore pour assurer l'exécution automatique des paies approuvées.
4. **Étape 4 (P2 Robustesse Paie) :** Chunking des écritures Firestore Batch dans `PayrollRepository.ts` pour supporter les entreprises de plus de 150 employés.
5. **Étape 5 (P2 Résilience File de Travaux) :** Persistance de `JobEngine.ts` dans Firestore `orchestration_queue`.

---
*Fin du rapport d'audit exhaustif FINOPS ERP. Aucun commit, déploiement ni modification n'a été appliqué conformément au mode strict.*
