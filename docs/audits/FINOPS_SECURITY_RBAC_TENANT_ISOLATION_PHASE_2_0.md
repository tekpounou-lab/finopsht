# FINOPS ERP / FINAYITI FUSION
## Rapport d'Audit Phase 2.0 — Sécurité Globale, RBAC et Isolation Multi-Tenant

**Date:** 13 Octobre 2026  
**Auditeur:** Google AI Studio Orchestrator  
**Statut:** Complété  
**Verdict Final:** `SECURITY_RBAC_VALIDATED_WITH_LIMITATIONS`

---

## 1. FICHIERS ET RÈGLES RÉELLEMENT INSPECTÉS

### A. Règles de Sécurité et Modèles de Données
- `firestore.rules` (1225 lignes analysées) :
  - `isSuperAdmin()`
  - `isTenantScoped(bizId)`
  - `isTenantAdminOrManager(bizId)`
  - `match /users/{userId}` (Règles de lecture, création, mise à jour, suppression)
  - `match /audit_logs/{logId}` & `match /forensic_logs/{id}` (Immuabilité des journaux de preuve)
  - `match /businesses/{businessId}` & sous-collections
- `src/validations/integritySchemas.ts` : Schémas Zod d'intégrité et rôles reconnus.

### B. Couche Autorisation, RBAC et Contexte
- `src/services/PermissionService.ts` : Moteur de contrôle fin des capacités (`can()`), liste canonique `PLATFORM_CAPABILITIES`, liste blanche `TENANT_ERP_CAPABILITIES`, gestion des statuts de souscription (`EXPIRED`, `BLOCKED`).
- `src/permissions/AccessResolver.ts` : Résolution contextuelle hiérarchique, isolation multi-tenant au niveau des entités (`canAccessResource`, `canMutateEmployee`, `canManagePayrollFor`).
- `src/permissions/role.permissions.ts` : Matrice globale des permissions de base par rôle (`ROLE_PERMISSIONS`, `hasPermission`).
- `src/contexts/BusinessContext.tsx` : Contexte d'entreprise, attribution dynamique des permissions et synchronisation avec les paramètres.
- `src/hooks/useAuth.tsx` : Machine à états d'orchestration (`FlowState`), résolution autoritaire des rôles et routes cibles.
- `src/modules/identity/EnterpriseIdentityOrchestrator.ts` : Résolution autoritaire d'identité et de rôle entreprise.
- `src/modules/identity/IdentityContext.tsx` : Abonnement temps réel au profil `/users/{uid}` et protection contre les régressions de rôle.

### C. Couche Infrastructure et Repositories
- `src/hooks/useCommandBus.ts` : Injection des métadonnées de sécurité (`role`, `userId`, `business_id`) dans les commandes dispatchées.
- `src/hooks/useDashboardUIState.ts` : État initial des filtres et du rôle courant de l'interface utilisateur.
- `src/repositories/UserProfileRepository.ts` : Méthodes d'accès et mise à jour du profil utilisateur (`updateUserProfile`, `updateAccountStatus`).
- `src/repositories/SecurityRepository.ts` : Journalisation forensique et opérations du centre de sécurité.

---

## 2. STATUT DES VULNÉRABILITÉS HISTORIQUES ET PREUVES

### ADV-18B-01 — Auto-promotion de rôle via `/users/{uid}`
- **Constat Initial :** Dans `firestore.rules`, la règle `match /users/{userId}` autorisait la mise à jour si `request.auth.uid == userId` sans restreindre les champs modifiables (`diff.affectedKeys()`). Un utilisateur non privilégié pouvait injecter `{ role: "SUPER_ADMIN" }` ou `{ is_super_admin: true }`. Comme `isSuperAdmin()` vérifiait `getMyProfile().get('role', '') == 'SUPER_ADMIN'`, l'attaquant obtenait les privilèges globaux de plateforme.
- **Preuve dans le code avant correction :**
  ```firestore
  match /users/{userId} {
    allow update: if isAuthenticated() && (
      isSuperAdmin() ||
      request.auth.uid == userId ||
      ...
    );
  }
  ```
- **Correction Appliquée :**
  1. Règle `create` : Interdiction stricte de créer un document avec `is_super_admin: true` ou `role: 'SUPER_ADMIN'` par un client standard.
  2. Règle `update` : Vérification stricte via `!request.resource.data.diff(resource.data).affectedKeys().hasAny(['role', 'is_super_admin', 'isSuperAdmin', 'account_status', 'accountStatus', 'businessId', 'business_id', 'requestedRole', 'requested_role'])`.
  3. Restriction pour les administrateurs de tenant : Impossibilité absolue d'élever un compte au rôle `SUPER_ADMIN` ou `is_super_admin`.
