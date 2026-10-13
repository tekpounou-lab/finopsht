# FINOPS × FINAYITI — PAYROLL FIRESTORE PERMISSION FAILURE & TENANT ISOLATION AUDIT
## Diagnostic de Sécurité et Audit Contradictoire de l'Exécution de la Paie

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 11 octobre 2026  
**Mode :** STRICT READ-ONLY — Diagnostic de Sécurité & Modèle de Droit  
**Livrable unique :** `docs/audits/FINOPS_PAYROLL_FIRESTORE_PERMISSION_DIAGNOSTIC.md`

---

## 1. Executive Summary & Verdict Formal

### Verdict Autorisé
```text
PAYROLL_TENANT_ISOLATION_RISK_CONFIRMED
```

### Synthèse Exécutive
Cet audit contradictoire a reconstitué la chaîne complète d'exécution de la paie et analysé la cause exacte du refus de permission Firestore (`Missing or insufficient permissions`) sur la collection `payroll_cycles`.

L'analyse démontre deux anomalies majeures :

1. **Cause racine de l'échec initial** : Un conflit direct entre la résolution du tenant dans le composant d'interface `DashboardShell.tsx` (qui utilisait un fallback par défaut `"BIZ_MAIN"` lorsque l'objet `liveBusiness` était nul ou en cours de chargement) et les helper functions de `firestore.rules` (`isTenantScoped` / `isTenantAdminOrManager`), qui comparaient strict `getUserBusinessId()` (issu du document profil `/users/{uid}` de l'utilisateur ou du token Auth) à la valeur cible du document (`"BIZ_MAIN"`).
2. **Effet du hotfix intermédiaire** : L'introduction de correspondances souples (`demo`, `default`, `demo_company`, `none`, `""`) dans `firestore.rules` pour contourner le blocage a temporairement autorisé l'écriture, mais **crée un risque critique d'accès inter-tenant (cross-tenant leakage)**. En effet, tout utilisateur authentifié sans `business_id` dans ses claims Auth ou appartenant à un tenant de test peut désormais lire ou modifier des documents portant ces identifiants réservés ou n'ayant pas de `business_id` renseigné.

Aucun code de production ni aucune règle Firestore n'ont été modifiés pendant cet audit (Mode Lecture Seule Strict).

---

## 2. Reconstitution de la Chaîne Réelle d'Exécution de la Paie

### 2.1 Composants et Méthodes Impliqués
La gestion du cycle de paie suit la chaîne d'appel suivante :

1. **Interface Utilisateur** : `src/components/DashboardShell.tsx`
   - Callback `onUpdateCycle` (lignes 270-276) :
     ```typescript
     onUpdateCycle={async (cycleId, updates) => {
       console.debug(`[Payroll] Updating cycle ${cycleId}:`, updates);
       await PayrollRepository.updateCycle(cycleId, {
         ...updates,
         business_id: liveBusiness?.id || "BIZ_MAIN"
       });
     }}
     ```
2. **Dépôt Trésorerie & Paie** : `src/repositories/PayrollRepository.ts`
   - Méthode `updateCycle` (lignes 194-242) :
     ```typescript
     async updateCycle(cycleId: string, updates: Partial<PayrollCycle> & { business_id: string }): Promise<void> {
       if (!updates.business_id) {
         throw new Error("Multi-Tenancy Violation: business_id is required to update PayrollCycle.");
       }
       const ref = doc(db, "payroll_cycles", cycleId);
       await setDoc(ref, {
         ...updates,
         updated_at: serverTimestamp()
       }, { merge: true });
     }
     ```
3. **Moteur d'Erreur Firestore** : `src/lib/firebase.ts`
   - Méthode `handleFirestoreError` (lignes 161-210) capturant l'exception Firestore et journalisant l'événement.

### 2.2 Analyse Détaillée du Refus de Permission

* **Chemin Firestore** : `payroll_cycles/cyc_mv2wy1sw7y3s`
* **Type d'opération** : `WRITE` (`setDoc` avec `{ merge: true }`)
* **Profil Utilisateur** : `userId: "vo5k***A7x1"`, `email: "f***t@***.com"`, Token Auth sans claim custom `businessId` (`tenantId: "[NO_BIZ_ID]"`).
* **Profil Métier Firestore (`/users/vo5k***A7x1`)** : `business_id: "biz_vo5k***A7x1"` ou indéfini.
* **Payload transmis par le composant UI** :
  ```json
  {
    "status": "DRAFT",
    "excludedEmployeeIds": [...],
    "business_id": "BIZ_MAIN",
    "updated_at": "SERVER_TIMESTAMP"
  }
  ```
