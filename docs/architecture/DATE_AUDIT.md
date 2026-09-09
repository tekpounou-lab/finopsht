# FINOPS ERP – AUDIT EXHAUSTIF ET NORMALISATION UNIFIÉE DES DATES (SSOT TEMPOREL)

**Version:** 4.0  
**Statut:** Validé & Stratégique  
**Domaine:** FINOPS ERP / FINAYITI Fusion  
**Format Canonique:** `YYYY-MM-DD` (Chaîne ISO calendaire, sans heure, sans fuseau horaire)

---

## 1. Vision et Objectifs Stratégiques

L'incohérence observée précédemment entre le Mode Simplifié, le Mode Expert (Performance Intelligence Center), les Livres d'Émargement des Émoluments et les modules de paie provenait d'une fragmentation des formats de date :
- **Firestore Timestamps** (`{ seconds, nanoseconds }`) ou ISO 8601 complexes (`2026-07-15T14:30:00Z`).
- **Dates CSV/Excel** aux formats américains (`MM/DD/YYYY`) ou européens (`DD/MM/YYYY`).
- **Saisies manuelles navigateur** (`15/07/2026`, `15-07-2026`).

**Règle d'or SSOT** :
Tous les champs de date métier servant à la sélection, au filtrage temporel (`startDate`/`endDate`), aux calculs de proratisation ou aux agrégations financières sont strictement normalisés au format canonique **`YYYY-MM-DD`** via `src/utils/dateNormalization.ts` (`toDateOnly`).

Les horodatages système de traçabilité et d'audit (`createdAt`, `updatedAt`, `sealedAt`, `timestamp`) restent conservés en `Timestamp` / ISO UTC pour préserver l'intégrité de l'historique et des règles Firestore.

---

## 2. Recensement Exhaustif des Collections Firestore & Champs de Date

| Collection | Champ Firestore | Type Source | Type Canonique Cible | Filtre Période ? | Rôle Métier |
|------------|-----------------|-------------|----------------------|------------------|-------------|
| `ledger_transactions` | `date` | String / Timestamp | `YYYY-MM-DD` | **Oui** | Date comptable de transaction (Double entrée) |
| `ledger_transactions` | `effectiveDate` | String / Timestamp | `YYYY-MM-DD` | **Oui** | Date d'effet / valeur bancaire |
| `ledger_transactions` | `createdAt` / `updatedAt` | Timestamp | Timestamp / ISO | Non | Traçabilité technique |
| `payroll_records` | `periodStartDate` | String / Timestamp | `YYYY-MM-DD` | **Oui** | Début de quinzaine / mois de paie |
| `payroll_records` | `periodEndDate` | String / Timestamp | `YYYY-MM-DD` | **Oui** | Fin de quinzaine / mois de paie |
| `payroll_records` | `effectiveDate` | String / Timestamp | `YYYY-MM-DD` | **Oui** | Date de règlement de la fiche de paie |
| `payroll_records` | `createdAt` / `updatedAt` | Timestamp | Timestamp / ISO | Non | Horodatage du calcul de paie |
| `payroll_cycles` | `startDate` | String / Timestamp | `YYYY-MM-DD` | **Oui** | Bornage d'ouverture de cycle de paie |
| `payroll_cycles` | `endDate` | String / Timestamp | `YYYY-MM-DD` | **Oui** | Bornage de clôture de cycle de paie |
| `payroll_cycles` | `sealedAt` | Timestamp / ISO | Timestamp / ISO | Non | Verrouillage du cycle |
| `attendance_records` | `date` | String | `YYYY-MM-DD` | **Oui** | Jour de présence calendaire |
| `attendance_records` | `checkIn` / `checkOut` | String (HH:mm) / Timestamp | HH:mm / Timestamp | Non | Marqueurs horaires de pointage |
| `leaves` | `startDate` | String / Timestamp | `YYYY-MM-DD` | **Oui** | Début de congé accordé |
| `leaves` | `endDate` | String / Timestamp | `YYYY-MM-DD` | **Oui** | Fin de congé accordé |
| `invoices` / `proformas` | `issueDate` | String | `YYYY-MM-DD` | **Oui** | Date d'émission de facture |
| `invoices` / `proformas` | `dueDate` | String | `YYYY-MM-DD` | **Oui** | Date d'échéance de paiement |
| `employees` | `hireDate` | String | `YYYY-MM-DD` | Rarement | Date d'embauche de l'employé |
| `employees` | `terminationDate` | String | `YYYY-MM-DD` | Rarement | Date de sortie effectif |
| `employees` | `birthDate` | String | `YYYY-MM-DD` | Non | Date de naissance |
| `exchange_rates` | `effectiveDate` | String | `YYYY-MM-DD` | **Oui** | Date d'application du taux de change |
| `analytics_snapshots` | `periodKey` | String | `YYYY-MM` / `YYYY-MM-DD` | **Oui** | Clé d'agrégation d'instantané exécutif |