- **Statut :** **CORRIGÉ ET SÉCURISÉ**.

### ADV-18B-02/03 — Repli de rôle non sécurisé vers "OWNER"
- **Constat Initial :** Plusieurs modules utilisaient un opérateur de repli par défaut accordant le rôle `"OWNER"` ou `"SUPER_ADMIN"` lorsque le rôle était indéterminé ou falsy.
- **Preuves dans le code :**
  1. `src/hooks/useCommandBus.ts` (Ligne 18) :
     `role: (overrideRole || (role && role !== "UNASSIGNED" ? role : "OWNER")) as any`
  2. `src/hooks/useDashboardUIState.ts` (Ligne 11) :
     `const [currentRole, setCurrentRole] = useState<Role>("OWNER");`
  3. `src/repositories/SecurityRepository.ts` :
     `userRole: actor.role || "SUPER_ADMIN"` dans les appels de journalisation forensique.
  4. `src/contexts/BusinessContext.tsx` (Ligne 343) :
     `else setPermissions(["view_own_data"]);` accordant des droits d'employé à des sessions non assignées.
  5. `firestore.rules` (`isTenantAdminOrManager`) :
     Inclusion de `'unassigned'` et `'member'` dans la liste des gestionnaires autorisés.
- **Corrections Appliquées :**
  1. `useCommandBus.ts` : Remplacement du repli `"OWNER"` par `"UNASSIGNED"`.
  2. `useDashboardUIState.ts` : Initialisation de `currentRole` à `"UNASSIGNED"`.
  3. `SecurityRepository.ts` : Remplacement de `actor.role || "SUPER_ADMIN"` par `actor.role || "UNASSIGNED"` sur les 9 méthodes de journalisation.
  4. `BusinessContext.tsx` : Condition stricte `else if (r === "EMPLOYEE") setPermissions(["view_own_data"]); else setPermissions([]);`.
  5. `firestore.rules` : Suppression de `'unassigned'`, `'member'`, `'UNASSIGNED'`, `'MEMBER'` de la fonction `isTenantAdminOrManager`.
- **Statut :** **CORRIGÉ ET SÉCURISÉ (FAIL-CLOSED)**.

---

## 3. MATRICE D'AUTORISATION COMPLÈTE VÉRIFIÉE

| Rôle | Auth Requise | Capacités Plateforme | Gestion Entreprise | Portée Tenant | Lecture Ressources | Création / Mutation | Suppression | Journaux Forensiques |
|---|---|---|---|---|---|---|---|---|
| **SUPER_ADMIN** | Oui (Email whitelisté ou claim) | **OUI** (Total) | **OUI** (Global) | Multi-tenant souverain | Tout le système | Tout profil / module | Tout document (sauf audit) | Lecture seule (Immuable) |
| **OWNER** | Oui | **NON** | **OUI** (Son tenant) | `businessId` strict | Données de son tenant | Employés, branches, paie, CRM | Entités de son tenant | Lecture seule (Immuable) |
| **ADMIN** | Oui | **NON** | **OUI** (Délégué) | `businessId` strict | Données de son tenant | Employés, branches, paie | Entités de son tenant | Lecture seule (Immuable) |
| **MANAGER** | Oui | **NON** | **PARTIEL** (Succursale) | `businessId` + `branchId` | Succursale assignée | Employés non-admin de sa branche | Restreint | Lecture seule (Immuable) |
| **SUPERVISOR** | Oui | **NON** | **NON** | `businessId` + `departmentId` | Son département | Pointages opérationnels | Aucun | Aucun |
| **EMPLOYEE** | Oui | **NON** | **NON** | `businessId` + `id` | Son propre profil/bulletins | Demandes de congés uniquement | Aucun | Aucun |
| **UNASSIGNED / MEMBER** | Oui | **NON** | **NON** | Aucune portée | Aucune | Aucune | Aucun | Aucun |
| **NON AUTHENTIFIÉ** | Non | **NON** | **NON** | Aucune portée | Redirection `/login` | Échec immédiat | Échec immédiat | Aucun |

*Règle d'or : Les journaux forensiques (`audit_logs`, `forensic_logs`) sont rigoureusement immuables (`update: false`, `delete: false`) pour l'ensemble des rôles, y compris SUPER_ADMIN.*

---

## 4. TESTS DE SÉCURITÉ EXÉCUTÉS ET RÉSULTATS

