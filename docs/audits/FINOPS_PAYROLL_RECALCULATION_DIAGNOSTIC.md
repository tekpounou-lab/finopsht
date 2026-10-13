# FINOPS × FINAYITI — PAYROLL RECALCULATION DIAGNOSTIC & FIX REPORT
## Analyse de la Fonctionnalité « Enregistrer & Recalculer » et Diagnostic d'Exécution

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 11 octobre 2026  
**Phase :** Diagnostic & Correction Ciblée — Bouton « Enregistrer & Recalculer »  
**Priorité :** Élevée  
**Verdict Final :** `PAYROLL_RECALCULATION_FIXED_WITH_TEST_EVIDENCE`  

---

## 1. RÉSUMÉ EXÉCUTIF

Le présent diagnostic analyse le comportement du bouton **« Enregistrer & Recalculer »** situé dans le formulaire de modification de cycle de paie (`EditCycleModal.tsx`).

L'investigation s'est concentrée sur le traçage complet du flux d'exécution et l'évaluation rigoureuse des 5 hypothèses de blocage.

### Conclusions Clés

1. **Causes Racines Identifiées :**
   - **Absence de retour visuel sur les fins de course silencieuses :** Dans la version initiale, lorsque le recalcul échouait (ex: cycle verrouillé/scellé, 0 employé sélectionné, ou dates invalides), la fonction s'interrompait prématurément sans afficher de message ou notification Toast explicite, fermant le modal et laissant l'utilisateur sans information (`silent abort`).
   - **Absence de validation sur les dates inversées (`startDate > endDate`) :** Le formulaire soumettait des périodes incohérentes sans arrêt préventif.
   - **Contrôle d'immuabilité pré-calcul :** Un cycle au statut `SEALED`, `LOCKED` ou `PAID` ignorait les calculs (`Calculation skipped`) sans avertir l'utilisateur qu'une contre-passation (`reversePayrollCycle`) était nécessaire.

2. **Corrections Appliquées :**
   - Ajout d'une validation stricte des dates dans `EditCycleModal.tsx` (`startDate <= endDate`).
   - Contrôle d'immuabilité au niveau du modal et de `onReCalculate` (`CYCLE_IMMUTABLE`).
   - Détection des cycles à 0 employé inclus avec avertissement explicite (`NO_EMPLOYEES_INCLUDED`).
   - Intégration systématique des notifications Toasts avec codes d'observabilité (`RECALCULATION_SUCCEEDED`, `CALCULATION_FAILED`, `PERSISTENCE_FAILED`, `TENANT_UNRESOLVED`).

3. **Validation & Non-Régression :**
   - `compile_applet` : Succès (0 erreur de compilation).
   - `lint_applet` : Succès (`tsc --noEmit` 0 erreur).
   - `PayrollCycleSmoke.test.ts` & `PayrollWorkflow.test.ts` : Succès.

---

## 2. PARCOURS D'EXÉCUTION DU RECALCUL

```text
[Clic Utilisateur sur "Enregistrer & Recalculer"]
      │
      ▼
[EditCycleModal.handleSubmit(e)]
      ├─► Validation Dates : !startDate || !endDate ──► toast.error("Veuillez spécifier la période")
      ├─► Validation Inversion : startDate > endDate ─► toast.error("Date invalide (startDate > endDate)")
      ├─► Controle Immuabilité : SEALED/LOCKED/PAID ──► toast.error("CYCLE_IMMUTABLE")
      └─► Controle Sélection : includedEmps.length==0 ► toast.warning("NO_EMPLOYEES_INCLUDED")
      │
      ▼
[onUpdateCycle(cycle.id, updates)] ──► Persistance Firestore (PayrollRepository.updateCycle)
      │
      ▼
[onReCalculate(updatedCycle)] dans PayrollEngine.tsx
      ├─► Verification Tenant : !current_business_id ──► toast.error("TENANT_UNRESOLVED")
      └─► Execution Dry-Run : runPayrollDryRun(updatedCycle)
            │
            ▼
      [PayrollService.processPayrollCycle]
            │
            ▼
      [Commit & Local State Update]
            ├─► Succès : commitPayrollCycle() + addRecordsLocal() ──► toast.success("RECALCULATION_SUCCEEDED")
            └─► Calcul vide : calculatedRecords.length == 0 ──────► toast.warning("NO_EMPLOYEES_INCLUDED")
```

---

## 3. ÉVALUATION DÉTAILLÉE DES CINQ HYPOTHÈSES

### Hypothèse 1 — Immutabilité du Cycle (`LOCKED`, `SEALED`, `PAID`)
- **Constat :** Dans `usePayrollCalculation.ts`, tout cycle en statut `SEALED` retourne immédiatement un tableau vide `[]`. En outre, les règles Firestore interdisent les écritures directes sur les cycles verrouillés ou payés.
- **Correction Appliquée :** Le modal et `onReCalculate` vérifient désormais explicitement le statut du cycle avant de déclencher le calcul. Si le cycle n'est pas en statut `DRAFT`, l'opération est refusée avec le code `CYCLE_IMMUTABLE` et un message expliquant qu'un workflow de contre-passation/extourne est nécessaire.

