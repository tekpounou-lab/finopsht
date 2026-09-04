import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  writeBatch, 
  onSnapshot,
  QueryConstraint
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { 
  AppNotification, 
  CreateNotificationDTO, 
  NotificationFilters, 
  NotificationQueryOptions,
  NotificationType
} from "../types/notifications";
import { Role } from "../types";
import { resilientGetDocs, resilientGetDoc } from "../utils/resilientFirestore";

export class NotificationRepository {
  private static readonly COLLECTION_NAME = "notifications";

  /**
   * Safely converts any Firestore timestamp, Date, number, or string into an ISO 8601 string.
   */
  public static parseIsoDate(val: any, fallback?: string): string {
    if (!val) return fallback || new Date().toISOString();
    try {
      if (typeof val === "string") {
        const d = new Date(val);
        return !isNaN(d.getTime()) ? d.toISOString() : val;
      }
      if (typeof val === "number") {
        return new Date(val).toISOString();
      }
      if (val instanceof Date) {
        return isNaN(val.getTime()) ? (fallback || new Date().toISOString()) : val.toISOString();
      }
      if (typeof val.toDate === "function") {
        const d = val.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : (fallback || new Date().toISOString());
      }
      if (typeof val.seconds === "number") {
        const millis = val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1000000);
        return new Date(millis).toISOString();
      }
      if (typeof val._seconds === "number") {
        const millis = val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1000000);
        return new Date(millis).toISOString();
      }
      const str = String(val);
      const parsed = new Date(str);
      return !isNaN(parsed.getTime()) ? parsed.toISOString() : (fallback || new Date().toISOString());
    } catch {
      return fallback || new Date().toISOString();
    }
  }

  /**
   * Normalize raw Firestore document into typed AppNotification
   */
  public static mapDoc(id: string, data: any): AppNotification {
    const bizId = String(data.businessId || data.business_id || "");
    const rawRoles = data.targetRoles || data.target_roles || [];
    const targetRoles: Role[] = Array.isArray(rawRoles) 
      ? rawRoles.filter((r): r is Role => typeof r === "string") 
      : [];
    const targetUserId = data.targetUserId ? String(data.targetUserId) : (data.target_user_id ? String(data.target_user_id) : undefined);
    
    const rawCreatedAt = data.createdAt ?? data.created_at ?? data.timestamp;
    const createdAt = this.parseIsoDate(rawCreatedAt);

    const read = typeof data.read === "boolean" ? data.read : false;
    const rawReadAt = data.readAt ?? data.read_at;
    const readAt = rawReadAt ? this.parseIsoDate(rawReadAt) : undefined;

    const rawUpdatedAt = data.updatedAt ?? data.updated_at;
    const updatedAt = rawUpdatedAt ? this.parseIsoDate(rawUpdatedAt) : undefined;

    const type: NotificationType = typeof data.type === "string" ? data.type as NotificationType : "INFO";
    const severity = typeof data.severity === "string" ? data.severity as any : "INFO";
    const title = typeof data.title === "string" ? data.title : (data.title ? String(data.title) : "Notification");
    const message = typeof data.message === "string" ? data.message : (data.message ? String(data.message) : "");
    const sourceId = data.sourceId ? String(data.sourceId) : (data.source_id ? String(data.source_id) : undefined);

    return {
      id: String(id),
      businessId: bizId,
      business_id: bizId,
      targetRoles,
      target_roles: targetRoles,
      targetUserId,
      target_user_id: targetUserId,
      type,
      severity,
      title,
      message,
      createdAt,
      created_at: createdAt,
      read,
      readAt,
      read_at: readAt,
      sourceId,
      source_id: sourceId,
      actionUrl: typeof data.actionUrl === "string" ? data.actionUrl : undefined,
      metadata: typeof data.metadata === "object" && data.metadata !== null ? data.metadata : {},
      updatedAt,
      updated_at: updatedAt
    };
  }

  /**
   * Filter in-memory to guarantee exact RLS matching, text search, date presets, and role containment
   */
  public static matchesFilters(
    notif: AppNotification, 
    filters?: NotificationFilters,
    userContext?: { uid?: string; role?: Role }
  ): boolean {
    // 1. RLS Role/User Filtering
    if (userContext) {
      const isSuperAdmin = userContext.role === "SUPER_ADMIN";
      if (!isSuperAdmin) {
        const isOwner = userContext.role === "OWNER";
        const hasMatchingUserId = Boolean(
          userContext.uid && 
          notif.targetUserId && 
          notif.targetUserId === userContext.uid
        );

        const hasMatchingRole = Boolean(
          userContext.role && 
          notif.targetRoles && 
          notif.targetRoles.length > 0 &&
          (notif.targetRoles.includes(userContext.role) || (isOwner && notif.targetRoles.includes("OWNER")))
        );

        const isBroadBroadcast = (!notif.targetUserId && (!notif.targetRoles || notif.targetRoles.length === 0));

        if (!hasMatchingUserId && !hasMatchingRole && !isBroadBroadcast) {
          return false;
        }
      }
    }

    if (!filters) return true;

    // 2. Type Filter
    if (filters.type && filters.type !== "ALL") {
      if (Array.isArray(filters.type)) {
        if (!filters.type.includes(notif.type)) return false;
      } else {
        if (notif.type !== filters.type) return false;
      }
    }

    // 3. Read Status Filter
    if (filters.read !== undefined && filters.read !== "ALL") {
      if (typeof filters.read === "boolean") {
        if (notif.read !== filters.read) return false;
      } else if (filters.read === "UNREAD") {
        if (notif.read !== false) return false;
      } else if (filters.read === "READ") {
        if (notif.read !== true) return false;
      }
    }

    // 4. Severity Filter
    if (filters.severity && filters.severity !== "ALL") {
      if (notif.severity !== filters.severity) return false;
    }

    // 5. Date Range & Presets Filter
    const notifTime = new Date(notif.createdAt).getTime();
    if (!isNaN(notifTime)) {
      const now = Date.now();
      if (filters.dateRangePreset === "TODAY") {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        if (notifTime < startOfToday.getTime()) return false;
      } else if (filters.dateRangePreset === "7_DAYS") {
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        if (notifTime < sevenDaysAgo) return false;
      } else if (filters.dateRangePreset === "30_DAYS") {
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
        if (notifTime < thirtyDaysAgo) return false;
      }

      if (filters.startDate) {
        const startTime = new Date(filters.startDate).getTime();
        if (!isNaN(startTime) && notifTime < startTime) return false;
      }

      if (filters.endDate) {
        const endTime = new Date(filters.endDate).getTime();
        if (!isNaN(endTime) && notifTime > endTime) return false;
      }
    }

    // 6. Search Query (Title, Message, SourceId)
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      const matchTitle = notif.title.toLowerCase().includes(q);
      const matchMessage = notif.message.toLowerCase().includes(q);
      const matchSource = notif.sourceId ? notif.sourceId.toLowerCase().includes(q) : false;
      const matchType = notif.type.toLowerCase().includes(q);
      if (!matchTitle && !matchMessage && !matchSource && !matchType) return false;
    }

    return true;
  }

  /**
   * List notifications for a business with dynamic Firestore queries and RLS safety
   */
  public static async list(
    businessId: string, 
    filters?: NotificationFilters,
    options?: NotificationQueryOptions,
    userContext?: { uid?: string; role?: Role }
  ): Promise<AppNotification[]> {
    if (!businessId) return [];

    try {
      const constraints: QueryConstraint[] = [
        where("businessId", "==", businessId)
      ];

      // Dynamic type filter at Firestore layer if single type specified
      if (filters?.type && filters.type !== "ALL" && !Array.isArray(filters.type)) {
        constraints.push(where("type", "==", filters.type));
      }

      // Dynamic read filter at Firestore layer if boolean
      if (typeof filters?.read === "boolean") {
        constraints.push(where("read", "==", filters.read));
      }

      const limitCount = options?.limitCount || 100;
      
      // Attempt query with orderBy createdAt
      let q = query(
        collection(db, this.COLLECTION_NAME),
        ...constraints,
        orderBy(options?.orderByField || "createdAt", options?.orderDirection || "desc"),
        limit(limitCount)
      );

      let snap = await resilientGetDocs(q).catch(async (err) => {
        console.warn("[NotificationRepository] Primary query fallback without orderBy:", err);
        // Fallback query without compound order by to prevent missing index errors
        const fallbackQ = query(
          collection(db, this.COLLECTION_NAME),
          ...constraints,
          limit(limitCount)
        );
        return await resilientGetDocs(fallbackQ);
      });

      // Also check business_id snake_case in case legacy documents exist
      if (!snap || snap.empty) {
        const legacyQ = query(
          collection(db, this.COLLECTION_NAME),
          where("business_id", "==", businessId),
          limit(limitCount)
        );
        const legacySnap = await resilientGetDocs(legacyQ).catch(() => null);
        if (legacySnap && !legacySnap.empty) {
          snap = legacySnap;
        }
      }

      const items: AppNotification[] = [];
      if (snap && !snap.empty) {
        snap.docs.forEach((docSnap) => {
          const item = this.mapDoc(docSnap.id, docSnap.data());
          if (this.matchesFilters(item, filters, userContext)) {
            items.push(item);
          }
        });
      }

      // Sort in-memory desc by createdAt
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return items;
    } catch (error) {
      console.error("[NotificationRepository] Error in list():", error);
      return [];
    }
  }

  /**
   * Get single notification by ID
   */
  public static async getById(notificationId: string): Promise<AppNotification | null> {
    if (!notificationId) return null;
    try {
      const snap = await resilientGetDoc(doc(db, this.COLLECTION_NAME, notificationId));
      if (!snap || !snap.exists()) return null;
      return this.mapDoc(snap.id, snap.data());
    } catch (error) {
      console.error("[NotificationRepository] Error in getById():", error);
      return null;
    }
  }

  /**
   * Create a new notification document
   */
  public static async create(dto: CreateNotificationDTO): Promise<string> {
    if (!dto.businessId) throw new Error("businessId is required for notification");

    const now = dto.createdAt || new Date().toISOString();
    const docRef = doc(collection(db, this.COLLECTION_NAME));
    const payload: Partial<AppNotification> = {
      id: docRef.id,
      businessId: dto.businessId,
      business_id: dto.businessId,
      targetRoles: dto.targetRoles || [],
      target_roles: dto.targetRoles || [],
      targetUserId: dto.targetUserId || undefined,
      target_user_id: dto.targetUserId || undefined,
      type: dto.type || "INFO",
      severity: dto.severity || "INFO",
      title: dto.title,
      message: dto.message,
      createdAt: now,
      created_at: now,
      read: dto.read || false,
      sourceId: dto.sourceId || undefined,
      actionUrl: dto.actionUrl || undefined,
      metadata: dto.metadata || {},
      updatedAt: now
    };

    await setDoc(docRef, payload);
    return docRef.id;
  }

  /**
   * Mark a single notification as read or unread
   */
  public static async markAsRead(notificationId: string, read = true): Promise<void> {
    if (!notificationId) return;
    const now = new Date().toISOString();
    const docRef = doc(db, this.COLLECTION_NAME, notificationId);
    await updateDoc(docRef, {
      read,
      readAt: read ? now : null,
      read_at: read ? now : null,
      updatedAt: now,
      updated_at: now
    });
  }

  /**
   * Mark all notifications as read using writeBatch
   */
  public static async markAllAsRead(
    businessId: string,
    targetContext?: { userId?: string; role?: Role; notificationIds?: string[] }
  ): Promise<void> {
    if (!businessId) return;

    try {
      const now = new Date().toISOString();
      let targetIds: string[] = targetContext?.notificationIds || [];

      // If specific IDs are not provided, query unread notifications for the business
      if (targetIds.length === 0) {
        const unreadItems = await this.list(
          businessId, 
          { read: false }, 
          { limitCount: 100 },
          targetContext ? { uid: targetContext.userId, role: targetContext.role } : undefined
        );
        targetIds = unreadItems.map((n) => n.id);
      }

      if (targetIds.length === 0) return;

      // Split in chunks of 450 to stay within Firestore 500 operations batch limit
      const chunkSize = 450;
      for (let i = 0; i < targetIds.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = targetIds.slice(i, i + chunkSize);
        chunk.forEach((id) => {
          const docRef = doc(db, this.COLLECTION_NAME, id);
          batch.update(docRef, {
            read: true,
            readAt: now,
            read_at: now,
            updatedAt: now,
            updated_at: now
          });
        });
        await batch.commit();
      }
    } catch (error) {
      console.error("[NotificationRepository] Error in markAllAsRead():", error);
      throw error;
    }
  }

  /**
   * Delete a notification document
   */
  public static async delete(notificationId: string): Promise<void> {
    if (!notificationId) return;
    await deleteDoc(doc(db, this.COLLECTION_NAME, notificationId));
  }

  /**
   * Get total unread count for user and business
   */
  public static async getUnreadCount(
    businessId: string, 
    userContext?: { uid?: string; role?: Role }
  ): Promise<number> {
    if (!businessId) return 0;
    const unread = await this.list(
      businessId, 
      { read: false }, 
      { limitCount: 200 }, 
      userContext
    );
    return unread.length;
  }
}
