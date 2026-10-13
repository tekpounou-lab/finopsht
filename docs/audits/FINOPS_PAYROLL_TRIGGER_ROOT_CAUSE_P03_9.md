# FINOPS × FINAYITI — DIAGNOSTIC ET CORRECTION DU DÉCLENCHEMENT DU PAYROLL
## Rapport d'Audit et de Correction de la Cause Racine (Phase P03.9)

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 11 octobre 2026  
**Phase :** P03.9 — Diagnostic et Correction du Déclenchement du Payroll  
**Auteur :** AI Engineering Orchestrator / Software Architect  
**Verdict Officiel :** `FIX_APPLIED_RUNTIME_VERIFICATION_BLOCKED`  
**Statut Certification Runtime Emulator :** `BLOCKED` (Port 8088 refuse la connexion : absence du binaire Java local)

---

## 1. SYMPTÔME ET ANOMALIE REPRODUITE

Lors de l'utilisation réelle de l'application, lorsque l'utilisateur cliquait sur le bouton **« Enregistrer & Recalculer »** dans la boîte de dialogue `EditCycleModal.tsx` :
1. Les paramètres du cycle étaient enregistrés et recalculés localement en mémoire React (`usePayrollRuns`).
2. La notification Toast de succès s'affichait : *« Recalcul réussi : X bulletins enregistrés. »*
3. **Pourtant, lors du rechargement de la page ou d'une nouvelle session, les bulletins disparaissaient.**

---

## 2. DÉMONSTRATION DE LA CAUSE RACINE

Après inspection complète de la chaîne d'exécution :
`EditCycleModal.tsx` ──► `handleSubmit` ──► `onReCalculate` (`PayrollEngine.tsx`) ──► `commitPayrollCycle` (`usePayrollCalculation.ts`) ──► `PayrollRepository.ts` ──► `Firestore`

### Cause Racine Démontrée :
1. **Absence de persistance Firestore des bulletins lors du recalcul (`commitPayrollCycle`) :**
   - La fonction `commitPayrollCycle` dans `usePayrollCalculation.ts` mettait à jour l'état local via `onAddRecords(records)` et le document du cycle dans `/payroll_cycles`.
   - **Cependant, la méthode `commitPayrollCycle` n'appelait AUCUNE fonction de persistance Firestore pour enregistrer les bulletins dans la collection `/payroll_records`.**
   - Les bulletins calculés par `PayrollService.processPayrollCycle` n'existaient donc qu'en mémoire vive (React State). Dès qu'un rafraîchissement de page survenait, Firestore renvoyait 0 bulletin car les documents n'avaient jamais été écrits en base de données.

2. **Interception silencieuse par la validation HTML native (`EditCycleModal.tsx`) :**
   - Les attributs `required` sur les champs `<input type="date">` bloquaient silencieusement la soumission si un champ n'était pas complètement renseigné, sans afficher de message d'erreur Toast.

---

## 3. CORRECTIONS APPLIQUÉES (PHASE C)

1. **Création de la méthode de persistance `savePayrollRecords` (`PayrollRepository.ts`) :**
   - Ajout de la méthode `savePayrollRecords(businessId: string, records: PayrollRecord[])` qui enregistre de façon atomique ou par lot (*MessageQueue / Batch*) tous les bulletins calculés dans la collection Firestore `/payroll_records`.

2. **Intégration de la persistance dans `commitPayrollCycle` (`usePayrollCalculation.ts`) :**
   - La fonction `commitPayrollCycle` fait désormais appel à `await PayrollRepository.savePayrollRecords(current_business_id, records)` avant de mettre à jour le statut du cycle à `CALCULATED`.

3. **Ajout de l'Instrumentation Observable (Phase B) :**
   - Tags de traçabilité intégrés dans la console technique :
     - `[PAYROLL_RECALC_CLICKED]`
     - `[PAYROLL_VALIDATION_STARTED]`
     - `[PAYROLL_CYCLE_SAVE_STARTED]`
     - `[PAYROLL_CYCLE_SAVE_SUCCEEDED]`
     - `[PAYROLL_EMPLOYEES_LOAD_STARTED]`
     - `[PAYROLL_EMPLOYEES_LOAD_SUCCEEDED]`
     - `[PAYROLL_CALCULATION_STARTED]`
     - `[PAYROLL_CALCULATION_SUCCEEDED]`
     - `[PAYROLL_BULLETINS_SAVE_STARTED]`
     - `[PAYROLL_BULLETINS_SAVE_SUCCEEDED]`

4. **Validation Formulaire Explicite (`EditCycleModal.tsx`) :**
   - Ajout de l'attribut `noValidate` et interception explicite des champs manquants ou invalides avec notifications `toast.error`.

---

## 4. RÉSULTATS DES TESTS DE NON-RÉGRESSION (PHASE D)

Les suites de tests d'intégration automatisées ont été exécutées avec succès :

```text
> vitest run --run src/tests/integration/PayrollCycleSmoke.test.ts src/tests/integration/PayrollWorkflow.test.ts src/tests/integration/PayrollDeduplicationSSOT.test.ts src/tests/integration/FirestoreRulesIntegrity.test.ts

 RUN  v4.1.11 /app/applet
  ✓ src/tests/integration/PayrollDeduplicationSSOT.test.ts (6 tests) 68ms
  ✓ src/tests/integration/FirestoreRulesIntegrity.test.ts (9 tests) 27ms
  ✓ src/tests/integration/PayrollCycleSmoke.test.ts (1 test) 7ms
  ✓ src/tests/integration/PayrollWorkflow.test.ts (1 test) 7ms

 Test Files  4 passed (4)
      Tests  17 passed (17)
   Duration  3.18s
```

---

## 5. LIMITES D'ENVIRONNEMENT ET DE CERTIFICATION

L'exécution des tests de certification de sécurité runtime Firestore (`FirestoreRuntimeSecurityCertification.test.ts`) échoue avec l'erreur :
`ECONNREFUSED 127.0.0.1:8088`
Ce refus de connexion est dû à l'absence du binaire Java local requis pour exécuter le package `@firebase/rules-unit-testing`. Conformément au cahier des charges P03.9, le verdict retient la mention `FIX_APPLIED_RUNTIME_VERIFICATION_BLOCKED`.

---

## 6. VERDICT FINAL

```text
FIX_APPLIED_RUNTIME_VERIFICATION_BLOCKED
```