* **Évaluation de la Règle Firestore (`firestore.rules` lignes 707-716)** :
  ```firestore
  match /payroll_cycles/{cycleId} {
    allow read: if isAuthenticated() && (isSuperAdmin() || isTenantScoped(getBusinessId(resource.data)));
    allow create, update: if isAuthenticated() && (
      isSuperAdmin() || 
      isTenantScoped(getBusinessId(request.resource.data)) ||
      (resource != null && isTenantScoped(getBusinessId(resource.data))) ||
      isTenantAdminOrManager(getBusinessId(request.resource.data))
    );
  }
  ```
  1. `getBusinessId(request.resource.data)` extrait `"BIZ_MAIN"`.
  2. `getUserBusinessId()` évalue à `"biz_vo5k***A7x1"` (provenant du document `/users/vo5k***A7x1`).
  3. `isTenantScoped("BIZ_MAIN")` compare `"BIZ_MAIN"` à `"biz_vo5k***A7x1"`.
  4. La comparaison échoue (`"BIZ_MAIN" != "biz_vo5k***A7x1"`).
  5. `isTenantAdminOrManager("BIZ_MAIN")` échoue pour la même raison.
  6. **Résultat** : Refus systématique `Missing or insufficient permissions`.

---

## 3. Inspection Approfondie des Helpers de Sécurité

### 3.1 Implémentation Actuelle des Helpers (`firestore.rules`)

```firestore
function isBusinessOwner(bizId) {
  return isAuthenticated() && (
    bizId == 'biz_' + request.auth.uid ||
    (resource != null && resource.data != null && (
      resource.data.get('ownerId', '') == request.auth.uid ||
      resource.data.get('owner_id', '') == request.auth.uid ||
      resource.data.get('userId', '') == request.auth.uid ||
      resource.data.get('uid', '') == request.auth.uid
    )) ||
    (request.resource != null && request.resource.data != null && (
      request.resource.data.get('ownerId', '') == request.auth.uid ||
      request.resource.data.get('owner_id', '') == request.auth.uid ||
      request.resource.data.get('userId', '') == request.auth.uid ||
      request.resource.data.get('uid', '') == request.auth.uid
    )) ||
    (bizId != 'none' && bizId != '' && exists(/databases/$(database)/documents/businesses/$(bizId)) && (
      get(/databases/$(database)/documents/businesses/$(bizId)).data.get('ownerId', '') == request.auth.uid ||
      get(/databases/$(database)/documents/businesses/$(bizId)).data.get('owner_id', '') == request.auth.uid
    ))
  );
}

function isTenantScoped(bizId) {
  return isAuthenticated() && (
    isSuperAdmin() ||
    isBusinessOwner(bizId) ||
    bizId == 'none' ||
    bizId == '' ||
    bizId == 'default' ||
    bizId == 'demo' ||
    bizId == 'demo_company' ||
    getUserBusinessId() == 'none' ||
    getUserBusinessId() == 'default' ||
    getUserBusinessId() == 'demo' ||
    (bizId != 'none' && bizId != '' && getUserBusinessId() != 'none' && getUserBusinessId() == bizId) ||
    (bizId != 'none' && bizId != '' && bizId == 'biz_' + request.auth.uid)
  );
}
```

### 3.2 Tableau d'Évaluation des Comportements aux Limites

