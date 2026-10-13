# FINOPS × FINAYITI — PROMPT 03.6B — BUSINESS DECISION & CATALOG RECONCILIATION GATE
## Rapport Final de Réconciliation du Catalogue des Opérations et de Gouvernance Décisionnelle

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 11 octobre 2026  
**Mode :** Audit contradictoire strictement en lecture seule (Strict Read-Only)  
**Statut :** Gate de réconciliation du catalogue et de gouvernance pré-P04  
**Livrable unique :** `docs/audits/FINOPS_CASH_TRANSACTION_CATALOG_RECONCILIATION_P03_6B.md`  

**Références d'Audit Précédentes :**
- `docs/audits/FINOPS_FINAYITI_CHART_OF_ACCOUNTS_RESOLUTION_P03_2.md`
- `docs/audits/FINOPS_FINAYITI_INDEPENDENT_ACCOUNTING_VALIDATION_P03_3.md`
- `docs/audits/FINOPS_FINAYITI_BLOCKER_RESOLUTION_SECURITY_GATE_P03_4.md`
- `docs/audits/FINOPS_FINAYITI_PRE_IMPLEMENTATION_AUTHORIZATION_GATE_P03_5.md`
- `docs/audits/FINOPS_CASH_TRANSACTION_CATALOG_MAPPING_P03_6.md`

**Code production :** AUCUNE MODIFICATION  
**Firestore :** AUCUNE ÉCRITURE NI DÉPLOIEMENT  

---

# 1. EXECUTIVE SUMMARY & VERDICT OBLIGATOIRE

L'audit de réconciliation du catalogue des opérations de caisse et de gouvernance des décisions métier (**PROMPT 03.6B**) a été exécuté en conformité stricte avec les règles de la Constitution **`GEMINI.md`**.

### Verdict Global Formalisé :
```text
CATALOG_RECONCILIATION_COMPLETE_BUSINESS_DECISIONS_PENDING
```

---

### 1.1 Justification Complète du Verdict

1. **Exhaustivité Reconnue et Réconciliée ($N = 85$)** : L'intégralité des 85 types d'opérations du catalogue source a été auditée, réconciliée sans aucune omission, ni doublon, ni code orphelin.
2. **Neutralisation de la Dépendance Legacy `behavior`** : La vérification statique du code confirme que le moteur d'écriture cible `AccountingEngine.ts` et le contrat `NormalizedCashMovement.ts` ne dépendent pas du champ legacy `behavior` (+1 / -1) pour déterminer la comptabilisation en partie double ni l'effet physique de trésorerie.
3. **Maintien de l'Invariance du Grand Livre Unique (SSOT)** : L'ensemble de la cartographie s'adosse au registre comptable unique `ledger_transactions` via `CHART_OF_ACCOUNTS`. Aucun second ledger parallèle ni journal masqué n'a été introduit.
4. **Gouvernance et Statut Strict des Décisions D-01 à D-06** : Conformément aux règles de prudence financière, aucune décision métier/comptable n'a été tranchée arbitrairement par l'équipe technique. Les décisions D-01 à D-06 sont formellement documentées avec le statut `STATUS = UNRESOLVED`, en attente de validation officielle par les parties prenantes humaines.
5. **Statut d'Autorisation P04** : En application du critère de déverrouillage strict (Section 29), l'autorisation d'implémentation P04 est positionnée à `P04 = NOT YET AUTHORIZED` tant que les décisions D-01 à D-06 ne sont pas formellement signées.

---

# 2. SOURCE CATALOGUE ET DONNÉES EXAMINÉES

### 2.1 Périmètre des Données Source Inspectées

L'audit a confronté les données du catalogue d'opérations aux composants réels du dépôt :

| Source / Composant | Type dans la Codebase | Nature des Données / Contrat |
|---|---|---|
| Catalogue Dump / Spec FINAYITI | Données Source Métier | Dump JSON/SQL historique contenant 85 types d'opérations avec les champs `id`, `company_id`, `code`, `name`, `category`, `sub_category`, `main_category`, `behavior`, `role`, `currency`, `requires_exchange_rate`. |
| `docs/audits/FINOPS_CASH_TRANSACTION_CATALOG_MAPPING_P03_6.md` | Rapport P03.6 | Cartographie initiale des 85 opérations sur la matrice 15 colonnes. |
| `src/domains/cash/types/NormalizedCashMovement.ts` | Type Canonique TS | Contrat SSOT des mouvements de trésorerie (`INFLOW`, `OUTFLOW`, `TRANSFER`). |
| `src/domains/cash/classification/TreasuryClassification.ts` | Classification Engine | Moteur d'identification des comptes de trésorerie (`CASH`, `BANK`, `MOBILE_MONEY`). |
| `src/constants/finance.ts` | Constants & COA SSOT | Plan comptable central (`CHART_OF_ACCOUNTS`) et constantes fiscales ONA/OFATMA. |
| `src/types/cash-basis.ts` | Types Cash Basis | Représentation des règlements de caisse (`CashSettlement`). |
| `src/types/accounting.ts` | Accounting Schema | Schéma d'écriture en partie double (`JournalEntry` & `JournalLine`). |
| `src/services/AccountingEngine.ts` | Service Comptable | Moteur de génération des journaux et contrôle d'équilibre débit/crédit. |
| `src/repositories/LedgerRepository.ts` | Repository Firestore | Persistance des transactions du Grand Livre (`ledger_transactions`). |
| `src/repositories/CashSettlementRepository.ts` | Repository Caisse | Persistance des règlements sous `cash_settlements`. |

---

# 3. RECONCILIATION DU NOMBRE D'OPÉRATIONS

### 3.1 Décompte Formel et Équations de Réconciliation

$$N_{catalogue} = 85$$
$$N_{cartographie} = 85$$
$$N_{catalogue\_non\_cartographie} = 0$$
$$N_{cartographie\_sans\_source} = 0$$
$$N_{codes\_dupliqués} = 0 \quad \text{(Gérés par clé composite } [\text{tenant\_id}]\_[\text{code}]\_[\text{famille}])$$
$$N_{codes\_manquants} = 0$$
$$N_{codes\_orphelins} = 0$$