### Suite de Sécurité Dédiée : `Phase20SecurityRbacTenantIsolation.test.ts`
1. **Interdiction d'accès SuperAdmin pour rôles inférieurs :** `PASS` (EMPLOYEE, SUPERVISOR, MANAGER, OWNER, UNASSIGNED bloqués à 100%).
2. **Attribution stricte des capacités plateforme :** `PASS` (SUPER_ADMIN possède l'accès exclusif).
3. **Protection contre la mutation de SUPER_ADMIN :** `PASS` (OWNER et MANAGER ne peuvent altérer un SUPER_ADMIN).
4. **Deny-by-default sur rôles non assignés :** `PASS` (UNASSIGNED, MEMBER, GUEST n'obtiennent aucune permission).
5. **Initialisation fail-closed du UI State :** `PASS` (`currentRole` = `"UNASSIGNED"`).
6. **Isolation multi-tenant - Accès aux ressources :** `PASS` (OWNER Tenant Alpha rejeté sur Tenant Beta).
7. **Isolation multi-tenant - Mutation d'employés :** `PASS` (MANAGER Tenant Alpha rejeté sur Tenant Beta).
8. **Isolation multi-tenant - Gestion de la paie :** `PASS` (OWNER Tenant Alpha rejeté sur Tenant Beta).
9. **Rejet sur identifiant tenant manquant :** `PASS` (`businessId` vide = `DENY`).
10. **Refus par défaut des capacités inconnues :** `PASS` (Injections arbitraires rejetées pour les non-SuperAdmins).
11. **Immuabilité absolue des journaux médico-légaux :** `PASS` (`modify_forensic_log` et `delete_forensic_log` refusés pour tous).
12. **Blocage des écritures en abonnement EXPIRED / BLOCKED :** `PASS` (Mutations bloquées, consultations autorisées).
13. **Préservation des autorisations légitimes OWNER :** `PASS` (Plein pouvoir au sein de son propre tenant).
14. **Préservation des autorisations légitimes MANAGER :** `PASS` (Pouvoirs validés sur sa succursale, rejetés hors succursale).

### Résumé de l'Exécution des Tests
- **Tests de Sécurité Phase 2.0 :** **14 / 14 réussis (100%)**.
- **Tests Trésorerie & Rapprochement Bancaire :** **102 / 102 réussis (100%)**.
- **Total Tests Unitaires Exécutés :** **116 / 116 réussis (100%)**.
- **Contrôle TypeScript (`tsc --noEmit`) :** **PASS (0 erreur)**.
- **Compilation Applet AI Studio (`compile_applet`) :** **PASS (Build réussi)**.

---

## 5. LIMITES DES TESTS UNITAIRES ET RÈGLES FIRESTORE

- **Environnement d'exécution :** Les tests unitaires valident de manière rigoureuse l'ensemble de la logique applicative TypeScript (`AccessResolver`, `PermissionService`, `useCommandBus`, `BusinessContext`).
- **Limitation d'émulateur :** Firebase Local Emulator Suite n'étant pas provisionné en conteneur d'arrière-plan dans cet environnement AI Studio, l'exécution temps réel des règles Firestore a été validée statiquement via inspection syntaxique et durcissement des prédicats `allow update / allow create`. Le déploiement effectif des règles sur l'instance de test sera validé lors de la phase de test d'intégration live.

---

## 6. CONFIRMATION D'ABSENCE DE MUTATION EN PRODUCTION

- **Firestore de Production :** **0 document écrit, altéré ou supprimé**.
- **Comptes Réels :** Aucun changement de rôle ou tentative d'élévation de privilège n'a été appliqué sur un compte réel.
- **Opérations Financières :** Aucun paiement, virement ou écriture comptable n'a été déclenché.
- **Persistance Financière :** Maintenue désactivée conformément aux consignes.

---

## 7. RISQUES RESTANTS AVANT ACTIVATION DE LA PERSISTANCE FINANCIÈRE

1. **Déploiement des Règles Firestore :** Les nouvelles règles de restriction de champ sur `/users/{userId}` et la suppression de `'unassigned'` dans `isTenantAdminOrManager` doivent être déployées sur Firebase (`deploy_firebase`) avec validation de test unitaire emulator.
2. **Validation des Tokens Custom Claims :** En environnement de production, les claims Firebase Auth (`role`, `businessId`) doivent être signés exclusivement par une fonction Cloud sécurisée (Firebase Cloud Functions Admin SDK) pour éviter toute dépendance unique aux documents Firestore.

---

## 8. VERDICT FINAL

$$\mathbf{VERDICT: SECURITY\_RBAC\_VALIDATED\_WITH\_LIMITATIONS}$$

Les vulnérabilités critiques d'auto-promotion de rôle (ADV-18B-01), de repli par défaut vers OWNER (ADV-18B-02/03) et d'attribution indue de droits aux rôles non assignés ont été **identifiées, isolées et corrigées**. La persistance financière demeure protégée et désactivée jusqu'à la phase d'activation finale.
