# FINOPS ERP / FINAYITI FUSION — PHASE MOD-GOV-7B
## AUDIT ADVERSARIAL READ-ONLY DES RISQUES CRITIQUES FIRESTORE

**Date :** 23 Octobre 2026  
**Auteur :** AI Engineering Orchestrator / Security Audit Specialist  
**Mode :** DIAGNOSTIC STRICTEMENT READ-ONLY — AUCUNE REMÉDIATION APPLIQUÉE DANS CETTE PHASE  
**Émulateur Firestore :** Actif sur `127.0.0.1:8088` (Java OpenJDK 21)  
**Verdict Global :** `FAIL — EXPLOITABLE RULE BYPASS CONFIRMED`

---

## 1. PHASES DE SNAPSHOT ET INTÉGRITÉ DU DÉPÔT (PHASE A)

### 1.1 Empreintes Numériques (Hashes SHA-256)

| Fichier / Composant | Empreinte SHA-256 | État de Modification |
|---|---|---|
| `firestore.rules` | `1a21c23c6b007f19b8534f40e794db8b49592af6acf2b2f417c5c7a7f46697d6` | STRICTEMENT INCHANGÉ |
| `ModGov4RuntimeCertification.test.ts` | `81e876a166a058c50bebfb8e94f3f7611ff964cd967feb6c9a97d4a838ef3733` | STRICTEMENT INCHANGÉ |
| `ModGov5PreDeploymentReview.test.ts` | `5454a82eb2143d4330d1f956a3b2e44fc1dbfce6ef7f79142420aa24895e96d2` | STRICTEMENT INCHANGÉ |
| `ModGov6PayloadBypassRemediation.test.ts` | `07754fece7c60e7055ab1bdae26ed2f8d32cd464ba1172d4e8c54635385642fc` | STRICTEMENT INCHANGÉ |
| `ModGov7BAdversarialAudit.test.ts` | `2f91a6d91bc8100d33e9b10901e1a8a25c3453a9101d29bc3532c12ab990141f` | CRÉÉ POUR TESTS RUNTIME |

### 1.2 Configuration de l'Émulateur
- **Hôte/Port :** `127.0.0.1:8088`
- **Moteur :** Firebase Emulator Suite via Java 21 OpenJDK JRE.
- **Rules Loaded :** Chargement direct du fichier `firestore.rules` du dépôt.

---

## 2. SYNTHÈSE EXECUTIVE ET MATRICE DES SCÉNARIOS ADVERSARIAUX (PHASE B)

L'audit adversarial exécuté contre le moteur runtime de sécurité Firestore a révélé **cinq (5) vulnérabilités critiques exploitables** qui permettent à des utilisateurs ordinaires d'escalader leurs privilèges, de falsifier les journaux d'audit, de détourner des invitations, de falsifier la paie et de contrôler le moteur de workflow global.

### Matrice Récapitulative des Scénarios

