# FINOPS × FINAYITI — FIRESTORE EMULATOR RECOVERY & SECURITY RECERTIFICATION
## Rapport de Diagnostic d'Environnement, Émulation et Recertification de Sécurité (Phase P03.7D)

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 11 octobre 2026  
**Phase :** P03.7D — Firestore Emulator Recovery & Security Recertification  
**Nature :** Diagnostic système, émulation et recertification de sécurité  
**Mode :** Strictement contrôlé — aucun déploiement, aucun test destructif  
**Verdict Final :** `EMULATOR_SETUP_BLOCKED`  

---

## 1. RÉSUMÉ EXÉCUTIF

La Phase P03.7D avait pour mission de diagnostiquer l'environnement de test, de démarrer l'émulateur Firestore en environnement isolé et de recertifier dynamiquement la sécurité multi-tenant sur la suite d'intégration `FirestoreRuntimeSecurityCertification.test.ts`.

### Diagnostic Clé
L'analyse de l'environnement de prévisualisation AI Studio a révélé la cause exacte et irréfutable du refus de connexion (`ECONNREFUSED 127.0.0.1:8088`) :

1. **Port Canonique Validé :** La configuration dans `firebase.json` (`"emulators": { "firestore": { "port": 8088 } }`) et dans `FirestoreRuntimeSecurityCertification.test.ts` (`port: 8088`) est parfaitement cohérente.
2. **Absence du Runtime Java (JDK/JRE) :** La CLI Firebase (`v15.29.0`) requiert un environnement Java pour exécuter le binaire du Cloud Firestore Emulator (`cloud-firestore-emulator.jar`).
3. **Erreur Système Détectée :** L'exécution de `npx firebase emulators:start --only firestore` échoue immédiatement avec :
   ```text
   i  emulators: Shutting down emulators.
   Error: Could not spawn `java -version`. Please make sure Java is installed and on your system PATH.
   ```
   La vérification directe par `java -version` confirme : `sh: 1: java: not found`.

---

## 2. DIAGNOSTIC DÉTAILLÉ DE L'ENVIRONNEMENT ET DES PORTS

### Inspection des Fichiers de Configuration

- **`firebase.json` :**
  ```json
  "emulators": {
    "firestore": {
      "port": 8088
    },
    "ui": {
      "enabled": false
    }
  }
  ```
- **`src/tests/integration/FirestoreRuntimeSecurityCertification.test.ts` :**
  ```typescript
  testEnv = await initializeTestEnvironment({
    projectId: "demo-no-project",
    firestore: {
      rules,
      host: "127.0.0.1",
      port: 8088
    }
  });
  ```

### Relevé des Processus et Ports Réseau Sockets (`ss -tuln`)
```text
Netid State  Recv-Q Send-Q Local Address:Port
tcp   LISTEN 0      0            0.0.0.0:3000   (Dev Web Server / Vite)
tcp   LISTEN 0      0            0.0.0.0:8080   (HTTP Proxy)
tcp   LISTEN 0      0                  *:8000   (Applet Container IPC)
```
*Constat :* Le port 8088 est totalement inactif car le processus Java nécessaire à l'émulateur ne peut pas être démarré.

---

## 3. COMMANDES EXÉCUTÉES ET PREUVES TECHNIQUE

| Commande Exécutée | Résultat Obtenu | Diagnostic Technique |
|---|---|---|
| `java -version` | `sh: 1: java: not found` (Exit 127) | Runtime Java absent du conteneur OS |
| `npx firebase --version` | `15.29.0` | CLI Firebase installée et opérationnelle |
| `npx firebase emulators:start --only firestore` | `Error: Could not spawn java -version.` | Échec de démarrage de l'émulateur |
| `npm test -- --run src/tests/integration/FirestoreRuntimeSecurityCertification.test.ts` | `connect ECONNREFUSED 127.0.0.1:8088` | Harness de test bloqué par l'émulateur inactif |
| `npm test -- --run src/tests/integration/FirestoreRulesIntegrity.test.ts` | `9 passed (9 tests)` | Tests unitaires sans émulateur réussis |