### Hypothèse 2 — Tenant Non Résolu (`resolvedBusinessId`)
- **Constat :** Si l'identifiant du tenant est vide (`""`), `PayrollRepository.updateCycle` lève une exception `Multi-Tenancy Violation`.
- **Correction Appliquée :** Validation préalable dans `onReCalculate`. Si `current_business_id` n'est pas résolu, le recalcul s'interrompt avec la notification `TENANT_UNRESOLVED`.

### Hypothèse 3 — Dates de Période Invalides ou Inversées
- **Constat :** Si les dates étaient manquantes ou inversées (`startDate > endDate`), le formulaire s'interrompait silencieusement ou transmettait une période incohérente à Firestore.
- **Correction Appliquée :** Ajout des validations dans `EditCycleModal.tsx` avec messages d'erreur Toast immédiats (`INVALID_PAYROLL_PERIOD`).

### Hypothèse 4 — Permissions Firestore Insuffisantes
- **Constat :** Les modifications de `payroll_cycles` sont soumises à `isTenantAdminOrManager`. Si un rôle non autorisé tente de soumettre la modification, Firestore rejette la requête avec `PERMISSION_DENIED`.
- **Correction Appliquée :** Interception du blocage dans le bloc `catch` de `handleSubmit` et affichage d'un Toast d'erreur explicite (`PERSISTENCE_FAILED`).

### Hypothèse 5 — Aucun Employé Inclus (`recordsCount == 0`)
- **Constat :** Si tous les employés étaient basculés en statut `EXCLU`, le recalcul produisait un tableau vide `[]`. Précédemment, cela n'affichait aucune alerte, laissant supposer un dysfonctionnement.
- **Correction Appliquée :** Si `includedEmps.length === 0`, un Toast d'avertissement `NO_EMPLOYEES_INCLUDED` informe explicitement l'utilisateur qu'aucun bulletin n'a été généré.

---

## 4. CODES D'OBSERVABILITÉ ET MESSAGES UTILISATEUR

| Code Observabilité | Trigger | Notification Utilisateur |
|---|---|---|
| `CYCLE_IMMUTABLE` | Statut cycle != DRAFT | `Opération refusée (CYCLE_IMMUTABLE) : Le cycle est SEALED/LOCKED. Un recalcul direct n'est pas autorisé.` |
| `TENANT_UNRESOLVED` | `current_business_id` vide | `Erreur (TENANT_UNRESOLVED) : L'identifiant d'entreprise n'est pas résolu.` |
| `INVALID_PAYROLL_PERIOD` | `startDate > endDate` ou dates vides | `Date invalide : La date de début ne peut pas être postérieure à la date de fin.` |
| `NO_EMPLOYEES_INCLUDED` | 0 employé inclus dans le cycle | `Avertissement (NO_EMPLOYEES_INCLUDED) : Aucun bulletin n'a été généré lors du recalcul.` |
| `PERSISTENCE_FAILED` | Erreur Firestore / Droit d'accès | `Échec de l'enregistrement (PERSISTENCE_FAILED) : Erreur de persistance.` |
| `CALCULATION_FAILED` | Erreur de formule / règles | `Échec du recalcul (CALCULATION_FAILED) : Erreur dans le moteur de calcul.` |
| `RECALCULATION_SUCCEEDED` | Calcul & Commit réussis | `Recalcul réussi (RECALCULATION_SUCCEEDED) : X bulletins enregistrés.` |

---

## 5. PREUVES DE TEST ET NON-RÉGRESSION

- **`compile_applet` :** Build Vite + ESBuild réussi sans avertissement fatal.
- **`lint_applet` :** Validation TypeScript `tsc --noEmit` réussie avec 0 erreur.
- **`PayrollCycleSmoke.test.ts` :** Passed (1/1).
- **`PayrollWorkflow.test.ts` :** Passed (1/1).
- **Limitation Émulateur Firestore :** Indisponibilité du binaire Java dans le conteneur OS local (`ECONNREFUSED 127.0.0.1:8088`), documentée conformément à la Phase P03.7D.

---

## 6. VERDICT FINAL

```text
PAYROLL_RECALCULATION_FIXED_WITH_TEST_EVIDENCE
```

**Justification :** La cause racine des arrêts silencieux a été identifiée et corrigée. Des validations préventives sur les dates, l'immuabilité et la sélection des employés ont été intégrées dans `EditCycleModal.tsx` et `PayrollEngine.tsx` avec un retour d'observabilité complet via Toasts, sans altérer la sécurité ni les règles de comptabilité immuable.