| ID Test | Périmètre | Rôle Synthétique | Chemin Firestore | Opération & Payload | Résultat Attendu | Résultat Observé | Verdict |
|---|---|---|---|---|---|---|---|
| **ADV-B1-01** | Profil Utilisateur | `EMPLOYEE` | `/users/attacker-uid` | `set({ role: 'owner', businessId: 'tenant-victim' })` | DENIED | **ALLOWED (`writeAllowed=true`)** | **`FAIL`** |
| **ADV-B1-02** | Profil Utilisateur | `EMPLOYEE` | `/users/attacker-uid` | `update({ role: 'owner', businessId: 'tenant-victim' })` | DENIED | **ALLOWED (`updateAllowed=true`)** | **`FAIL`** |
| **ADV-B1-03** | Profil Utilisateur | `EMPLOYEE` | `/users/attacker-uid` | `set({ is_super_admin: true })` | DENIED | PERMISSION_DENIED | `PASS` |
| **ADV-B2-01** | Journaux Audit | Authentifié | `/audit_logs/log-123` | `update({ status: 'FAILED', amount: 0 })` | DENIED | **ALLOWED (`updateAllowed=true`)** | **`FAIL`** |
| **ADV-B2-02** | Journaux Audit | Authentifié | `/security_audit_logs/sec-101` | `update({ severity: 'LOW', event: 'PING' })` | DENIED | **ALLOWED (`updateAllowed=true`)** | **`FAIL`** |
| **ADV-B2-03** | Journaux Audit | Authentifié | `/audit_logs/log-delete-target` | `delete()` | DENIED | PERMISSION_DENIED | `PASS` |
| **ADV-B3-01** | Invitations | Authentifié (Non Destinataire) | `/invitations/invite-999` | `update({ status: 'ACCEPTED', uid: 'attacker-uid' })` | DENIED | **ALLOWED (`updateAllowed=true`)** | **`FAIL`** |
| **ADV-B3-02** | Invitations | Authentifié (Non Destinataire) | `/invitations/invite-888` | `update({ uid: 'attacker-uid' })` | DENIED | **ALLOWED (`updateAllowed=true`)** | **`FAIL`** |
| **ADV-B4-01** | Paie | `EMPLOYEE` | `/payroll_records/rec-001` | `set({ netSalary: 999999, status: 'APPROVED' })` | DENIED | **ALLOWED (`createAllowed=true`)** | **`FAIL`** |
| **ADV-B4-02** | Paie | `EMPLOYEE` (Tenant B) | `/payroll_records/rec-100` | `update({ businessId: 'tenant-b' })` | DENIED | **ALLOWED (`transferAllowed=true`)** | **`FAIL`** |
| **ADV-B4-03** | Paie | `MANAGER` | `/payroll_cycles/cycle-sealed` | `update({ totalAmount: 200000 })` | DENIED | PERMISSION_DENIED | `PASS` |
| **ADV-B5-01** | Workflows | Authentifié | `/approval_policies/policy-001` | `update({ requiredRole: 'EMPLOYEE', thresholdAmount: 0 })` | DENIED | **ALLOWED (`updateAllowed=true`)** | **`FAIL`** |
| **ADV-B5-02** | Workflows | Authentifié | `/workflow_definitions/wf-hack` | `set({ title: 'Override' })` | DENIED | **ALLOWED (`createAllowed=true`)** | **`FAIL`** |
| **ADV-B5-03** | Workflows | Authentifié | `/approval_instances/app-777` | `update({ status: 'APPROVED' })` | DENIED | **ALLOWED (`approveAllowed=true`)** | **`FAIL`** |
| **ADV-B6-01** | Super Admin | Email `tekpounou@gmail.com` | `/businesses/tenant-any/settings/features` | `set({ ai_cfo: true })` | ALLOWED (si super admin) | ALLOWED | `PASS` (Risque email spoof) |

---

## 3. ANALYSE DÉTAILLÉE ET PREUVES PAR DOMAINE (PHASES B & C)

### 3.1 Profils Utilisateurs (B1) — Auto-Promotion OWNER & Vol de Tenant
- **Règle Examinée :** `match /users/{userId}` (Lignes 222–250)
- **Code Fautif :**
  ```javascript
  allow create: if isAuthenticated() && (
    isSuperAdmin() ||
    (
      request.auth.uid == userId &&
      !('is_super_admin' in request.resource.data && request.resource.data.is_super_admin == true) &&
      !('isSuperAdmin' in request.resource.data && request.resource.data.isSuperAdmin == true) &&
      (!('role' in request.resource.data) || request.resource.data.role != 'SUPER_ADMIN')
    )
  );
  ```
- **Mécanisme de Faille :** La règle interdit uniquement d'attribuer `is_super_admin` ou `SUPER_ADMIN`. Elle **n'interdit pas** à l'utilisateur de définir `role: 'owner'` et n'importe quel `businessId` (`tenant-victim`).
- **Impact Cascading :** La fonction helper `isBusinessOwner(bizId)` (Lignes 57–65) consulte le document utilisateur via `getMyProfile()`. Dès qu'un attaquant inscrit `role: 'owner'` et `businessId: 'tenant-victim'` dans son propre profil `/users/attacker-uid`, `isBusinessOwner('tenant-victim')` renvoie `true` dans tout le système, lui octroyant les accès OWNER sur le tenant victime.
- **Preuve Runtime (`ADV-B1-01` & `ADV-B1-02`) :**
  - **État avant :** Profil inexistant ou simple employé dans `tenant-attacker`.
  - **Payload :** `{ role: "owner", businessId: "tenant-victim" }`
  - **Résultat :** Mutation acceptée avec succès par l'émulateur (`updateAllowed=true`).

---

### 3.2 Journaux d'Audit (B2) — Altération et Falsification des Logs
- **Règles Examinées :** `audit_logs`, `forensic_logs`, `enterprise_audit_logs`, `security_audit_logs`, `ai_cfo_audit_logs` (Lignes 185–213)
- **Code Fautif :**
  ```javascript
  allow create, update: if canCreateAuditLog(request.resource.data); 
  allow delete: if false;
  ```
  Où `canCreateAuditLog(data)` est simplement `return isAuthenticated();` (Ligne 180).
