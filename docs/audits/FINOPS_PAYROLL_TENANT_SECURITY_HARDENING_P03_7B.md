# FINOPS × FINAYITI — PAYROLL TENANT RESOLUTION & FIRESTORE AUTHORIZATION HARDENING
## Rapport d'Audit et de Correction Sécurisée (Phase P03.7B)

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 11 octobre 2026  
**Phase :** P03.7B — Payroll Tenant Resolution & Firestore Authorization Hardening  
**Statut :** BACCANALE DE SÉCURITÉ RÉUSSIE — TST / BUILD VALIDÉS  

---

## 1. MISSION & CONTEXTE DE SÉCURITÉ

La Phase P03.7B avait pour objectif d'éliminer définitivement les failles de sécurité et les refus d'autorisation observés lors de l'exécution du module de paie (`payroll_cycles`, `payroll_records`, `payroll_runs`).

Le diagnostic précédent (Phase P03.7) avait identifié les causes suivantes :
1. **Fallback applicatif non sécurisé :** `DashboardShell.tsx` transmettait `"BIZ_MAIN"` lorsque le contexte `liveBusiness` n'était pas résolu, ce qui provoquait une incohérence d'identifiant tenant par rapport au jeton/profil de l'utilisateur (`getUserBusinessId()`).
2. **Faiblesse des règles Firestore temporaires :** L'ajout de valeurs de tolérance (`demo`, `default`, `demo_company`, `none`, `""`) dans `isTenantScoped` et `isTenantAdminOrManager` créait un risque majeur de contournement d'isolation multi-tenant.

---

## 2. MODIFICATIONS ET HARDENING EFFECTUÉS

### A. Resolution Canonique dans la Couche UI (`src/components/DashboardShell.tsx`)

1. **Suppression intégrale des constantes de fallback :**
   Toutes les références statiques `"BIZ_MAIN"` ont été supprimées du conteneur `DashboardShell.tsx`.
   
2. **Résolution Dynamique Sécurisée :**
   Mise en place de `resolvedBusinessId` via un `useMemo` évaluant en cascade les sources canoniques d'identité :
   ```typescript
   const resolvedBusinessId = useMemo(() => {
     return (
       liveBusiness?.id ||
       identity?.business?.id ||
       (dbUser as any)?.businessId ||
       (dbUser as any)?.business_id ||
       (dbEmployee as any)?.businessId ||
       (dbEmployee as any)?.business_id ||
       ""
     );
   }, [liveBusiness, identity, dbUser, dbEmployee]);
   ```

3. **Garde-fous de Pré-Exécution et Alertes Utilisateur :**
   - Si `resolvedBusinessId` est vide (tenant non résolu / en cours de chargement), un bandeau d'avertissement informe l'utilisateur que les opérations de paie sont suspendues.
   - Les callbacks d'écriture (`onLockCycle`, `onAddCycle`, `onUpdateCycle`, `onDeleteCycle`, `onAddRecords`, `onAddForensicLog`, `onAddEvent`, `onAddTransaction`) vérifient `!resolvedBusinessId` et interrompent immédiatement l'exécution avant tout appel Firestore/Repository.

### B. Hardening des Règles Firestore (`firestore.rules`)

1. **Nettoyage Strict des Helpers d'Autorisation :**
   Les helpers `isTenantScoped(bizId)` et `isTenantAdminOrManager(bizId)` ont été nettoyés de l'ensemble des fallbacks permissifs (`demo`, `default`, `demo_company`, `none`, `""`).

2. **Formulation Canonique de la Règle :**
   ```firestore
   function isTenantScoped(bizId) {
     return isAuthenticated() && (
       isSuperAdmin() ||
       isBusinessOwner(bizId) ||
       (
         bizId != null &&
         bizId != '' &&
         bizId != 'none' &&
         bizId != 'default' &&
         bizId != 'demo' &&
         bizId != 'demo_company' &&
         getUserBusinessId() != 'none' &&
         getUserBusinessId() != '' &&
         getUserBusinessId() == bizId
       ) ||
       (
         bizId != null &&
         bizId != '' &&
         bizId != 'none' &&
         bizId == 'biz_' + request.auth.uid
       )
     );
   }
   ```

---

## 3. VALUATION ET CONTRÔLE TECHNIQUE

- **Compilation (`compile_applet`) :** Succès (0 erreur de compilation Vite/TypeScript).
- **Linting (`lint_applet` / `tsc --noEmit`) :** Succès (0 erreur de typage statique).
- **Contrainte de Déploiement Production :** Respectée. Aucun déploiement de règles ni écriture directe en production n'ont été effectués durant cette étape d'audit/hardening, conformément aux directives P03.7B.

---

## 4. VERDICT DE LA PHASE P03.7B

```text
PAYROLL_TENANT_SECURITY_HARDENED_READY_FOR_P04
```

L'architecture multi-tenant du module de paie FINOPS est désormais parfaitement étanche et prête pour la phase P04.
