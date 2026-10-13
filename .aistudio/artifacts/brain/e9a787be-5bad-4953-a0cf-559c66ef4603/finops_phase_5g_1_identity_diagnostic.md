# FINOPS — DIAGNOSTIC DE L'IDENTITÉ FIREBASE ADMIN SDK

**Version :** 1.0  
**Statut :** Diagnostic Terminé  
**Projet Cible :** `finopsht`  
**Base Firestore :** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  

---

## 1. RÉSUMÉ DU DIAGNOSTIC

| Composant | Statut |
|---|---|
| **Identité Active** | `683065282899-compute@developer.gserviceaccount.com` (déduit) |
| **Méthode d'Authentification** | Application Default Credentials (ADC) |
| **Projet Ciblé (Config)** | `finopsht` |
| **Erreur Firestore** | `7 PERMISSION_DENIED` |
| **Erreur Auth** | `Identity Toolkit API disabled for project 683065282899` |

### Verdict Technique
L'application utilise les **Application Default Credentials (ADC)** de l'environnement d'exécution (AI Studio, projet `683065282899`). Cette identité tente d'accéder au projet `finopsht` mais n'a pas les autorisations IAM nécessaires.

---

## 2. PREUVES TECHNIQUES

### A. Initialisation du SDK
Le fichier `src/lib/firebaseAdmin.ts` suit une logique de résolution en cascade. Le diagnostic confirme l'échec des trois premières méthodes :
1. `GOOGLE_APPLICATION_CREDENTIALS` : **ABSENT**
2. `FIREBASE_SERVICE_ACCOUNT_KEY` : **ABSENT**
3. Fichiers JSON locaux : **AUCUN TROUVÉ**

Le SDK bascule donc sur :
`[Firebase Admin] Using Application Default Credentials (ADC)`

### B. Analyse de la Collision de Projets
Lors d'un test de l'API Auth (`listUsers`), le serveur Google a renvoyé l'erreur suivante :
> `Identity Toolkit API has not been used in project 683065282899 before or it is disabled.`

Cela prouve que :
- L'identité utilisée appartient au projet **`683065282899`** (projet de l'infrastructure AI Studio).
- Cette identité essaie d'utiliser ses propres quotas/APIs pour agir sur le projet cible `finopsht`.

### C. Erreur de Permission Firestore
L'erreur `PERMISSION_DENIED` sur Firestore confirme que l'identité `683065282899` n'a pas le rôle **Lecteur Cloud Datastore** sur le projet `finopsht`.

---

## 3. IDENTITÉ RECOMMANDÉE

Pour permettre l'inventaire global, l'une des identités suivantes doit être configurée :

1. **`firebase-adminsdk-fbsvc@finopsht.iam.gserviceaccount.com`** (Recommandé) :
   - C'est le compte de service Firebase par défaut du projet cible.
   - Il possède nativement les droits administrateur sur Firestore.

2. **`231531725507-compute@developer.gserviceaccount.com`** :
   - C'est le compte de service compute par défaut du projet `finopsht`.

---

## 4. PROCÉDURE DE CORRECTION (RECOMMANDÉE)

### Option A : Fournir une clé de compte de service (Plus robuste)
1. Générer une clé JSON pour `firebase-adminsdk-fbsvc@finopsht.iam.gserviceaccount.com` dans la console Google Cloud.
2. Encoder le contenu JSON en **Base64**.
3. Ajouter la variable d'environnement suivante dans AI Studio (via le panneau Secrets) :
   - Nom : `FIREBASE_SERVICE_ACCOUNT_KEY`
   - Valeur : `<Contenu_Base64>`
4. Redémarrer le serveur de développement.

### Option B : Autoriser l'identité de l'environnement (Plus simple)
1. Dans la console IAM du projet `finopsht`, ajouter un accès.
2. Membre : `683065282899-compute@developer.gserviceaccount.com`
3. Rôle : **Lecteur Cloud Datastore** (ou `Firebase Admin`).
4. Attendre la propagation (environ 2-5 minutes).

---

## 5. VALIDATION DU DIAGNOSTIC
Le diagnostic est considéré comme validé car les erreurs rapportées pointent explicitement vers l'utilisation d'une identité "consumer" (`683065282899`) sur une ressource "provider" (`finopsht`) sans délégation de droits IAM.

**Note :** Aucune modification de code ou de données n'a été effectuée durant ce diagnostic.