- **Mécanisme de Faille :** Bien que la suppression physique soit bloquée (`delete: if false`), la mise à jour (`update`) est autorisée sans aucune restriction à tout utilisateur connecté.
- **Impact :** Un utilisateur frauduleux peut modifier un log d'audit existant pour effacer les preuves d'une transaction suspecte, altérer les montants, modifier les horodatages ou attribuer l'action à un autre utilisateur.
- **Preuve Runtime (`ADV-B2-01` & `ADV-B2-02`) :**
  - **Document d'origine :** `{ action: "PAYROLL_EXECUTION", status: "SUCCESS", amount: 50000, userId: "victim-manager" }`
  - **Payload d'attaque :** `update({ status: "FAILED", amount: 0, userId: "innocent-user" })`
  - **Résultat :** Log modifié avec succès (`updateAllowed=true`).

---

### 3.3 Invitations (B3) — Usurpation et Acceptation Arbitraire
- **Règle Examinée :** `match /invitations/{inviteId}` (Lignes 482–496)
- **Code Fautif :**
  ```javascript
  allow update: if isAuthenticated() && (
    ...
    resource.data.get('email', '').lower() == getAuthEmail().lower() ||
    resource.data.get('normalizedEmail', '').lower() == getAuthEmail().lower() ||
    request.resource.data.get('uid', '') == request.auth.uid ||
    request.resource.data.get('status', '') == 'ACCEPTED' ||
    request.resource.data.get('status', '') == 'REJECTED'
  );
  ```
- **Mécanisme de Faille :** Les clauses de mise à jour utilisent un `||` permissif. Si le payload contient `status: 'ACCEPTED'` ou `uid: request.auth.uid`, la condition est immédiatement satisfaite, indépendamment de l'adresse email de l'invité ou de son tenant.
- **Impact :** Un attaquant peut intercepter et accepter n'importe quelle invitation en attente destinée à un dirigeant ou administrateur d'un autre tenant.
- **Preuve Runtime (`ADV-B3-01` & `ADV-B3-02`) :**
  - **Invitation d'origine :** Destinée à `victim@company.com` avec le rôle `ADMIN` sur `tenant-a`.
  - **Payload d'attaque :** `{ status: "ACCEPTED", uid: "attacker-uid" }` exécuté par `attacker@different.com`.
  - **Résultat :** Inscription validée par les règles (`updateAllowed=true`).

---

### 3.4 Paie et Transfert Inter-Tenants (B4) — Falsification Salariale
- **Règles Examinées :** `payroll_records`, `payrolls`, `payslips` (Lignes 854–875, 926–940)
- **Code Fautif :**
  ```javascript
  allow create, update: if isAuthenticated() && (
    isSuperAdmin() || 
    isTenantScoped(getBusinessId(request.resource.data)) ||
    (resource != null && isTenantScoped(getBusinessId(resource.data))) ||
    isTenantAdminOrManager(getBusinessId(request.resource.data))
  );
  ```
- **Mécanisme de Faille :**
  1. `isTenantScoped(...)` est vérifié, ce qui inclut n'importe quel membre/employé du tenant. Un simple membre peut donc créer ou modifier des fiches de paie (`payroll_records`).
  2. Aucun verrouillage sur la modification des champs `businessId` lors de la mise à jour, permettant de déplacer un enregistrement de paie d'un tenant A vers un tenant B.
- **Preuve Runtime (`ADV-B4-01` & `ADV-B4-02`) :**
  - **Création par un simple employé :** Succès (`createAllowed=true`).
  - **Transfert inter-tenants :** Mutation de `businessId: "tenant-a"` vers `tenant-b` validée par l'émulateur (`transferAllowed=true`).

---

### 3.5 Moteur de Workflow & Politiques d'Approbation (B5) — Prise de Contrôle Globale
- **Règles Examinées :** `workflow_definitions`, `approval_policies`, `approval_instances`, `active_approval_locks`, `workflow_instances` (Lignes 679–707)
- **Code Fautif :**
  ```javascript
  match /workflow_definitions/{id} { allow read: if isAuthenticated(); allow create, update: if isAuthenticated(); }
  match /approval_policies/{id} { allow read: if isAuthenticated(); allow create, update: if isAuthenticated(); }
  match /approval_instances/{id} { allow read: if isAuthenticated(); allow create, update: if isAuthenticated(); }
  ```