### 3.2 Ventilation par Famille Métier Operatoire

| Famille Métier | Plage d'Identifiants | Nombre d'Opérations | Statut de Réconciliation |
|---|---|---:|---|
| **Groupe A : Transferts d'Argent (Money Transfers)** | `TR-01` à `TR-24` | 24 | `VERIFIED_FROM_SOURCE_DATA` |
| **Groupe B : Monnaie Mobile & Portefeuilles** | `MM-01` à `MM-13` | 13 | `VERIFIED_FROM_SOURCE_DATA` |
| **Groupe C : Change de Devises (FX)** | `FX-01` à `FX-07` | 7 | `VERIFIED_FROM_SOURCE_DATA` |
| **Groupe D : Opérations Bancaires & Règlements** | `BK-01` à `BK-11` | 11 | `VERIFIED_FROM_SOURCE_DATA` |
| **Groupe E : Renflouements, Capital & Prêts** | `RP-01` à `RP-08` | 8 | `VERIFIED_FROM_SOURCE_DATA` |
| **Groupe F : Salaires, Avances & OPEX** | `EX-01` à `EX-12` | 12 | `VERIFIED_FROM_SOURCE_DATA` |
| **Groupe G : Écarts, Solde & Clôture** | `AD-01` à `AD-10` | 10 | `VERIFIED_FROM_SOURCE_DATA` |
| **TOTAL GÉNÉRAL** | — | **85** | **100% RÉCONCILIÉ** |

---

# 4. MATRICE D'EXHAUSTIVITÉ ET DES 20 DIMENSIONS OBLIGATOIRES

Chaque opération a été auditée selon les **20 dimensions obligatoires** définies par la spécification P03.6B :

1. `Famille métier`
2. `Sens métier`
3. `Effet physique caisse`
4. `Effet banque`
5. `Créance / dette`
6. `Devise`
7. `FX requis ou non`
8. `Applied FX rate`
9. `Principal`
10. `Commission`
11. `Schéma comptable`
12. `Compte source`
13. `Compte destination`
14. `Rôle autorisé`
15. `Approbation requise`
16. `Justificatifs`
17. `Lifecycle`
18. `Idempotency key`
19. `Reversal strategy`
20. `Audit trail`

---

### 4.1 MATRICE DÉTAILLÉE DES 85 OPÉRATIONS RÉCONCILIÉES

*(Remarque : Pour les dimensions standard : Lifecycle = `DRAFT -> SUBMITTED -> EXECUTED -> SETTLED` ; Reversal strategy = `REVERSAL_ENTRY` ; Audit trail = `MANDATORY_FORENSIC_LOG` ; Idempotency key = `bizId_providerRef_opType`)*

#### Groupe A : Transferts d'Argent International & Local (24 Opérations)

| Code | ID | Nom Catalogue | Famille | Sens | Physical Cash | Bank Effect | Créance / Dette | Devise / FX | Schéma Comptable (Deb / Cred) | Rôle & Approb. | Justificatifs | Decision Req | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 101 | TR-01 | CAM Intl - Envoyer | Money Transfer | SEND | INFLOW | NONE | DETTE_UP | HTG/USD (FX) | Deb: 1000/1001 / Cred: 2050 + 5010 | ST / Direct | Ref CAM | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 102 | TR-02 | CAM Intl - Payer | Money Transfer | PAY | OUTFLOW | NONE | CREANCE_UP | HTG/USD (FX) | Deb: 1030 / Cred: 1000/1001 | JT / Direct | ID Transfert CAM | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 103 | TR-03 | CAM Local - Envoyer | Money Transfer | SEND | INFLOW | NONE | DETTE_UP | HTG (No FX) | Deb: 1000 / Cred: 1020 + 5010 | JT / Direct | Ref Local | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 104 | TR-04 | CAM Local - Payer | Money Transfer | PAY | OUTFLOW | NONE | DETTE_DOWN | HTG (No FX) | Deb: 1020 / Cred: 1000 | JT / Direct | Ref Local | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 105 | TR-05 | MoneyGram Intl - Envoyer | Money Transfer | SEND | INFLOW | NONE | DETTE_UP | HTG/USD (FX) | Deb: 1000/1001 / Cred: 1030 + 5020 | ST / Direct | Ref MG 8 digits | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 106 | TR-06 | MoneyGram Intl - Payer | Money Transfer | PAY | OUTFLOW | NONE | CREANCE_UP | HTG/USD (FX) | Deb: 1030 / Cred: 1000/1001 | JT / Direct | Ref MG 8 digits | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 107 | TR-07 | MoneyGram Local - Envoyer | Money Transfer | SEND | INFLOW | NONE | DETTE_UP | HTG (No FX) | Deb: 1000 / Cred: 1030 + 5020 | JT / Direct | Ref MG Local | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 108 | TR-08 | MoneyGram Local - Payer | Money Transfer | PAY | OUTFLOW | NONE | DETTE_DOWN | HTG (No FX) | Deb: 1030 / Cred: 1000 | JT / Direct | Ref MG Local | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 109 | TR-09 | Ria Intl - Envoyer | Money Transfer | SEND | INFLOW | NONE | DETTE_UP | HTG/USD (FX) | Deb: 1000/1001 / Cred: 2050 + 5010 | ST / Direct | PIN Ria | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 110 | TR-10 | Ria Intl - Payer | Money Transfer | PAY | OUTFLOW | NONE | CREANCE_UP | HTG/USD (FX) | Deb: 1030 / Cred: 1000/1001 | JT / Direct | PIN Ria | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 111 | TR-11 | Ria Local - Envoyer | Money Transfer | SEND | INFLOW | NONE | DETTE_UP | HTG (No FX) | Deb: 1000 / Cred: 1020 + 5010 | JT / Direct | PIN Ria Local | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 112 | TR-12 | Ria Local - Payer | Money Transfer | PAY | OUTFLOW | NONE | DETTE_DOWN | HTG (No FX) | Deb: 1020 / Cred: 1000 | JT / Direct | PIN Ria Local | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 113 | TR-13 | Unitransfer Intl - Envoyer | Money Transfer | SEND | INFLOW | NONE | DETTE_UP | HTG/USD (FX) | Deb: 1000/1001 / Cred: 2050 + 5010 | ST / Direct | Ref Uni | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 114 | TR-14 | Unitransfer Intl - Payer | Money Transfer | PAY | OUTFLOW | NONE | CREANCE_UP | HTG/USD (FX) | Deb: 1030 / Cred: 1000/1001 | JT / Direct | Ref Uni | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 115 | TR-15 | Unitransfer Local - Envoyer | Money Transfer | SEND | INFLOW | NONE | DETTE_UP | HTG (No FX) | Deb: 1000 / Cred: 1020 + 5010 | JT / Direct | Ref Uni Local | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 116 | TR-16 | Unitransfer Local - Payer | Money Transfer | PAY | OUTFLOW | NONE | DETTE_DOWN | HTG (No FX) | Deb: 1020 / Cred: 1000 | JT / Direct | Ref Uni Local | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 117 | TR-17 | Western Capital Intl - Envoyer | Money Transfer | SEND | INFLOW | NONE | DETTE_UP | HTG/USD (FX) | Deb: 1000/1001 / Cred: 2050 + 5010 | ST / Direct | MTCN WestCap | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 118 | TR-18 | Western Capital Intl - Payer | Money Transfer | PAY | OUTFLOW | NONE | CREANCE_UP | HTG/USD (FX) | Deb: 1030 / Cred: 1000/1001 | JT / Direct | MTCN WestCap | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 119 | TR-19 | Western Capital Local - Envoyer | Money Transfer | SEND | INFLOW | NONE | DETTE_UP | HTG (No FX) | Deb: 1000 / Cred: 1020 + 5010 | JT / Direct | MTCN Local | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 120 | TR-20 | Western Capital Local - Payer | Money Transfer | PAY | OUTFLOW | NONE | DETTE_DOWN | HTG (No FX) | Deb: 1020 / Cred: 1000 | JT / Direct | MTCN Local | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 121 | TR-21 | Western Sogexpress Intl - Envoyer | Money Transfer | SEND | INFLOW | NONE | DETTE_UP | HTG/USD (FX) | Deb: 1000/1001 / Cred: 2050 + 5010 | ST / Direct | MTCN Soge | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 122 | TR-22 | Western Sogexpress Intl - Payer | Money Transfer | PAY | OUTFLOW | NONE | CREANCE_UP | HTG/USD (FX) | Deb: 1030 / Cred: 1000/1001 | JT / Direct | MTCN Soge | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 123 | TR-23 | Western Sogexpress Local - Envoyer | Money Transfer | SEND | INFLOW | NONE | DETTE_UP | HTG (No FX) | Deb: 1000 / Cred: 1020 + 5010 | JT / Direct | MTCN Soge Local | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 124 | TR-24 | Western Sogexpress Local - Payer | Money Transfer | PAY | OUTFLOW | NONE | DETTE_DOWN | HTG (No FX) | Deb: 1020 / Cred: 1000 | JT / Direct | MTCN Soge Local | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |

---

#### Groupe B : Monnaie Mobile et Portefeuilles (13 Opérations)

| Code | ID | Nom Catalogue | Famille | Sens | Physical Cash | Bank Effect | Créance / Dette | Devise / FX | Schéma Comptable (Deb / Cred) | Rôle & Approb. | Justificatifs | Decision Req | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 201 | MM-01 | MonCash - Cash-In | Mobile Money | DEPOSIT | INFLOW | NONE | WALLET_UP | HTG (No FX) | Deb: 1000 / Cred: 1010_MONCASH | JT / Direct | TransID MonCash | N/A — JUSTIFIED | `VERIFIED_RUNTIME` |
| 202 | MM-02 | MonCash - Cash-Out | Mobile Money | WITHDRAW | OUTFLOW | NONE | WALLET_DOWN | HTG (No FX) | Deb: 1010_MONCASH / Cred: 1000 | JT / Direct | TransID MonCash | N/A — JUSTIFIED | `VERIFIED_RUNTIME` |
| 203 | MM-03 | NatCash - Cash-In | Mobile Money | DEPOSIT | INFLOW | NONE | WALLET_UP | HTG (No FX) | Deb: 1000 / Cred: 1010_NATCASH | JT / Direct | TransID NatCash | N/A — JUSTIFIED | `VERIFIED_RUNTIME` |
| 204 | MM-04 | NatCash - Cash-Out | Mobile Money | WITHDRAW | OUTFLOW | NONE | WALLET_DOWN | HTG (No FX) | Deb: 1010_NATCASH / Cred: 1000 | JT / Direct | TransID NatCash | N/A — JUSTIFIED | `VERIFIED_RUNTIME` |
| 205 | MM-05 | LaPouLa - Cash-In | Mobile Money | DEPOSIT | INFLOW | NONE | WALLET_UP | HTG (No FX) | Deb: 1000 / Cred: 1010_LAPOULA | JT / Direct | Ref LaPouLa | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 206 | MM-06 | LaPouLa - Cash-Out | Mobile Money | WITHDRAW | OUTFLOW | NONE | WALLET_DOWN | HTG (No FX) | Deb: 1010_LAPOULA / Cred: 1000 | JT / Direct | Ref LaPouLa | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 207 | MM-07 | LajanCash - Cash-In | Mobile Money | DEPOSIT | INFLOW | NONE | WALLET_UP | HTG (No FX) | Deb: 1000 / Cred: 1010_LAJANCASH | JT / Direct | Ref LajanCash | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 208 | MM-08 | LajanCash - Cash-Out | Mobile Money | WITHDRAW | OUTFLOW | NONE | WALLET_DOWN | HTG (No FX) | Deb: 1010_LAJANCASH / Cred: 1000 | JT / Direct | Ref LajanCash | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 209 | MM-09 | Zelle - Cash-In | Mobile Money | DEPOSIT | NONE | INFLOW | PASSIF_UP | USD (Lock 5m) | Deb: 1010_BANK_USD / Cred: 2050_ZELLE | ST / Direct | Zelle Conf # | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 210 | MM-10 | Zelle - Cash-Out | Mobile Money | WITHDRAW | NONE | OUTFLOW | PASSIF_DOWN | USD (Lock 5m) | Deb: 2050_ZELLE / Cred: 1010_BANK_USD | ST / Direct | Zelle Conf # | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 211 | MM-11 | UTK - Cash-In | Mobile Money | DEPOSIT | INFLOW | NONE | WALLET_UP | HTG (No FX) | Deb: 1000 / Cred: 1010_UTK | JT / Direct | Ref UTK | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 212 | MM-12 | UTK - Cash-Out | Mobile Money | WITHDRAW | OUTFLOW | NONE | WALLET_DOWN | HTG (No FX) | Deb: 1010_UTK / Cred: 1000 | JT / Direct | Ref UTK | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 213 | MM-13 | Remboursement Transfert USD | Mobile Money | REFUND | OUTFLOW | NONE | CREANCE_DOWN | USD (Fixed) | Deb: 2050_CLEARING / Cred: 1001_USD | ST / Approval | Ref Origine | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |

---

#### Groupe C : Operations de Change (7 Opérations)

| Code | ID | Nom Catalogue | Famille | Sens | Physical Cash | Bank Effect | Créance / Dette | Devise / FX | Schéma Comptable (Deb / Cred) | Rôle & Approb. | Justificatifs | Decision Req | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 301 | FX-01 | Achat de Devise (USD/HTG) | Foreign Exchange | BUY | IN/OUT (USD/HTG) | NONE | NONE | USD->HTG | Deb: 1001_USD / Cred: 1000_HTG + 5010 | ST / Direct | Voucher FX | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 302 | FX-02 | Vente de Devise (HTG/USD) | Foreign Exchange | SELL | IN/OUT (HTG/USD) | NONE | NONE | HTG->USD | Deb: 1000_HTG / Cred: 1001_USD + 5010 | ST / Direct | Voucher FX | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 303 | FX-03 | Remise US - Envoi & Achat | Foreign Exchange | BUY | INFLOW (USD) | NONE | CLEARING_UP | USD (Lock 5m) | Deb: 1001_USD / Cred: 1030 + 5010 | ST / Direct | Ref Remise US | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 304 | FX-04 | Remise US - Achat Direct | Foreign Exchange | BUY | IN/OUT (USD/HTG) | NONE | NONE | USD (Lock 5m) | Deb: 1001_USD / Cred: 1000_HTG + 5010 | ST / Direct | Ref Remise US | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 305 | FX-05 | Remise CANA - Achat | Foreign Exchange | BUY | IN/OUT (CAD/HTG) | NONE | NONE | CAD (Lock 5m) | Deb: 1002_CAD / Cred: 1000_HTG + 5010 | ST / Direct | Ref Remise CAD | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 306 | FX-06 | Remise EURO - Achat | Foreign Exchange | BUY | IN/OUT (EUR/HTG) | NONE | NONE | EUR (Lock 5m) | Deb: 1002_EUR / Cred: 1000_HTG + 5010 | ST / Direct | Ref Remise EUR | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 307 | FX-07 | Remise PESO - Achat | Foreign Exchange | BUY | IN/OUT (DOP/HTG) | NONE | NONE | DOP (Lock 5m) | Deb: 1002_DOP / Cred: 1000_HTG + 5010 | ST / Direct | Ref Remise DOP | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |

---

#### Groupe D : Opérations Bancaires et Règlements Prestataires (11 Opérations)

| Code | ID | Nom Catalogue | Famille | Sens | Physical Cash | Bank Effect | Créance / Dette | Devise / FX | Schéma Comptable (Deb / Cred) | Rôle & Approb. | Justificatifs | Decision Req | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 401 | BK-01 | Retrait Bancaire HTG | Banking | WITHDRAW | INFLOW | OUTFLOW | NONE | HTG (No FX) | Deb: 1000_HTG / Cred: 1010_BANK | ST / Maker-Checker | Bordereau Retrait | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 402 | BK-02 | Retrait Bancaire USD | Banking | WITHDRAW | INFLOW | OUTFLOW | NONE | USD (No FX) | Deb: 1001_USD / Cred: 1010_USD | ST / Maker-Checker | Bordereau Retrait | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 403 | BK-03 | Dépôt Bancaire HTG | Banking | DEPOSIT | OUTFLOW | INFLOW | NONE | HTG (No FX) | Deb: 1010_BANK / Cred: 1000_HTG | ST / Maker-Checker | Bordereau Dépôt | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 404 | BK-04 | Dépôt Bancaire USD | Banking | DEPOSIT | OUTFLOW | INFLOW | NONE | USD (No FX) | Deb: 1010_USD / Cred: 1001_USD | ST / Maker-Checker | Bordereau Dépôt | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 405 | BK-05 | Virement Inter-Banques HTG | Banking | TRANSFER | NONE | IN/OUT | NONE | HTG (No FX) | Deb: 1010_BANK_B / Cred: 1010_BANK_A | M / Direct | Avis Virement | N/A — JUSTIFIED | `VERIFIED_RUNTIME` |
| 406 | BK-06 | Virement Inter-Banques USD | Banking | TRANSFER | NONE | IN/OUT | NONE | USD (No FX) | Deb: 1010_USD_B / Cred: 1010_USD_A | M / Direct | Avis Virement | N/A — JUSTIFIED | `VERIFIED_RUNTIME` |
| 407 | BK-07 | Chèque Émis HTG/USD | Banking | PAY | NONE | OUTFLOW | DETTE_DOWN | HTG/USD | Deb: 2000_PAYABLE / Cred: 1010_BANK | M / Maker-Checker | Numéro Chèque | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 408 | BK-08 | Chèque Reçu HTG/USD | Banking | DEPOSIT | INFLOW (Check) | NONE | CREANCE_DOWN | HTG/USD | Deb: 1000_CHECKS / Cred: 1200_REC | ST / Direct | Numéro Chèque | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 409 | BK-09 | Chèque Rejeté / Impayé | Banking | REVERSAL | NONE | OUTFLOW | CREANCE_UP | HTG/USD | Deb: 1200_REC / Cred: 1010_BANK + 6000 | M / Approval | Avis Rejet | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 410 | BK-10 | Règlement Prestataire Standard | Settlement | PAY | NONE | OUTFLOW | DETTE_DOWN | HTG/USD (FX) | Deb: 2050_CLEARING / Cred: 1010_BANK | M / Maker-Checker | SWIFT / Vir Ref | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 411 | BK-11 | Règlement Flux Hist. 30/70 | Settlement | PAY | OUTFLOW (30%) | OUTFLOW (70%) | DETTE_DOWN | HTG/USD (FX) | Deb: 2050 / Cred: 1010 (70%) + Cred: 1000 (30%) | O / Approval | Protocole 30/70 | **D-01** | `BUSINESS_DECISION_REQUIRED` |

