# Architecture du Module Gestion Documentaire (Documents & Contrats)

## 1. Vue d'ensemble
Le module `DocumentsManager` gère la création, la consultation, la modification et la suppression des documents juridiques et des contrats d'employés au sein de la plateforme FINOPS ERP.

## 2. Flux de données & Résolution du Nom de la Compagnie
Afin de garantir que le nom de l'entreprise active s'affiche correctement sur l'interface et dans les documents officiels générés (PDF/simulation) :

1. **Extraction dans `DashboardShell`** :
   `DashboardShell` consomme le contexte d'entreprise via `useBusinessContext()`, extrait `liveBusiness?.name` et transmet la propriété `businessName` au composant `DocumentsManager`.

2. **Résolution dans `DocumentsManager`** :
   Le composant `DocumentsManager` accepte la prop `businessName`. En cas d'absence de prop, il utilise en secours la valeur provenant directement du `BusinessContext` ou une valeur par défaut de marque (`FINOPS ERP`).

3. **Inclusion dans l'interface et les PDF** :
   - **Registre des contrats** : Affichage d'un badge d'entreprise active dans l'en-tête de registre ainsi que sous chaque employé.
   - **Visionneuse de contrat (PDF)** : Le nom résolu est automatiquement injecté dans le texte de l'employeur, dans le bloc de signature de l'employeur, ainsi que dans le sceau d'inviolabilité.

## 3. Modèle de Données & Persistance
- **Collection Firestore** : `employee_contracts`
- **Isolation Multi-Tenancy** : Filtrage strict sur `business_id`.
- **RBAC** : 
  - `ADMIN`, `OWNER`, `MANAGER`, `SUPER_ADMIN` : Accès complet à tous les contrats de l'établissement.
  - `EMPLOYEE` : Accès restreint à la consultation de son propre contrat de travail.