---

## 3. Cartographie des Composants UI, Hooks & Sélecteurs

1. **Contextes de Filtrage**:
   - `ExecutiveFilterContext.tsx`: Initialise `startDate` et `endDate` avec `toDateOnly()`.
   - `FilterContext.tsx`: Normalise dynamiquement toute plage sélectionnée via `setDateRange`.
   - `AnalyticsContext.tsx`: Délègue à `toDateOnly()` pour synchroniser l'instantané exécutif.

2. **Moteurs Métiers et Repositories**:
   - `LedgerFilterEngine.ts`: Filtre les transactions du Grand Livre par comparaison `YYYY-MM-DD`.
   - `AnalyticsEngine.ts`: Calcule les agrégats financiers et proratas de paie sur des bornes normalisées.
   - `attendanceSSOT.ts`: Agrège les heures travaillées à partir des dates normalisées.
   - `LedgerRepository.ts` & `PayrollRepository.ts`: Normalisent les paramètres de requêtes d'historique.

---

## 4. Moteur Unique de Normalisation (`src/utils/dateNormalization.ts`)

Fonctions exportées par le module SSOT :

- **`toDateOnly(input, fallbackDate?)`**: Convertit universellement tout format (`Timestamp`, ISO, US `MM/DD/YYYY`, EU `DD/MM/YYYY`, JS `Date`, nombre) en `YYYY-MM-DD`.
- **`safeToDateOnly(input, fallback?)`**: Variante sécurisée retournant `null` ou le `fallback` en cas d'impossibilité de conversion sans lever d'exception.
- **`isDateInRange(date, startDate, endDate)`**: Vérifie si une date normalisée appartient à l'intervalle [start, end].
- **`areDatesEqual(d1, d2)`**: Compare deux dates en garantissant l'équivalence après passage par `toDateOnly`.
- **`normalizeDateFilter(start, end)`**: Normalise les bornes d'un filtre.
- **`normalizeCsvDate(rawDateStr, fallbackDate?, preferDayFirst?)`**: Parser tolérant pour les données importées via CSV/Excel.
- **`normalizeDatesInObject(obj, options?)`**: Normalise récursivement tous les champs d'un objet ou tableau d'objets (hors `createdAt`/`updatedAt`).

---

## 5. Script de Migration Unifiée (`src/scripts/migrateDateFields.ts`)

Un script utilitaire idempotant a été mis en place pour balayer les documents des collections principales (`ledger_transactions`, `payroll_records`, `attendance_records`, `invoices`) et réparer les champs de date non conformes.

---

## 6. Conformité et Directives de Non-Régression

1. **Interdiction strictes** :
   - Pas de comparaison directe de dates sous forme de chaînes brutes non normalisées.
   - Pas d'utilisation de `.toLocaleDateString()` pour la logique de filtrage ou le stockage.
   - Pas de stockage de formats locaux (`15/07/2026`) dans Firestore.
2. **Acceptation** :
   - 100% des tests unitaires et d'intégration validés (`DateNormalization.integration.test.ts`).
   - Compilation et linter validés sans erreur.