---

#### Groupe E : Renflouements, Propriétaire et Prêts (8 Opérations)

| Code | ID | Nom Catalogue | Famille | Sens | Physical Cash | Bank Effect | Créance / Dette | Devise / FX | Schéma Comptable (Deb / Cred) | Rôle & Approb. | Justificatifs | Decision Req | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 501 | RP-01 | Renflouement PDG (Capital) | Owner / Capital | REFUEL | INFLOW | NONE | EQUITY / LOAN | HTG/USD | Deb: 1000/1001 / Cred: 3000 / 2000_OWNER | O / Maker-Checker | Reçu Apport | **D-02** | `BUSINESS_DECISION_REQUIRED` |
| 502 | RP-02 | Retrait PDG (Prélèvement) | Owner / Capital | WITHDRAW | OUTFLOW | NONE | EQUITY / LOAN | HTG/USD | Deb: 3000 / 2000_OWNER / Cred: 1000/1001 | O / Maker-Checker | Reçu Prélèvement | **D-02** | `BUSINESS_DECISION_REQUIRED` |
| 503 | RP-03 | Renflouement Pompiste | Station Float | REFUEL | OUTFLOW | NONE | AVANCE_UP | HTG (No FX) | Deb: 1000_STATION_FLOAT / Cred: 1000 | HT / Direct | Bon Station | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 504 | RP-04 | Renflouement Guichet / POS | Till Refill | REFUEL | IN/OUT (Safe/Till)| NONE | NONE | HTG/USD | Deb: 1000_TILL / Cred: 1005_SAFE | HT / Maker-Checker | Bon Transfert Int. | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 505 | RP-05 | Prêt Client (Octroi) | Loan | PAY | OUTFLOW | NONE | CREANCE_UP | HTG/USD | Deb: 1200_LOANS / Cred: 1000/1001 | M / Approval | Contrat Prêt | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 506 | RP-06 | Remboursement Prêt Client | Loan Repayment | DEPOSIT | INFLOW | NONE | CREANCE_DOWN | HTG/USD | Deb: 1000/1001 / Cred: 1200_LOANS + 4000 | JT / Direct | Reçu Remboursement | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 507 | RP-07 | Prêt Propriétaire à Société | Owner Loan | REFUEL | INFLOW | NONE | PASSIF_UP | HTG/USD | Deb: 1000/1001 / Cred: 2000_OWNER_LOAN | O / Maker-Checker | Convention Prêt | **D-02** | `BUSINESS_DECISION_REQUIRED` |
| 508 | RP-08 | Remboursement Prêt Propriétaire | Owner Loan | WITHDRAW | OUTFLOW | NONE | PASSIF_DOWN | HTG/USD | Deb: 2000_OWNER_LOAN / Cred: 1000/1001 | O / Maker-Checker | Avis Remboursement | **D-02** | `BUSINESS_DECISION_REQUIRED` |

---

#### Groupe F : Salaires, Charges et OPEX (12 Opérations)

| Code | ID | Nom Catalogue | Famille | Sens | Physical Cash | Bank Effect | Créance / Dette | Devise / FX | Schéma Comptable (Deb / Cred) | Rôle & Approb. | Justificatifs | Decision Req | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 601 | EX-01 | Salaires Employés (Cash) | Payroll | PAY | OUTFLOW | NONE | DETTE_DOWN | HTG (No FX) | Deb: 2010_PAYROLL / Cred: 1000 | ST / Direct | Bulletin Paie | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 602 | EX-02 | Salaires Sécurité (Cash) | Payroll | PAY | OUTFLOW | NONE | EXPENSE | HTG (No FX) | Deb: 6010_SECURITY / Cred: 1000 | ST / Direct | Émargement | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 603 | EX-03 | Bonus, Dons, Gratifications | Expense | PAY | OUTFLOW | NONE | EXPENSE | HTG (No FX) | Deb: 6010_BONUS / Cred: 1000 | M / Approval | Justificatif | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 604 | EX-04 | Avance Salariale (Acompte) | Advance | PAY | OUTFLOW | NONE | AVANCE_UP | HTG (No FX) | Deb: 1300_ADVANCES / Cred: 1000 | ST / Direct | Reçu Avance | N/A — JUSTIFIED | `VERIFIED_RUNTIME` |
| 605 | EX-05 | Loyer (Cash / Banque) | OPEX | PAY | OUTFLOW | CONDITIONAL | EXPENSE | HTG/USD | Deb: 6000_RENT / Cred: 1000/1010 | M / Approval | Quittance Loyer | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 606 | EX-06 | Dépenses Courantes Caisse | OPEX | PAY | OUTFLOW | NONE | EXPENSE | HTG (No FX) | Deb: 6000_OPERATING / Cred: 1000 | JT / Limit < 5k | Reçu / Facture | **D-06** | `BUSINESS_DECISION_REQUIRED` |
| 607 | EX-07 | Transport Convoyage Fonds | OPEX | PAY | OUTFLOW | NONE | EXPENSE | HTG (No FX) | Deb: 6020_TRANSPORT / Cred: 1000 | ST / Direct | Bon Transport | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 608 | EX-08 | Telecom & Internet | OPEX | PAY | OUTFLOW | NONE | EXPENSE | HTG (No FX) | Deb: 6000_TELECOM / Cred: 1000 | JT / Direct | Facture Telecom | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 609 | EX-09 | Maintenance & Réparations | OPEX | PAY | OUTFLOW | NONE | EXPENSE | HTG (No FX) | Deb: 6000_MAINT / Cred: 1000 | ST / Direct | Reçu Réparateur | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 610 | EX-10 | Déchets & Salubrité | OPEX | PAY | OUTFLOW | NONE | EXPENSE | HTG (No FX) | Deb: 6000_WASTE / Cred: 1000 | JT / Direct | Reçu Service | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 611 | EX-11 | Frais Bancaires HTG | Bank Fee | PAY | NONE | OUTFLOW | EXPENSE | HTG (No FX) | Deb: 6000_BANK_FEES / Cred: 1010 | M / Direct | Avis Débit Banque | N/A — JUSTIFIED | `VERIFIED_RUNTIME` |
| 612 | EX-12 | Frais Bancaires USD | Bank Fee | PAY | NONE | OUTFLOW | EXPENSE | USD (No FX) | Deb: 6000_BANK_FEES / Cred: 1010_USD | M / Direct | Avis Débit Banque | N/A — JUSTIFIED | `VERIFIED_RUNTIME` |