- **Mécanisme de Faille :** Absence totale de vérification de tenant et de rôle sur la création et la modification de ces collections critiques.
- **Impact :** Tout utilisateur connecté peut :
  - Modifier le seuil de validation des dépenses ou des transferts dans `approval_policies` (ex: abaisser le seuil à 0 $ et s'auto-désigner approbateur).
  - Modifier un document `approval_instances` pour faire passer un statut de `PENDING` à `APPROVED`.
- **Preuve Runtime (`ADV-B5-01`, `ADV-B5-02`, `ADV-B5-03`) :**
  - **Paiement/Approbation forcée :** Un utilisateur ordinaire modifie le statut d'une instance d'approbation vers `APPROVED` avec succès (`approveAllowed=true`).

---

### 3.6 SUPER_ADMIN & Emails Codés en Dur (B6)
- **Règle Examinée :** `isSuperAdmin()` (Lignes 14–26)
- **Problématique :** La fonction accorde les privilèges absolus si `request.auth.token.email.lower() in ['tekpounou@gmail.com', 'admin@finops.com', 'superadmin@finops.com']`.
- **Risque :** Si la vérification `email_verified == true` est omise (ce qui est le cas ici), une attaque d'usurpation d'adresse email sans vérification de token Firebase Auth pourrait octroyer le statut `SUPER_ADMIN`.

---

## 4. ANALYSE EXHAUSTIVE DES RÈGLES ET OVERLAPPING MATCHES (PHASE C)

1. **Règles Additives :** Dans Firestore, chaque bloc `match` est évalué indépendamment. Si au moins un bloc autorise l'accès, l'opération est permise.
2. **Wildcards Généralisés :**
   Le bloc sous-collection `match /businesses/{businessId}/{subcollection}/{document=**}` (Lignes 390–397) exclut `settings`, `features`, `subscriptions`, `entitlements`, mais laisse passer toutes les autres sous-collections pour tout utilisateur `isTenantAdminOrManager(businessId)`.
3. **Péril sur `request.resource.data` lors des suppressions :**
   Certaines règles d'effacement ou de modification faisaient référence à `request.resource.data`, qui est `null` lors des suppressions, entraînant des erreurs d'évaluation.

---

## 5. PLAN DE REMÉDIATION RECOMMANDÉ (MOD-GOV-8)

Afin d'éliminer définitivement ces 5 vulnérabilités sans casser les flux métier légitimes, les corrections minimales suivantes devront être apportées lors d'une phase de remédiation dédiée (ex: **MOD-GOV-8**) :

1. **Remédiation B1 (User Profiles) :**
   - Interdire la modification de `role`, `businessId`, `business_id`, `tenantId`, `tenant_id` par l'utilisateur lui-même dans `/users/{userId}`. Seul un `SUPER_ADMIN` ou une Cloud Function de backend de confiance peut affecter le rôle `OWNER` ou réaffecter un utilisateur à un `businessId`.

2. **Remédiation B2 (Audit Logs) :**
   - Supprimer `update` pour toutes les collections d'audit logs (`audit_logs`, `forensic_logs`, `security_audit_logs`, etc.). Seul `create` doit être autorisé pour l'enregistrement, sans possibilité de modification ultérieure (`allow update, delete: if false;`).

3. **Remédiation B3 (Invitations) :**
   - Verrouiller `allow update` sur `/invitations/{inviteId}` en exigeant que l'utilisateur soit le destinataire légitime de l'email (`getAuthEmail().lower() == resource.data.email.lower()`) et en lui interdisant de modifier le `role`, le `businessId` ou d'autres champs sensibles reçus dans l'invitation.

4. **Remédiation B4 (Paie) :**
   - Restreindre l'écriture des `payroll_records` et `payrolls` aux seuls administrateurs/gestionnaires de paie (`isTenantAdminOrManager(getBusinessId(request.resource.data))`).
   - Imposer l'immutabilité du champ `businessId` lors des mises à jour (`request.resource.data.businessId == resource.data.businessId`).

5. **Remédiation B5 (Workflows & Approbations) :**
   - Assujettir `workflow_definitions`, `approval_policies`, `approval_instances` et `workflow_instances` au contrôle multi-tenant (`isTenantAdminOrManager(...)` ou `isTenantScoped(...)`) et vérifier les droits d'approbation réels.

---

## 6. VERDICT FINAL ET ENGAGEMENT D'INTÉGRITÉ

**Verdict Global :** `FAIL — EXPLOITABLE RULE BYPASS CONFIRMED`

### Déclaration de Conformité Strict Read-Only :
- Aucun fichier de code source ou de règle de production n'a été altéré.
- Le fichier `firestore.rules` conserve exactement l'empreinte SHA-256 `1a21c23c6b007f19b8534f40e794db8b49592af6acf2b2f417c5c7a7f46697d6`.
- Aucun déploiement Firebase (`firebase deploy`) n'a été effectué.
- La base de données Firebase de production n'a subi aucune mutation.
- Toutes les preuves runtime proviennent exclusivement de l'émulateur local isolé `127.0.0.1:8088`.