---

## 4. MATRICE DES TESTS DE SÉCURITÉ ET COUVERTURE DES SCÉNARIOS

Bien que le démarrage de l'émulateur soit bloqué par l'absence de Java, les 15 scénarios de sécurité sont inscrits dans le harnais de test `FirestoreRuntimeSecurityCertification.test.ts` et validés sur le plan de l'analyse statique des règles :

| ID Scénario | Intitulé du Test de Sécurité | Attendu | Statut Runtime | Audit Statique |
|---|---|---|---|---|
| **SEC-01** | Utilisateur A lit un document du Tenant A | Autorisé selon son rôle | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-02** | Utilisateur A lit un document du Tenant B | Refusé (`PERMISSION_DENIED`) | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-03** | Utilisateur A modifie un cycle de paie du Tenant A | Autorisé selon son rôle | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-04** | Utilisateur A modifie un cycle de paie du Tenant B | Refusé (`PERMISSION_DENIED`) | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-05** | Utilisateur A crée un document assigné au Tenant B | Refusé (`PERMISSION_DENIED`) | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-06** | Transfert d'un document du Tenant A vers B (`tenant_id`) | Refusé (`PERMISSION_DENIED`) | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-07** | Profil utilisateur absent ou tenant manquant | Refusé (`PERMISSION_DENIED`) | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-08** | Incohérence entre profil et jeton d'authentification | Rejet au niveau règles | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-09** | Tentative d'écriture avec tenant non résolu (`""`) | Rejet UI & Règles | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-10** | Document appartenant à `demo` ou `default` | Aucun accès implicite | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-11** | Utilisateur non authentifié | Refusé (`PERMISSION_DENIED`) | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-12** | Tentative d'auto-promotion `SUPER_ADMIN` par client | Refusé (`PERMISSION_DENIED`) | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-13** | Auto-promotion `SUPER_ADMIN` sur document existant | Refusé (`PERMISSION_DENIED`) | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-14** | Tentative d'altération du registre forensique / d'audit | Refusé (`PERMISSION_DENIED`) | `BLOCKED` | `VERIFIED_STATIC` |
| **SEC-15** | `OWNER` tente de modifier l'abonnement du tenant | Refusé (`PERMISSION_DENIED`) | `BLOCKED` | `VERIFIED_STATIC` |

---

## 5. PLAN DE DÉBLOCAGE CI/CD POUR LE PASSAGE EN PRODUCTION

Pour débloquer l'exécution dynamique des tests de sécurité dans le pipeline d'intégration continue (CI/CD) avant tout passage en phase P04 :

1. **Image Docker / Runner CI :**
   Utiliser une image contenant OpenJDK 17/21 (ex. `actions/setup-java@v3` sous GitHub Actions ou image `node:20-bullseye` avec `default-jre`).
2. **Commande d'Exécution Autonome :**
   ```bash
   npx firebase emulators:exec --only firestore "npm test -- --run src/tests/integration/FirestoreRuntimeSecurityCertification.test.ts"
   ```

---

## 6. VERDICT FINAL ET JUSTIFICATION

### Verdict Officiel Exclusif

```text
EMULATOR_SETUP_BLOCKED
```

### Justification
Conformément aux directives explicites du prompt P03.7D :
- Le runtime Java (`java`) n'étant pas disponible dans le conteneur OS de prévisualisation, l'émulateur Firestore n'a pas pu être instancié (`Could not spawn java -version`).
- L'absence d'instance d'émulateur active empêche l'exécution physique du harnais de test `@firebase/rules-unit-testing`.
- L'intégrité de la démarche interdit d'inventer des résultats de test ou d'accorder un verdict positif en l'absence de preuves d'exécution réelle.

Le passage à la planification d'implémentation P04 demeure strictement suspendu jusqu'à l'exécution des tests de sécurité sous un environnement disposant de Java et de l'émulateur Firestore.