| Paramètre / Condition | `resource` | `request.resource` | `getUserBusinessId()` | Résultat `isTenantScoped(bizId)` | Risque de Sécurité |
|---|---|---|---|---|---|
| `bizId = 'biz_A'` | Existant (`biz_A`) | Nouveau (`biz_A`) | `'biz_A'` | `TRUE` | **Aucun** (Accès légitime tenant A) |
| `bizId = 'biz_A'` | Existant (`biz_A`) | Nouveau (`biz_A`) | `'biz_B'` | `FALSE` | **Aucun** (Isolation inter-tenant respectée) |
| `bizId = 'demo'` | Existant (`demo`) | Indifférent | `'biz_B'` | `TRUE` | **ÉLEVÉ** (L'utilisateur du Tenant B accède aux données `demo`) |
| `bizId = 'default'` | Existant (`default`) | Indifférent | `'biz_B'` | `TRUE` | **ÉLEVÉ** (L'utilisateur du Tenant B accède aux données `default`) |
| `bizId = ''` | Existant (`''`) | Indifférent | `'biz_B'` | `TRUE` | **CRITIQUE** (L'utilisateur B accède aux documents sans tenant) |
| `bizId = 'none'` | Non trouvé | Indifférent | `'biz_B'` | `TRUE` | **CRITIQUE** (Permet de lire/écrire des documents `none`) |
| `getUserBusinessId() = 'none'` | Indifférent | Indifférent | `'none'` | `TRUE` | **CRITIQUE** (Utilisateur non rattaché accède à TOUS les tenants) |
| `bizId = 'BIZ_MAIN'` | Existant (`BIZ_MAIN`) | Nouveau (`BIZ_MAIN`) | `'biz_A'` | `FALSE` | **BLOCAGE** (L'utilisateur du Tenant A ne peut pas écrire `BIZ_MAIN`) |

---

## 4. Matrice de Tests de Sécurité

Les tests ci-dessous sont issus d'une analyse statique contradictoire du code (`VERIFIED_STATIC`). Les tests runtime nécessitant un environnement d'émulation Firestore dédié sont marqués `UNPROVEN` ou `BLOCKED`.

| Acteur | Tenant Acteur | Tenant Cible | Opération | Résultat Attendu (Sécurité) | Résultat Réel (Règles Actuelles) | Type de Preuve |
|---|---|---|---|---|---|---|
| Admin Tenant A | `biz_tenantA` | `biz_tenantA` | Lecture `payroll_cycles` | ACCÈS AUTORISÉ | ACCÈS AUTORISÉ | `VERIFIED_STATIC` |
| Admin Tenant A | `biz_tenantA` | `biz_tenantA` | Création `payroll_cycles` | ACCÈS AUTORISÉ | ACCÈS AUTORISÉ | `VERIFIED_STATIC` |
| Admin Tenant A | `biz_tenantA` | `biz_tenantB` | Lecture `payroll_cycles` | REFUS STRICT | REFUS STRICT | `VERIFIED_STATIC` |
| Admin Tenant A | `biz_tenantA` | `biz_tenantB` | Écriture `payroll_cycles` | REFUS STRICT | REFUS STRICT | `VERIFIED_STATIC` |
| Admin Tenant A | `biz_tenantA` | `demo` | Écriture `payroll_cycles` | REFUS STRICT | **ACCÈS AUTORISÉ** (Fallback) | `VERIFIED_STATIC` (Réfutation Sécurité) |
| Admin Tenant A | `biz_tenantA` | `default` | Écriture `payroll_cycles` | REFUS STRICT | **ACCÈS AUTORISÉ** (Fallback) | `VERIFIED_STATIC` (Réfutation Sécurité) |
| Admin Tenant A | `biz_tenantA` | `""` (Vide) | Écriture `payroll_cycles` | REFUS STRICT | **ACCÈS AUTORISÉ** (Fallback) | `VERIFIED_STATIC` (Réfutation Sécurité) |
| Admin Tenant A | `biz_tenantA` | `BIZ_MAIN` | Écriture `payroll_cycles` | REFUS / ALIGNER TENANT | **REFUS DE PERMISSION** (Erreur UI) | `VERIFIED_STATIC` |
| Utilisateur sans tenant | `none` | `biz_tenantA` | Écriture `payroll_cycles` | REFUS STRICT | **ACCÈS AUTORISÉ** (Fallback `none`) | `VERIFIED_STATIC` (Réfutation Sécurité) |

---

## 5. Examen du Modèle de Données et Source de Vérité du Tenant

### 5.1 Incohérence des Nommages de Champs
Dans l'ensemble de l'application, deux conventions de nommage des tenants coexistent :
* `businessId` (camelCase) : utilisé dans la plupart des types TypeScript frontend et les claims Auth.
* `business_id` (snake_case) : utilisé dans Firestore pour les collections `payroll_cycles`, `payroll_records`, `payslips`, `ledger_transactions`, `forensic_logs`.

Dans `firestore.rules`, la fonction `getBusinessId(data)` unifie ces champs :
```firestore
function getBusinessId(data) {
  return data == null ? 'none' : (
    data.get('businessId', '') != '' ? data.get('businessId', '') :
    (data.get('business_id', '') != '' ? data.get('business_id', '') :
    (data.get('tenantId', '') != '' ? data.get('tenantId', '') :
    (data.get('tenant_id', '') != '' ? data.get('tenant_id', '') : 'none')))
  );
}
```

### 5.2 Diagnostic sur les Valeurs Placeholder (`BIZ_MAIN`, `demo`, `default`, `none`)
1. **`BIZ_MAIN`** : Utilisé dans `DashboardShell.tsx` comme valeur de secours UI lorsque l'entreprise active n'est pas encore chargée dans le state React (`liveBusiness?.id || "BIZ_MAIN"`). Ce n'est pas une entreprise canonique validée.
2. **`demo` / `demo_company`** : Valeurs générées par les scripts de seed ou d'environnement de test.
3. **`default` / `none` / `""`** : Utilisées lorsque les entités sont créées sans associer explicitement de tenant.

**Conclusion Modèle** : Traiter ces valeurs comme des passe-droits dans les règles de sécurité annule le principe d'isolation multi-tenant de FINOPS.

---

## 6. Écritures Multi-Documents & Batches

Lors des opérations complexes de paie, `PayrollRepository` utilise `MessageQueue.persistAndPublishWithBatch` pour réaliser des écritures atomiques via `writeBatch`.

### 6.1 Scénarios Multi-Documents

1. **Scellage de Paie (`sealCycleAtomic`)** :
   - Mise à jour de `payroll_cycles/{cycleId}` (champ `status: "SEALED"`).
   - Écriture des fiches de paie dans `payslips/{payslipId}`.
   - Écriture des transactions comptables dans `ledger_transactions/{txId}`.
   - Écriture du journal judiciaire dans `forensic_logs/{logId}`.
   - Écriture de l'événement outbox dans `erp_events/{eventId}`.

2. **Suppression de Cycle (`deleteCycle`)** :
   - Soft-delete de `payroll_cycles/{cycleId}` (`deleted: true`).
   - Soft-delete des enregistrements enfants `payroll_records/{recordId}`.
   - Écriture du journal dans `forensic_logs/{logId}`.

### 6.2 Risque Batch
Si l'application envoie un batch contenant des documents où `business_id` vaut `"BIZ_MAIN"` et d'autres où `business_id` vaut `"biz_tenantA"`, Firestore valide chaque règle individuellement. Si une seule règle échoue dans le batch, l'intégralité du batch est rejetée avec `Missing or insufficient permissions`.

---

## 7. Contrôle des Rôles Canoniques

Les rôles canoniques FINOPS définis dans la constitution système sont :
* `JUNIOR_TELLER` : Guichetier junior (Limité à sa propre caisse)
* `SENIOR_TELLER` : Guichetier senior (Gestion caisse / coffre)
* `HEAD_TELLER` : Chef de guichet
* `MANAGER` : Gestionnaire de succursale / entreprise
* `OWNER` : Propriétaire d'entreprise
* `AUDITOR` : Auditeur lecture seule
* `SUPER_ADMIN` : Administrateur plateforme

Actuellement, la fonction `isTenantAdminOrManager(bizId)` dans `firestore.rules` vérifie `getUserRole() in ['ADMIN', 'OWNER', 'MANAGER']`.

**Problème détecté** : L'utilisation du fallback `getUserBusinessId() == 'none'` ou `bizId == 'demo'` autorise n'importe quel rôle (y compris un `JUNIOR_TELLER` ou un utilisateur sans rôle) à effectuer des créations ou modifications de paie sur les collections ouvertes.

---

## 8. Diagnostic Final & Classification des Constats

### Classification des Constats
- **Cause de l'erreur initiale** : `VERIFIED_STATIC` (Mismatch UI `BIZ_MAIN` vs profil utilisateur Firestore).
- **Incapacité des fallbacks actuels à garantir l'isolation** : `VERIFIED_STATIC` (Réfutation de sécurité prouvée).
- **Exécution d'un batch bloqué par un document non aligné** : `VERIFIED_STATIC`.
- **Validation runtime avec données de production** : `BLOCKED` (Interdiction stricte d'écritures de test sur la base de production).

### Conclusions Distinctes

A. **Cause de l'erreur de paie** : L'interface utilisateur soumettait des mises à jour de paie avec `business_id: "BIZ_MAIN"` en cas d'absence temporaire de l'objet `liveBusiness`, alors que le profil Firestore de l'utilisateur était associé à son `business_id` réel (`biz_...`).
B. **Efficacité du correctif actuel** : Le hotfix a levé le blocage technique immédiat pour les tenants de test, mais en utilisant des jokers globaux.
C. **Risque d'accès inter-tenant** : **CONFIRMÉ**. L'autorisation accordée aux chaînes `'demo'`, `'default'`, `'none'`, `''` permet à tout utilisateur authentifié d'accéder aux collections portantes ces identifiants sans contrôle de tenant.
D. **Compatibilité avec les rôles canoniques** : Incomplète. Les règles actuelles ne vérifient pas systématiquement si l'utilisateur possède le rôle `MANAGER`, `OWNER` ou `SUPER_ADMIN` avant de modifier un cycle de paie.
E. **Possibilité de validation sans risque** : Nécessite la correction conjointe de la résolution du tenant dans le frontend et du nettoyage des helpers Firestore.

---

## 9. Correctif Proposé (Conception Seule — Non Appliqué)

### 9.1 Correction Frontend (Résolution Strict du Tenant)
Dans `DashboardShell.tsx` et dans l'ensemble des conteneurs de paie, empêcher l'exécution d'une mutation de paie si le `liveBusiness.id` n'est pas résolu. Ne jamais envoyer `"BIZ_MAIN"` comme fallback par défaut.

```typescript
// Proposed Frontend Pattern (DashboardShell.tsx)
onUpdateCycle={async (cycleId, updates) => {
  const activeBizId = liveBusiness?.id || authUser?.businessId || authUser?.business_id;
  if (!activeBizId || activeBizId === "BIZ_MAIN") {
    throw new Error("Impossible d'exécuter l'opération : Entreprise non sélectionnée ou en cours de chargement.");
  }
  await PayrollRepository.updateCycle(cycleId, {
    ...updates,
    business_id: activeBizId
  });
}}
```

### 9.2 Correction Firestore Rules (Suppression des Jokers Inter-Tenant)
Remplacer les helpers permissifs par une vérification stricte :

```firestore
// Proposed Secure Firestore Rule Helpers
function isTenantScoped(bizId) {
  return isAuthenticated() && (
    isSuperAdmin() ||
    isBusinessOwner(bizId) ||
    (bizId != 'none' && bizId != '' && getUserBusinessId() != 'none' && getUserBusinessId() == bizId) ||
    (bizId != 'none' && bizId != '' && bizId == 'biz_' + request.auth.uid)
  );
}

function isTenantAdminOrManager(bizId) {
  return isAuthenticated() && (
    isSuperAdmin() ||
    isBusinessOwner(bizId) ||
    (
      bizId != 'none' && 
      bizId != '' && 
      getUserBusinessId() == bizId && 
      getUserRole() in ['OWNER', 'MANAGER', 'ADMIN', 'HEAD_TELLER']
    )
  );
}
```

---

## 10. Réponse à la Question Finale

> **Question : Quelle condition exacte provoquait le refus de l'opération de paie, et comment la corriger sans permettre à un utilisateur d'accéder aux données d'un autre tenant ?**

**Réponse :**  
1. **Condition exacte du refus** : L'opération `updateCycle` transmettait `business_id: "BIZ_MAIN"` (fallback UI d'attente dans `DashboardShell.tsx`) alors que le profil de l'utilisateur authentifié contenait un `businessId` réel distinct (`biz_...`). La règle Firestore vérifiait l'égalité stricte entre `request.resource.data.business_id` ("BIZ_MAIN") et `getUserBusinessId()` ("biz_..."), rejetant l'accès.
2. **Correction sécurisée sans fuite inter-tenant** : 
   - **Côté Frontend** : Bloquer les requêtes de paie si le tenant de l'utilisateur n'est pas formellement résolu (supprimer le fallback `"BIZ_MAIN"`).
   - **Côté Firestore Rules** : Supprimer l'ensemble des jokers (`demo`, `default`, `none`, `""`) des fonctions `isTenantScoped` et `isTenantAdminOrManager` et exiger que l'identifiant du document corresponde exactement au `businessId` validé dans le profil/token de l'utilisateur.
