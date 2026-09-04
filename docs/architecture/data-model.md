# FINOPS ERP — Architecture du Modèle de Données & SSOT

**Version** : 3.0  
**Statut** : Document de Référence — Single Source of Truth (SSOT) & Foreign Key Catalog  
**Architecture** : Multi-Tenant, Domain-Driven Design (DDD), Double-Entry Accounting, Event-Driven Consistency (`FinopsEvent<T>`)  

---

## 1. VUE D'ENSEMBLE & PRINCIPE DE SOURCE UNIQUE DE VÉRITÉ (SSOT)

FINOPS ERP intègre l'ensemble des modules d'entreprise (Ressources Humaines, Présences, Paie, CRM / Ventes, Facturation, et Comptabilité Générale) dans un modèle de données cohérent, strictement cloisonné par organisation (`business_id`).

### Principes Directeurs
1. **Pas de duplication d'états calculables** : Les soldes de comptes clients, dettes fournisseurs, cumuls de paie et trésorerie ne sont jamais stockés dans des compteurs isolés susceptibles de désynchronisation. Ils sont **projetés directement à partir des collections sources et des écritures du Grand Livre (`ledger_transactions`)**.
2. **Immuabilité des écritures financières** : Toute écriture comptable validée (`POSTED`) est scellée par signature SHA-256. Les corrections s'opèrent exclusivement par contre-passation (reversal) équilibrée.
3. **Isolation Multi-Tenant Stricte** : Chaque document et événement est obligatoirement rattaché à un `business_id` valide (`business_id != 'global' && business_id != 'none'`).
4. **Cohérence Événementielle Typée (`FinopsEvent<T>`)** : Les mutations inter-modules (ex: Facture payée $\rightarrow$ Écriture bancaire $\rightarrow$ Invalidation de snapshot) transitent par l'`EventBus` et la file d'attente persistante (`event_outbox` / `MessageQueue`) avec garantie d'idempotence (`IdempotencyGuardian`).
5. **Validation Référentielle Pre-Write** : Toutes les écritures avec dépendances de clés étrangères sont validées par `ForeignKeyIntegrityValidator` avant commit dans Firestore pour empêcher la création d'enregistrements orphelins.

---

## 2. RECENSEMENT DES COLLECTIONS FIRESTORE & CLÉS ÉTRANGÈRES

### 2.1. Domaine Identité, Organisation & Tenancy

| Collection / Chemin | Clé Primaire | Clés Étrangères (FK) | Règle d'Intégrité / Comportement | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/businesses/{businessId}` | `businessId` | `owner_id` $\rightarrow$ `/users/{userId}` | RESTRICT (Suppression impossible si entités dépendantes) | Racine du locataire d'entreprise (Tenant Partition Key). |
| `/users/{userId}` | `userId` | `business_id` $\rightarrow$ `/businesses/{businessId}`, `employee_id` $\rightarrow$ `/employees/{empId}` | SET NULL sur `employee_id` si employé supprimé | Profil utilisateur, identifiant Auth, rôles RBAC. |
| `/memberships/{membershipId}` | `membershipId` | `user_id` $\rightarrow$ `/users/{userId}`, `business_id` $\rightarrow$ `/businesses/{businessId}` | CASCADE sur révocation | Association utilisateur-entreprise avec permissions. |
| `/organizations/{orgId}` | `orgId` | `business_id` $\rightarrow$ `/businesses/{businessId}` | RESTRICT | Entité légale ou holding. |
| `/branches/{branchId}` | `branchId` | `business_id` $\rightarrow$ `/businesses/{businessId}`, `org_id` $\rightarrow$ `/organizations/{orgId}` | RESTRICT (Vérification par `ForeignKeyIntegrityValidator`) | Succursale / Établissement physique. |
| `/departments/{deptId}` | `deptId` | `business_id` $\rightarrow$ `/businesses/{businessId}`, `branch_id` $\rightarrow$ `/branches/{branchId}` | RESTRICT (Empêche orphelins sans succursale) | Département opérationnel rattaché à une branche. |
| `/cost_centers/{costCenterId}`| `costCenterId`| `business_id` $\rightarrow$ `/businesses/{businessId}`, `department_id` $\rightarrow$ `/departments/{deptId}` | RESTRICT | Centre de coûts comptable / analytique. |

### 2.2. Domaine Ressources Humaines & Présences