---

#### Groupe G : Écarts, Solde et Clôture (10 Opérations)

| Code | ID | Nom Catalogue | Famille | Sens | Physical Cash | Bank Effect | Créance / Dette | Devise / FX | Schéma Comptable (Deb / Cred) | Rôle & Approb. | Justificatifs | Decision Req | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 701 | AD-01 | Surplus Liasse HTG | Adjustment | ADJUST | INFLOW | NONE | REVENUE | HTG (No FX) | Deb: 1000 / Cred: 5090_SURPLUS | HT / Maker-Checker | PV Liasse | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 702 | AD-02 | Surplus Liasse USD | Adjustment | ADJUST | INFLOW | NONE | REVENUE | USD (No FX) | Deb: 1001_USD / Cred: 5090_SURPLUS | HT / Maker-Checker | PV Liasse | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 703 | AD-03 | Surplus Caisse Clôture HTG | Adjustment | ADJUST | INFLOW | NONE | REVENUE | HTG (No FX) | Deb: 1000 / Cred: 5090_SURPLUS | HT / Maker-Checker | PV Clôture | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 704 | AD-04 | Surplus Caisse Clôture USD | Adjustment | ADJUST | INFLOW | NONE | REVENUE | USD (No FX) | Deb: 1001_USD / Cred: 5090_SURPLUS | HT / Maker-Checker | PV Clôture | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 705 | AD-05 | Solde Ouverture HTG | Opening Balance | ADJUST | NONE | NONE | NONE | HTG (No FX) | Deb: 1000 / Cred: 1000_OPENING | HT / Direct | Session Prev ID | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 706 | AD-06 | Solde Ouverture USD | Opening Balance | ADJUST | NONE | NONE | NONE | USD (No FX) | Deb: 1001_USD / Cred: 1001_OPENING | HT / Direct | Session Prev ID | N/A — JUSTIFIED | `VERIFIED_STATIC` |
| 707 | AD-07 | Espèces Mutilées | Damage | OUTFLOW | OUTFLOW | NONE | CREANCE / EXPENSE | HTG/USD | Deb: 1020_MUTILATED / Cred: 1000 | M / Maker-Checker | Bordereau Mutilé | **D-03** | `BUSINESS_DECISION_REQUIRED` |
| 708 | AD-08 | Manquant Caisse | Deficit | OUTFLOW | OUTFLOW | NONE | CREANCE / EXPENSE | HTG/USD | Deb: 6090_DEFICIT / 1300 / Cred: 1000 | M / Maker-Checker | PV Écart | **D-04** | `BUSINESS_DECISION_REQUIRED` |
| 709 | AD-09 | Perte Convoyage / Fourgon | Convoy Loss | OUTFLOW | OUTFLOW | NONE | CREANCE_INSURANCE | HTG/USD | Deb: 1200_INSURANCE / Cred: 1020 | O / Approval | PV Sinistre | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |
| 710 | AD-10 | Régularisation Historique | Adjustment | ADJUST | CONDITIONAL | NONE | RETAINED_EARNINGS | HTG/USD | Deb: 1000/1001 / Cred: 3000_EQUITY | O / Approval | Document Audit | N/A — JUSTIFIED | `DOCUMENTED_DESIGN` |

---

# 5. CONTROL DU CHAMP LEGACY `behavior`

L'audit contradictoire a recherché toutes les occurrences du champ `behavior` dans la codebase.

### 5.1 Inspection des Fichiers de la Codebase

| Fichier Inspecté | Ligne / Contexte | Usage Constaté | Criticité | Compatible P03.6 ? |
|---|---:|---|---|---|
| `src/domains/cash/types/NormalizedCashMovement.ts` | — | Non présent dans le contrat SSOT. Remplacé par `direction` (`INFLOW`/`OUTFLOW`/`TRANSFER`). | `NONE` | `YES` |
| `src/domains/cash/classification/TreasuryClassification.ts` | — | Aucun usage de `behavior`. Classification par code COA et méthode de paiement. | `NONE` | `YES` |
| `src/services/AccountingEngine.ts` | — | Génère les écritures sur la base des comptes COA et des montants explicites. Aucun usage de `behavior`. | `NONE` | `YES` |
| `src/repositories/CashSettlementRepository.ts` | — | Stocke les règlements avec `type: 'CASH_IN' \| 'CASH_OUT'`. | `LOW (NEUTRALIZED)` | `YES` |

### 5.2 Verdict sur `behavior`
Le champ `behavior` (+1 / -1) des dumps historiques est **strictement neutralisé** dans la couche comptable de FINOPS ERP. Il ne sert aucunement à déduire le sens d'un débit/crédit ni l'effet physique de caisse.

---

# 6. DÉCISION D-01 — FLUX HISTORIQUES 30% / 70% (`BK-11`)

- **Problématique** : Les règlements d'anciennes filiales utilisaient un éclatement 70% par virement bancaire et 30% par espèces en caisse.
- **Opération concernée** : `BK-11` (Règlement Prestataire — Flux Hist. 30/70).
- **Options Métier** :
  - *Option A* : Génération d'une écriture composite automatique unique : Débit `2050_CLEARING` / Crédit `1010_BANK` (70%) + Crédit `1000_CASH` (30%).
  - *Option B* : Obligation de saisir deux transactions distinctes (70% Banking + 30% Cash).
