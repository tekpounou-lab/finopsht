# FINOPS ERP — RAPPORT DE REMÉDIATION PHASE P1-3
**DOMAINE : APPROVALEXECUTIONWORKER & FIREBASE ADMIN SDK**  
**STATUT : FIXED AND VERIFIED**  
**DATE : 19 OCTOBRE 2026**  

---

## 1. COMPRÉHENSION ET CAUSE RACINE

### Défaillance Majeure
Lors de l'exécution en arrière-plan d'un workflow d'approbation de paie finalisé par `ApprovalExecutionWorker`, le worker utilisait le client Web SDK Firestore (`db` provenant de `lib/firebase.ts`) via la cascade de délégations :

$$\text{ApprovalExecutionWorker} \longrightarrow \text{PayrollService.sealPayrollCycle} \longrightarrow \text{PayrollRepository.sealCycleAtomic}$$

### Facteurs Aggravants Identifiés
1. **Contexte d'Exécution Serveur vs Client SDK** :
   Le worker d'arrière-plan s'exécute côté serveur Node.js sans jeton d'authentification utilisateur client. En déléguant l'écriture atomique à `PayrollRepository.sealCycleAtomic` qui utilisait `db` (SDK Client Web), les opérations d'écriture étaient rejetées par les règles de sécurité Firestore (`firestore.rules`) ou échouaient en fallback.

2. **Absence d'injection du contexte Firebase Admin SDK** :
   Bien que `ApprovalExecutionWorker` possède une instance Firebase Admin Firestore (`this.firestore`), cette instance n'était pas transmise à `PayrollService.sealPayrollCycle` ni à `PayrollRepository.sealCycleAtomic`.

3. **Incohérence du contrôle Segregation of Duties (SOD)** :
   `PayrollRepository.sealCycleAtomic` vérifiait `hasPermission(actorRole, "canValidatePayroll")`. Lorsque le worker s'exécutait en tant que rôle système (`role: "SYSTEM"`), ce rôle n'était pas exempté dans le contrôle de séparation des tâches, provoquant une levée d'exception systématique `[SegregationOfDutiesViolation]`.

4. **Robustesse de la requête d'enregistrement des bulletins de paie** :
   Lors de la recherche des enregistrements de paie (`payroll_records`), la recherche se faisait uniquement sur la clé `payroll_cycle_id`. Les sauvegardes historiques utilisant `cycleId` pouvaient entraîner un retour vide.

---

## 2. MODIFICATIONS APPORTÉES (MINIMALES & CIBLÉES)

### A. `src/modules/workflow/approval/ApprovalExecutionWorker.ts`
- **Recherche résiliente des enregistrements** : Ajout d'une recherche avec repli séquentiel (`payroll_cycle_id`, `cycleId`, puis `payroll_cycle_id` global) pour garantir la récupération intégrale des bulletins.
- **Transposition de l'Admin SDK** : Transmission de `firestoreAdmin: this.firestore` dans les options d'appel à `PayrollService.sealPayrollCycle`.
- **Tolérance Oracle Financier** : Consolidation des requêtes du *8-Point Financial Oracle* pour tolérer l'absence explicite du paramètre `business_id` dans les écritures historiques tout en vérifiant l'équilibre comptable Débit/Crédit et l'existence des fiches de paie scellées.

### B. `src/services/payroll/PayrollService.ts`
- **Option `firestoreAdmin` dans `ProcessPayrollCycleOptions`** : Ajout du champ optionnel `firestoreAdmin`.
- **Délégation d'écriture Admin dans `sealPayrollCycle`** : Passage de `firestoreAdmin` à `PayrollRepository.sealCycleAtomic` et implémentation d'un bloc de repli direct via l'Admin SDK `batch` lorsque `options.firestoreAdmin` est présent.

### C. `src/repositories/PayrollRepository.ts`
- **Exemption du rôle SYSTEM dans SOD** :
  ```typescript
  if (actorRole && actorRole !== "SYSTEM" && !hasPermission(actorRole, "canValidatePayroll")) {
    throw new Error("[SegregationOfDutiesViolation] ...");
  }
  ```
- **Persistance Atomique Admin SDK** : Prise en charge de `params.firestoreAdmin.batch()` dans `sealCycleAtomic` pour enregistrer de manière atomique :
  1. `payroll_cycles` avec `status: "SEALED"` et signature cryptographique SHA-256.
  2. `payslips` avec `status: "SEALED"`.
  3. `ledger_transactions` avec `status: "POSTED"` et les clés `payroll_cycle_id` / `payrollCycleId`.
  4. `forensic_logs` d'audit.
  5. `event_outbox` pour la file d'attente d'événements.

---

## 3. SUITE DE TESTS DÉDIÉE ET VALIDATION

Un fichier de test unitaire déterministe dédié a été créé :
`src/tests/unit/P13ApprovalExecutionWorkerRemediation.test.ts`

### Résultats des Tests
```text
✓ P1-3-01: Claim execution acquires mutex lock on EXECUTION_PENDING instance
✓ P1-3-02: Payload fingerprint mismatch halts execution with error
✓ P1-3-03: Successful execution seals cycle and updates instance to EXECUTED via Admin SDK
✓ P1-3-04: Re-execution returns ALREADY_EXECUTED idempotently
✓ P1-3-05: Recovery Oracle identifies SEALED cycle with posted ledger entries on crash recovery

Test Files: 1 passed (1)
Tests:      5 passed (5)
Duration:   3.05s
```

### Validation Globale de Non-Régression
```text
✓ P11CashClosureRemediation.test.ts (7 passed)
✓ P12MockDataRemediation.test.ts (Not affected)
✓ P13ApprovalExecutionWorkerRemediation.test.ts (5 passed)
✓ Phase21FirestoreRulesHardening.test.ts (3 passed)
✓ Phase20SecurityRbacTenantIsolation.test.ts (17 passed)
✓ WorkflowIntegrity.test.ts (4 passed)

Total: 36/36 tests réussis
```

---

## 4. CONTRÔLE DES RESTRICIONS ET STOP GATE

1. **Calculs & Moteurs Métier** : Aucun taux, aucune formule fiscale, aucun calcul de paie n'a été modifié.
2. **Règles Firestore P0** : Les règles `firestore.rules` durcies en Phase P0 restent 100% intactes.
3. **Données de Production** : Aucune base ni donnée de production n'a été altérée ou déployée.
4. **STOP GATE P2** : Le STOP GATE reste strictement ACTIF.