| Collection / Chemin | Clé Primaire | Clés Étrangères (FK) | Règle d'Intégrité / Comportement | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/employees/{empId}` | `empId` | `business_id` $\rightarrow$ `/businesses`, `department_id` $\rightarrow$ `/departments`, `branch_id` $\rightarrow$ `/branches`, `user_id` $\rightarrow$ `/users` | RESTRICT (`ForeignKeyIntegrityValidator` bloque si dept/branch introuvable) | Dossier principal employé. |
| `/employee_contracts/{contractId}` | `contractId` | `business_id` $\rightarrow$ `/businesses`, `employee_id` $\rightarrow$ `/employees/{empId}` | CASCADE (Archivage lié à l'employé) | Contrat de travail, salaire de base, type (CDI, CDD). |
| `/attendance_records/{attId}` | `attId` | `business_id` $\rightarrow$ `/businesses`, `employee_id` $\rightarrow$ `/employees`, `branch_id` $\rightarrow$ `/branches` | RESTRICT (Pointage rejeté si employé inactif/introuvable) | Pointage d'entrée/sortie, heures travaillées, retards. |
| `/shifts/{shiftId}` | `shiftId` | `business_id` $\rightarrow$ `/businesses`, `branch_id` $\rightarrow$ `/branches`, `department_id` $\rightarrow$ `/departments` | RESTRICT | Plannings et horaires de travail. |
| `/leaves/{leaveId}` | `leaveId` | `business_id` $\rightarrow$ `/businesses`, `employee_id` $\rightarrow$ `/employees` | RESTRICT | Demandes et soldes de congés. |

### 2.3. Domaine Paie (Payroll Engine V3)

| Collection / Chemin | Clé Primaire | Clés Étrangères (FK) | Règle d'Intégrité / Comportement | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/payroll_cycles/{cycleId}` | `cycleId` | `business_id` $\rightarrow$ `/businesses/{businessId}` | RESTRICT (Pessimistic Cycle Lock actif en calcul) | Période de paie (Mois, Quinzaine), statut du cycle. |
| `/payroll_records/{recordId}` | `recordId` | `business_id` $\rightarrow$ `/businesses`, `cycle_id` $\rightarrow$ `/payroll_cycles`, `employee_id` $\rightarrow$ `/employees` | CASCADE sur cycle en brouillon, IMMUTABLE une fois approuvé | Fiche de calcul détaillée (Brut, ONA 6%, OFATMA 2%, Net). |
| `/salary_advances/{advanceId}`| `advanceId` | `business_id` $\rightarrow$ `/businesses`, `employee_id` $\rightarrow$ `/employees` | RESTRICT (Déductible en paie) | Avances sur salaire déductibles en paie. |

### 2.4. Domaine CRM & Facturation Commerciale

| Collection / Chemin | Clé Primaire | Clés Étrangères (FK) | Règle d'Intégrité / Comportement | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/businesses/{bizId}/leads/{leadId}` | `leadId` | `businessId` $\rightarrow$ `/businesses`, `assignedTo` $\rightarrow$ `/employees` | SET NULL sur `assignedTo` | Prospect commercial, scoring et statut (`LEAD`, `PROSPECT`, `CLIENT`). |
| `/businesses/{bizId}/proformas/{proformaId}` | `proformaId` | `businessId` $\rightarrow$ `/businesses`, `leadId` $\rightarrow$ `/leads` | RESTRICT | Devis proforma avec lignes dynamiques, taxes et validité. |
| `/businesses/{bizId}/invoices/{invoiceId}` | `invoiceId` | `businessId` $\rightarrow$ `/businesses`, `proformaId` $\rightarrow$ `/proformas`, `leadId` $\rightarrow$ `/leads`, `accountingTransactionId` $\rightarrow$ `/ledger_transactions` | RESTRICT (Lié à l'écriture Grand Livre) | Facture commerciale, statut d'encaissement et liens comptables. |

### 2.5. Domaine Comptabilité Générale & Grand Livre

| Collection / Chemin | Clé Primaire | Clés Étrangères (FK) | Règle d'Intégrité / Comportement | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/ledger_transactions/{txId}` | `txId` | `business_id` $\rightarrow$ `/businesses`, `branch_id` $\rightarrow$ `/branches`, `department_id` $\rightarrow$ `/departments`, `referenceTransactionId` $\rightarrow$ `/ledger_transactions` | IMMUTABLE (Scellement SHA-256, contre-passation obligatoire) | Écriture en partie double ($Débit = Crédit$). |
| `/financial_snapshots/{id}` | `id` | `business_id` $\rightarrow$ `/businesses` | TTL 30 jours (DAILY), Permanent (MONTHLY/FISCAL_YEAR) | Snapshot de performance précalculé. |
| `/bank_reconciliations/{id}` | `id` | `business_id` $\rightarrow$ `/businesses`, `statementId` $\rightarrow$ relevé bancaire | RESTRICT | Rapprochement bancaire relevé vs écritures. |

### 2.6. Domaine Événements & Audit

| Collection / Chemin | Clé Primaire | Clés Étrangères (FK) | Règle d'Intégrité / Comportement | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/businesses/{bizId}/event_outbox/{id}` | `id` | `business_id` $\rightarrow$ `/businesses`, `correlationId` $\rightarrow$ trace | PROCESSED / Auto-purge | File d'attente transactionnelle d'événements `FinopsEvent<T>`. |
| `/audit_logs/{logId}` | `logId` | `business_id` $\rightarrow$ `/businesses`, `userId` $\rightarrow$ `/users` | IMMUTABLE (Append-Only) | Journal forensique horodaté SHA-256. |

---

## 3. DIAGRAMME ENTITÉ-RELATION (ER DIAGRAM)

```text
 +-----------------------------------------------------------------------+
 |                             businesses                                |
 |                         (Tenant Partition)                            |
 +-----------------------------------------------------------------------+
     │ 1:N          │ 1:N                          │ 1:N          │ 1:N
     │              │                              │              │
     ▼              ▼                              ▼              ▼
+----------+  +-------------+               +--------------+ +-----------+
|  users   |  |organizations|               |payroll_cycles| |   leads   |
+----------+  +-------------+               +--------------+ +-----------+
     │ 1:N          │ 1:N                          │ 1:N          │ 1:N
     │              v                              │              v
     │        +-------------+                      │        +-----------+
     │        |  branches   |                      │        | proformas |
     │        +-------------+                      │        +-----------+
     │              │ 1:N                          │              │ 1:1
     │              v                              │              v
     │        +-------------+                      │        +-----------+
     │        | departments |                      │        | invoices  |
     │        +-------------+                      │        +-----------+
     │              │ 1:N                          │              │ 1:1 (Post)
     │              v                              │              v
     │        +-------------+                      │        +--------------------+
     └───────>|  employees  |                      │        |ledger_transactions |<--[SSOT]
              +-------------+                      │        |  (General Ledger)  |
               │ 1:1    │ 1:N                      │        +--------------------+
               │        v                          │                 ^
               │  +------------------+             │                 │ (Approval Post)
               │  |attendance_records|             │                 │
               │  +------------------+             │                 │
               │        │ (Clock In/Out)           │                 │
               │        v                          │                 │
               │  +--------------------------------+                 │
               │  │                                                  │
               v  v                                                  │
          +------------------+                                       │
          | payroll_records  |---------------------------------------+
          | (Payslip Engine) |
          +------------------+
```

---

## 4. MATRICE D'ÉVALUATION SSOT & RÈGLES DE NON-DUPLICATION

| Donnée Métier | Emplacement Erroné (Anti-Pattern Banni) | Source Unique de Vérité (SSOT) | Mécanisme de Calcul / Projection |
| :--- | :--- | :--- | :--- |
| **Solde Client (Accounts Receivable)** | Champ statique `client.balance` dans CRM | Compte `1200_ACCOUNTS_RECEIVABLE` du Grand Livre (`ledger_transactions`) | $\sum \text{Débits (Factures émises)} - \sum \text{Crédits (Règlements reçus)}$ |
| **Total Facture TTC & Taxes** | Total saisi manuellement en dur | Projection des lignes d'articles `items[]` (`DataCleanupAndSSOTService`) | $\sum (\text{Qty} \times \text{Prix} \times (1 - \text{Remise})) + \text{Taxes}$ |
| **Heures Travaillées & Présence Paie** | Saisie manuelle directe dans la fiche de paie | Collection `/attendance_records` approuvée | Agrégation des heures effectives et calcul des heures supplémentaires |
| **Cotisations Sociales ONA / OFATMA** | Saisie arbitraire en comptabilité | `PayrollCalculationEngine` / `payroll_records` | 6% ONA Employé + 6% ONA Patronal, 2% OFATMA |
| **Totaux d'un Cycle de Paie** | Champs statiques dupliqués dans `payroll_cycles` | Agrégation dynamique de `payroll_records` du cycle | $\sum \text{Gross}$, $\sum \text{Net}$, $\sum \text{ONA}$, $\sum \text{OFATMA}$ |
| **Trésorerie Disponible (Cash & Bank)** | Compteur isolé dans le Dashboard | Comptes `1000_CASH` et `1010_BANK` du Grand Livre | Solde net débiteur des comptes de classe 1 |

---

## 5. CATALOGUE DES CLÉS ÉTRANGÈRES & CONTRAINTES RÉFÉRENTIELLES

Toutes les relations inter-collections sont surveillées par le validateur `ForeignKeyIntegrityValidator` :

```typescript
// Exemple de validation pre-write
await IntegrityValidator.validateEntityForeignKeys(businessId, {
  branchId: "br_main_01",
  departmentId: "dept_sales",
  employeeId: "emp_101"
}, "ATTENDANCE");
```

### Table des Relations et Contraintes

1. **`departments.branch_id` $\rightarrow$ `branches.id`**
   - **Contrainte** : La succursale parente doit exister et appartenir au même `business_id`.
   - **Violation** : Erreur `ForeignKeyIntegrityViolationError("branch_id")`.
2. **`employees.department_id` $\rightarrow$ `departments.id`**
   - **Contrainte** : Le département doit exister et appartenir au même locataire.
   - **Violation** : Rejet de la création/mise à jour de l'employé.
3. **`employees.branch_id` $\rightarrow$ `branches.id`**
   - **Contrainte** : La succursale doit exister et appartenir au même locataire.
4. **`attendance_records.employee_id` $\rightarrow$ `employees.id`**
   - **Contrainte** : L'employé doit être actif (`status: ACTIVE` ou `isActive: true`) et rattaché au locataire.
5. **`ledger_transactions.department_id` $\rightarrow$ `departments.id`**
   - **Contrainte** : Toute transaction comptable doit être rattachée à un département valide (ou assignée au département par défaut lors du moteur d'auto-remédiation).
6. **`invoices.accountingTransactionId` $\rightarrow$ `ledger_transactions.id`**
   - **Contrainte** : Écriture comptable bilatérale $Débit = Crédit$ générée lors du post de la facture.

---

## 6. TYPAGE DES ÉVÉNEMENTS EVENTBUS (`FinopsEvent<T>`)

Tous les événements publiés sur l'`EventBus` ou stockés dans `event_outbox` respectent l'interface standardisée `FinopsEvent<T>` définie dans `src/types/events.ts` :

```typescript
export interface FinopsEvent<T = any> {
  type: string;              // Type discriminé (ex: "INVOICE_POSTED", "PAYROLL_APPROVED")
  businessId: string;        // Partition locataire obligatoire (businessId != 'global')
  payload: T;                // Payload typé spécifique au domaine
  timestamp: string;         // Horodatage ISO-8601 UTC
  correlationId: string;     // Identifiant unique de corrélation distribuée
  eventId?: string;          // Identifiant unique de l'événement
  causationId?: string;      // ID de l'événement parent dans la chaîne
  actorId?: string;          // UID de l'utilisateur ou 'system'
  module?: string;           // Module ("CRM", "ACCOUNTING", "WORKFORCE", "PAYROLL")
  aggregate?: string;        // Agrégat racine
  eventType?: string;        // Nom normalisé
  status?: "PENDING" | "PROCESSED" | "FAILED";
  metadata?: Record<string, any>;
}
```

---

## 7. AUTOMATISATION DES TESTS D'INTÉGRITÉ (VITEST)

Les tests automatisés garantissent en continu :
1. **Cohérence des Totaux Inter-Collections** : `src/tests/integration/AutomatedIntegrityAndEventBusPhase3.test.ts`
2. **Absence d'Orphelins & Respect des Clés Étrangères** : `src/tests/integration/NamingAndIntegrityPhase2.test.ts`
3. **Double-Partie & Isolation Multi-Tenant** : `src/tests/integration/CrossTenantAndSSOTPhase1.test.ts`
4. **Intégration Bout-en-Bout (CRM $\leftrightarrow$ Grand Livre)** : `src/tests/integration/modules.integration.test.ts`
5. **Règles Firestore & Schémas Zod** : `src/tests/integration/FirestoreRulesIntegrity.test.ts`

---

## 8. CONVENTIONS DE NOMMAGE & COHÉRENCE BI-DIRECTIONNELLE

FINOPS ERP applique une séparation nette entre le modèle applicatif TypeScript et le schéma de stockage Firestore :

### 8.1. Règle Fondamentale
- **Code TypeScript / Domaine Applicatif** : `camelCase` strict (ex: `businessId`, `branchId`, `departmentId`, `baseSalary`, `totalAmount`, `createdAt`).
- **Stockage Firestore (Collections et Documents)** : `snake_case` canonique (ex: `business_id`, `branch_id`, `department_id`, `created_at`).
- **Passerelle Automatisée** : Les fonctions `toCamelCase()` et `toSnakeCase()` du module `src/utils/caseConverter.ts` ainsi que les repositories assurent la traduction transparente et bidirectionnelle sans perte de données.

### 8.2. Validation à l'Écriture (Schémas Zod)
Le module `src/validations/integritySchemas.ts` fournit les validateurs stricts appliqués avant tout `setDoc` ou `updateDoc` :
- `BusinessIntegritySchema`
- `BranchIntegritySchema`
- `DepartmentIntegritySchema`
- `CostCenterIntegritySchema`
- `EmployeeIntegritySchema`
- `AttendanceRecordIntegritySchema`
- `LeaveIntegritySchema`
- `ShiftIntegritySchema`
- `PayrollCycleIntegritySchema`
- `PayrollRecordIntegritySchema`
- `LeadIntegritySchema`
- `ProformaIntegritySchema`
- `InvoiceIntegritySchema`
- `LedgerTransactionIntegritySchema`

---

## 9. MATRICE DES CHAMPS OBSOLÈTES & RÈGLES DE DÉPRÉCIATION

Les champs ci-dessous ont été purgés lors des phases de migration et sont formellement interdits à l'écriture (rejetés par Zod et bloqués par `firestore.rules`) :

| Entité / Collection | Champ Obsolète / Dupliqué | Statut | Remplacement Canonique / SSOT |
| :--- | :--- | :--- | :--- |
| `/employees` | `salaryBaseHtg`, `salary_base_htg` | **REJETÉ** | `baseSalary` (number) |
| `/employees` | `employee_name` | **REJETÉ** | `name` (string) |
| `/employees` | `firebase_uid` | **REJETÉ** | `uid` (string) |
| `/employees` | `branch_id`, `department_id` | **MIGRÉ** | `branchId`, `departmentId` dans l'application, converti en `snake_case` au stockage |
| `/invoices` | `totalGrossHtg` | **REJETÉ** | `totalAmount` (calculé à partir des `items[]`) |
| `/invoices` | `amountPaid`, `isPaid` | **REJETÉ** | Solde dynamique calculé via écritures de règlement du Grand Livre |
| `/payroll_cycles` | `totalGrossHtg`, `totalNetHtg` | **REJETÉ** | Agrégation dynamique des `payroll_records` du cycle |
| `/proformas` | `isConverted` | **REJETÉ** | `status: "CONVERTED_TO_INVOICE"` et `convertedToInvoiceId` |
| `/leads` | `display_name` | **REJETÉ** | `companyName` et `contactName` |

---

## 10. SYNTHÈSE DU PLAN DE REMÉDIATION (PHASES 1 À 4)

1. **Phase 1 (Audit en Lecture Seule)** : Détection automatisée des doublons de champs, incohérences de nommage, orphelins de clés étrangères et violations SSOT sur l'ensemble des collections Firestore (`scripts/migrations/audit_firestore_schema.ts`).
2. **Phase 2 (Nettoyage sur Tenant Pilote)** : Conception et validation du script de nettoyage atomique par lots (`clean_duplicate_fields.ts`), réparation des clés étrangères orphelines vers les succursales/départements par défaut, suppression des champs obsolètes.
3. **Phase 3 (Déploiement Multi-Tenant Global)** : Exécution de masse progressive par lots de 400 documents sur tous les tenants actifs en production, avec gestion de reprise, checkpoints, temporisation (`--delay`) et génération de rapports détaillés.
4. **Phase 4 (Prévention & Durcissement Continu)** :
   - Intégration de schémas Zod à l'écriture (`src/validations/integritySchemas.ts`) et classes d'exception dédiées (`FinopsException`).
   - Renforcement des règles de sécurité Firestore (`firestore.rules`) avec blocage des champs dépréciés (`hasNoObsolete...`).
   - Configuration du linter ESLint (`.eslintrc.cjs`) pour le respect strict des conventions `camelCase` et des types.
   - Suite de tests d'intégrité automatisés (`src/tests/integration/FirestoreRulesIntegrity.test.ts`).

