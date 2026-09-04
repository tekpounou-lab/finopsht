# Centre d'Intelligence & Notifications Architecture Specification

**Status**: Active & Verified  
**Domain**: Intelligence, Audit, and Operational Notifications  
**Storage**: Cloud Firestore (`notifications` collection)  
**Security**: Row-Level Security (RLS) with Multi-Tenancy & Role Targeting  

---

## 1. Vue d'Ensemble & Objectifs

Le module **Centre d'Intelligence & Notifications** fournit un flux en temps réel d'alertes financières, opérationnelles, RH et de sécurité pour chaque entreprise (tenant).

### Objectifs Clés
1. **Multi-Tenancy Strict** : Aucune notification d'une entreprise $A$ ne peut fuiter vers une entreprise $B$.
2. **Ciblage RLS par Rôle & Utilisateur** : Une alerte Super Admin ne doit jamais être visible par un Owner, et une alerte personnelle ne doit être visible que par son destinataire `targetUserId`.
3. **Réactivité Temps-Réel & Filtres Instantanés** : Les filtres (type, sévérité, statut de lecture, date, recherche textuelle) s'appliquent immédiatement sans perdre les données existantes.
4. **Mise à jour en Lot (Batch Read)** : L'action "Tout marquer comme lu" met à jour les documents de façon transactionnelle par lots de 450 documents.

---

## 2. Modèle de Données (`notifications`)

Chaque document de la collection racine `notifications` respecte le schéma suivant :

| Champ | Type | Obligatoire | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Oui | Identifiant unique généré par Firestore. |
| `businessId` | `string` | Oui | Identifiant de l'entreprise (tenant id). |
| `business_id` | `string` | Non | Alias rétro-compatible. |
| `targetRoles` | `Role[]` | Non | Liste des rôles autorisés (ex: `["SUPER_ADMIN"]`, `["OWNER", "MANAGER"]`). |
| `targetUserId` | `string` | Non | UID Firebase Auth de l'utilisateur destinataire direct. |
| `type` | `NotificationType` | Oui | Catégorie (`CRITICAL`, `FINANCE`, `ATTENDANCE`, `HR`, `SECURITY`, `SYSTEM`, `PAYROLL`, `INFO`, `ALERT`). |
| `severity` | `NotificationSeverity`| Oui | Niveau de gravité (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, `INFO`, `WARNING`, `ERROR`). |
| `title` | `string` | Oui | Titre synthétique de la notification. |
| `message` | `string` | Oui | Corps textuel de l'alerte ou détails. |
| `createdAt` | `string` (ISO) | Oui | Horodatage de création UTC. |
| `read` | `boolean` | Oui | Statut de lecture (`true` si lu, `false` sinon). |
| `readAt` | `string` (ISO) | Non | Horodatage de première lecture. |
| `sourceId` | `string` | Non | Identifiant source (ex: ID transaction grand livre, bulletin de paie). |
| `actionUrl` | `string` | Non | Lien de redirection applicative optionnel. |
| `metadata` | `Record<string, any>` | Non | Métadonnées contextuelles additionnelles. |

---

## 3. Règles de Sécurité Firestore (`firestore.rules`)

```javascript
match /notifications/{notificationId} {
  function isTargetedNotification() {
    return (
      (resource.data.get('targetUserId', '') != '' && resource.data.get('targetUserId', '') == request.auth.uid) ||
      (resource.data.get('target_user_id', '') != '' && resource.data.get('target_user_id', '') == request.auth.uid) ||
      (resource.data.get('targetRoles', []) is list && getUserRole() in resource.data.get('targetRoles', [])) ||
      (resource.data.get('target_roles', []) is list && getUserRole() in resource.data.get('target_roles', [])) ||
      (resource.data.get('targetRoles', []) is list && isBusinessOwner(getBusinessId(resource.data)) && 'OWNER' in resource.data.get('targetRoles', []))
    );
  }

  // Lecture autorisée uniquement si même tenant et ciblé (ou Super Admin)
  allow read: if isAuthenticated() && (
    isSuperAdmin() ||
    (
      (getBusinessId(resource.data) == getUserBusinessId() || isBusinessOwner(getBusinessId(resource.data))) &&
      isTargetedNotification()
    )
  );

  // Mise à jour restreinte au statut de lecture pour les destinataires
  allow update: if isAuthenticated() && (
    isSuperAdmin() ||
    isBusinessOwner(getBusinessId(resource.data)) ||
    getUserRole() in ['ADMIN', 'OWNER', 'MANAGER'] ||
    (
      (getBusinessId(resource.data) == getUserBusinessId() || isBusinessOwner(getBusinessId(resource.data))) &&
      isTargetedNotification() &&
      request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read', 'updatedAt', 'readAt', 'updated_at', 'read_at'])
    )
  );
}
```

---

## 4. Composants & Hooks

- **`NotificationRepository`** (`src/repositories/NotificationRepository.ts`) : Couche d'accès aux données, normalisation, batch writes, queries résilientes.
- **`useNotifications`** (`src/hooks/useNotifications.ts`) : Hook React branché sur `useRealtimeSubscription` avec filtrage RLS client réactif, gestion d'état des filtres et actions CRUD.
- **`NotificationCenter`** (`src/components/notifications/NotificationCenter.tsx`) : Interface utilisateur moderne avec toolbar de filtrage (type, date preset, statut de lecture, recherche), cartes de notifications interactives et traductions trilingues (FR, EN, HT).