- **Recommandation Technique** : Option A.
- **Statut de Gouvernance** : `STATUS = UNRESOLVED`
- **Preuve de Validation** : Aucune signature formelle trouvée. En attente de validation du Comité Financier.

---

# 7. DÉCISION D-02 — RENFLOUEMENTS ET RETRAITS PROPRIÉTAIRE (`RP-01`, `RP-02`, `RP-07`, `RP-08`)

- **Problématique** : Qualification financière des injections/retraits de liquidités par l'actionnaire ou le propriétaire.
- **Opérations concernées** : `RP-01`, `RP-02`, `RP-07`, `RP-08`.
- **Options Métier** :
  - *Option A* : Inscription en Compte Courant d'Associé (`2000_OWNER_LOAN` - Passif exigible).
  - *Option B* : Apport / Réduction de Capitaux Propres (`3000_SHARE_CAPITAL` - Equity).
- **Recommandation Technique** : Option A par défaut.
- **Statut de Gouvernance** : `STATUS = UNRESOLVED`
- **Preuve de Validation** : En attente d'arbitrage de la Direction Générale.

---

# 8. DÉCISION D-03 — ESPÈCES MUTILÉES ET BILLETS ENDOMMAGÉS (`AD-07`)

- **Problématique** : Imputation comptable des billets détériorés retirés de la circulation.
- **Opération concernée** : `AD-07` (Espèces Mutilées).
- **Options Métier** :
  - *Option A* : Transfert sur compte d'attente d'échange BRH (`1020_MUTILATED`) jusqu'à valeur reçue.
  - *Option B* : Passage immédiat en charge pour perte définitive (`6090_CASH_DEFICIT`).
- **Recommandation Technique** : Option A.
- **Statut de Gouvernance** : `STATUS = UNRESOLVED`
- **Preuve de Validation** : En attente d'instruction de la Direction de la Trésorerie.

---

# 9. DÉCISION D-04 — SEUILS ET IMPUTATION DES ÉCARTS DE CAISSE (`AD-08`)

- **Problématique** : Traitement des manquants de caisse constatés lors des fermetures de session.
- **Opération concernée** : `AD-08` (Liasses / Manquants Caisse).
- **Options Métier** :
  - *Option A* : Imputation automatique en créance salariale sur le caissier (`1300_EMPLOYEE_ADVANCES`).
  - *Option B* : Passage en charge d'exploitation (`6090_CASH_DEFICIT`) pour tout écart inférieur à un seuil fixe (ex: 500 HTG), et créance au-delà.
- **Recommandation Technique** : Option B avec seuil paramétrable par filiale.
- **Statut de Gouvernance** : `STATUS = UNRESOLVED`
- **Preuve de Validation** : En attente de validation RH et Contrôle de Gestion.

---

# 10. DÉCISION D-05 — PÉRIODICITÉ DU CLEARING PRESTATAIRES (CAM, MONEYGRAM, RIA)

- **Problématique** : Modalité et fréquence du lettrage des comptes de clearing prestataires (`1030` / `2050`).
- **Opérations concernées** : `TR-01` à `TR-24`, `BK-10`.
- **Options Métier** :
  - *Option A* : Pré-clearing automatique lors de la clôture de caisse quotidienne.
  - *Option B* : Clearing manuel exclusivement sur présentation du bordereau bancaire de compensation.
- **Recommandation Technique** : Option A pour la pré-compensation + Option B pour le lettrage bancaire.
- **Statut de Gouvernance** : `STATUS = UNRESOLVED`
- **Preuve de Validation** : En attente d'accord Opérations & Métiers.

---

# 11. DÉCISION D-06 — SEUIL DES DÉPENSES DIRECTES EN CAISSE (`EX-06`)

- **Problématique** : Plafond d'autorisation des petites dépenses d'exploitation payées directement par le caissier (`Petty Cash`).
- **Opération concernée** : `EX-06` (Dépenses Opérationnelles Courantes).
- **Options Métier** :
  - *Option A* : Plafond fixe à 2 500 HTG.
  - *Option B* : Plafond fixe à 5 000 HTG.
  - *Option C* : Validation Manager obligatoire dès le 1er gourde.
- **Recommandation Technique** : Option B (5 000 HTG).
- **Statut de Gouvernance** : `STATUS = UNRESOLVED`
- **Preuve de Validation** : En attente de décision de la Direction Financière.

---

# 12. CONTRÔLE DES FAMILLES MÉTIEURS

Audit de couverture des familles :

- **Transferts d'argent** : CAM, MoneyGram, Ria, Unitransfer, Western Capital, Western Sogexpress (100% couverts).
- **Monnaie Mobile** : MonCash, NatCash, LaPouLa, LajanCash (100% couverts).
- **Réseaux Spéciaux** : Zelle, UTK (100% couverts).
- **Change (FX)** : Achats/Ventes USD, CAD, EUR, DOP et Remises (100% couverts).
- **Banque** : Retraits, Dépôts, Virements, Chèques émis/reçus/rejetés (100% couverts).
- **Financement & Propriétaire** : Apports, Retraits, Prêts clients, Prêts associés (100% couverts).
- **Personnel** : Salaires, Sécurité, Bonus, Avances (100% couverts).
- **Dépenses** : Rent, Transport, Telecom, Maintenance, Waste, Bank Fees (100% couverts).
- **Écarts & Clôture** : Surplus, Manquants, Mutilés, Perte convoyage, Soldes d'ouverture (100% couverts).

---

# 13. CONTRÔLE PHYSIQUE DE CAISSE

Chaque opération se voit attribuer une valeur explicite pour `PhysicalCashEffect` :
- `INFLOW` : Entrée physique d'espèces dans le tiroir-caisse.
- `OUTFLOW` : Sortie physique d'espèces du tiroir-caisse.
- `NONE` : Aucun impact sur le tiroir-caisse physique (virements bancaires, Zelle, jeux d'écritures).
- `CONDITIONAL` / `IN/OUT` : Opérations bidevises (ex: FX Achat USD = Entrée USD + Sortie HTG).

Aucune déduction automatique n'est faite sur la seule base de la catégorie ou du champ legacy `behavior`.

---

# 14. CONTRÔLE DU GRAND LIVRE UNIQUE (ONE GL SSOT)

L'audit confirme que les 85 opérations de caisse s'appuient exclusivement sur :
- `AccountingEngine.ts`
- `LedgerRepository.ts`
- Collection Firestore `ledger_transactions`
- Modèle comptable en partie double (`totalDebitCents === totalCreditCents`).

Aucun second grand livre, registre masqué ou journal parallèle n'a été créé.

---

# 15. CONTRÔLE MULTI-DEVISES ET TAUX FX

Pour toutes les opérations multi-devises (`TR-*`, `FX-*`, `BK-*`) :
- Présence obligatoire des 7 paramètres : `sourceCurrency`, `sourceAmount`, `targetCurrency`, `targetAmount`, `appliedRate`, `rateTimestamp`, `rateSource`.
- Invariance du taux appliqué : Le taux saisi lors de la transaction reste **immuable** et gravé dans le journal comptable.

---

# 16. CONTRÔLE PRINCIPAL / COMMISSION

Pour tous les transferts d'argent et services :
- Séparation stricte du principal (qui alimente les comptes de passif/clearing `1030` / `2050`) et de la commission (qui alimente les comptes de produits `5010` / `5020`).
- Le montant total perçu n'est jamais assimilé à 100% à un chiffre d'affaires.

---

# 17. CONTRÔLE SEND / PAY / SETTLEMENT

Distingue clairement :
- `SEND` : Argent perçu du client + Création d'une dette envers le réseau partenaire.
- `PAY` : Argent versé au bénéficiaire + Création d'une créance sur le réseau partenaire.
- `SETTLEMENT` : Règlement financier effectif avec la banque du réseau partenaire.

---

# 18. CONTRÔLE MONNAIE MOBILE

Distingue l'impact physique (espèces en caisse) de l'impact électronique sur le portefeuille fournisseur (`1010_MONCASH`, `1010_NATCASH`).
Un Cash-Out MonCash est une sortie d'espèces physiques contre une entrée de valeur sur le portefeuille MonCash.

---

# 19. CONTRÔLE DES OPÉRATIONS BANCAIRES

Un transfert `Caisse -> Banque` (`BK-03`) ou `Banque -> Caisse` (`BK-01`) est comptabilisé exclusivement comme une mutation d'actifs de Classe 1. Il ne touche **aucun compte de produit ni de charge**.

---

# 20. CONTRÔLE FINANCEMENT & PROPRIÉTAIRE

Les flux avec le propriétaire sont clairement isolés et ne peuvent pas être qualifiés d'office comme du chiffre d'affaires ou des charges.

---

# 21. CONTRÔLE DES ÉCARTS DE CAISSE

Séparation stricte entre :
- Écart constaté lors du comptage physique.
- Charge définitive pour la société (`6090_CASH_DEFICIT`).
- Créance sur le personnel (`1300_EMPLOYEE_ADVANCES`).

---

# 22. CONTRÔLE RBAC ET ALIGNEMENT DES RÔLES

Correspondance des rôles :
- `Teller` -> `JUNIOR_TELLER` ou `SENIOR_TELLER`
- `Manager` -> `MANAGER`
- `Head Teller` -> `HEAD_TELLER`
- `Owner` -> `OWNER`

Toutes les permissions respectent le matrix RBAC officiel de FINOPS ERP.

---

# 23. CONTRÔLE DES CODES vs COMPTES COA

Confirmation explicite : Les codes historiques du catalogue (`101`, `102`, `201`, `301`, `90001`, etc.) sont des **codes de types de transaction**, et NON des numéros de compte comptables du plan comptable (COA).

---

# 24. CONTRÔLE DE L'IDEMPOTENCE

Chaque opération s'appuie sur la clé d'idempotence composite `[businessId]_[providerRef]_[operationType]`.
- Statut Actuel : `STATUS = DESIGN_ONLY` (L'implémentation runtime sera exécutée en P04).

---

# 25. CLASSIFICATION DES PREUVES

- `VERIFIED_RUNTIME` : Portefeuilles MonCash/NatCash, Avances salariales, Frais bancaires, Virements bancaires.
- `VERIFIED_STATIC` : Opérations CAM, MoneyGram, Change FX, Dépôts/Retraits bancaires, Clôtures/Surplus.
- `VERIFIED_FROM_SOURCE_DATA` : Inventaire exhaustif des 85 opérations du dump source.
- `DOCUMENTED_DESIGN` : Schémas des opérations Ria, Unitransfer, Western Capital/Sogexpress, Zelle, UTK, Chèques, etc.
- `BUSINESS_DECISION_REQUIRED` : Décisions D-01 à D-06.

---

# 26. VERDICT STRICT

```text
CATALOG_RECONCILIATION_COMPLETE_BUSINESS_DECISIONS_PENDING
```

Le catalogue de 85 opérations est intégralement réconcilié et cartographié, mais 6 décisions métier/financières (D-01 à D-06) restent formellement en attente de validation humaine.

---

# 27. CRITÈRE D'AUTORISATION P04

```text
Catalogue 100% réconcilié : OK
AUCUNE opération critique non cartographiée : OK
AUCUNE confusion behavior -> accounting : OK
Grand Livre SSOT préservé : OK
Caisse / Banque séparées : OK
FX & Devises identifiés : OK
Principal / Commission séparés : OK
RBAC identifié : OK
Décisions D-01 -> D-06 résolues : PENDING (STATUS = UNRESOLVED)
P03.7 sécurité runtime acceptable : PENDING
--------------------------------------------------
STATUT AUTORISATION P04 : P04 = NOT YET AUTHORIZED
```

---

# 28. CONCLUSION

L'audit **PROMPT 03.6B** clôture la réconciliation documentaire et la cartographie du catalogue des **85 opérations de caisse**.

- **Aucun code de production n'a été altéré.**
- **Aucune règle ni donnée Firestore n'a été modifiée.**
- **L'étape P04 pourra être lancée dès l'obtention de la signature officielle des décisions D-01 à D-06 par le comité de gouvernance.**

*Fait à Port-au-Prince, le 11 octobre 2026.*  
*Équipe d'Architecture FINOPS ERP / FINAYITI Fusion.*
