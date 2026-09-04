import { useState, useMemo, useCallback } from "react";
import { useRealtimeSubscription, QueryFilter } from "./useRealtimeSubscription";
import { NotificationRepository } from "../repositories/NotificationRepository";
import { 
  AppNotification, 
  CreateNotificationDTO, 
  NotificationFilters, 
  NotificationType, 
  NotificationSeverity 
} from "../types/notifications";
import { Role } from "../types";
import { useIdentity } from "../modules/identity/IdentityContext";
import { toast } from "sonner";

export interface UseNotificationsOptions {
  limitCount?: number;
  initialFilterType?: NotificationType | "ALL";
  initialFilterRead?: boolean | "ALL" | "UNREAD" | "READ";
  initialDatePreset?: "ALL" | "TODAY" | "7_DAYS" | "30_DAYS";
  enabled?: boolean;
}

export function useNotifications(
  explicitBusinessId?: string,
  initialFilters?: NotificationFilters,
  options: UseNotificationsOptions = {}
) {
  const { identity } = useIdentity();
  
  const currentBusinessId = explicitBusinessId || identity?.business?.id || (identity as any)?.businessId || "";
  const currentRole = (identity?.role || "UNASSIGNED") as Role;
  const currentUserId = identity?.user_uid || "";

  // Local state for dynamic UI filters
  const [filterType, setFilterType] = useState<NotificationType | "ALL">(
    initialFilters?.type as NotificationType || options.initialFilterType || "ALL"
  );
  const [filterRead, setFilterRead] = useState<boolean | "ALL" | "UNREAD" | "READ">(
    initialFilters?.read !== undefined ? initialFilters.read : (options.initialFilterRead ?? "ALL")
  );
  const [filterSeverity, setFilterSeverity] = useState<NotificationSeverity | "ALL">(
    (initialFilters?.severity as NotificationSeverity) || "ALL"
  );
  const [datePreset, setDatePreset] = useState<"ALL" | "TODAY" | "7_DAYS" | "30_DAYS">(
    initialFilters?.dateRangePreset || options.initialDatePreset || "ALL"
  );
  const [startDate, setStartDate] = useState<string | undefined>(
    typeof initialFilters?.startDate === "string" ? initialFilters.startDate : undefined
  );
  const [endDate, setEndDate] = useState<string | undefined>(
    typeof initialFilters?.endDate === "string" ? initialFilters.endDate : undefined
  );
  const [searchQuery, setSearchQuery] = useState<string>(initialFilters?.searchQuery || "");

  // Realtime subscription filters for Firestore
  const subscriptionFilters = useMemo(() => {
    const filters: QueryFilter[] = [];
    if (currentBusinessId) {
      filters.push({
        field: "businessId",
        operator: "==",
        value: currentBusinessId
      });
    }
    return filters;
  }, [currentBusinessId]);

  // Combined filters object for in-memory and repository filtering
  const activeFilters: NotificationFilters = useMemo(() => ({
    type: filterType,
    read: filterRead,
    severity: filterSeverity,
    dateRangePreset: datePreset,
    startDate,
    endDate,
    searchQuery,
    targetRole: currentRole,
    targetUserId: currentUserId
  }), [
    filterType, 
    filterRead, 
    filterSeverity, 
    datePreset, 
    startDate, 
    endDate, 
    searchQuery, 
    currentRole, 
    currentUserId
  ]);

  // Hook into realtime manager
  const { 
    data: rawData, 
    loading, 
    error, 
    refresh 
  } = useRealtimeSubscription<any>(
    "notifications",
    subscriptionFilters,
    {
      enabled: Boolean(currentBusinessId) && (options.enabled ?? true),
      businessId: currentBusinessId,
      limitCount: options.limitCount || 200,
      orderByField: "createdAt",
      orderDirection: "desc",
      deps: [currentBusinessId, filterType, filterRead, datePreset]
    }
  );

  // Normalize and apply exact RLS + multi-criteria filtering
  const { notifications, allUserNotifications, unreadCount } = useMemo(() => {
    if (!rawData || !Array.isArray(rawData)) {
      return { notifications: [], allUserNotifications: [], unreadCount: 0 };
    }

    const mapped = rawData.map((docItem) => NotificationRepository.mapDoc(docItem.id, docItem));
    
    // User context for RLS evaluation
    const userCtx = {
      uid: currentUserId,
      role: currentRole
    };

    // 1. First extract all notifications the user has rights to see (RLS compliance)
    const userAccessible = mapped.filter((item) => 
      NotificationRepository.matchesFilters(item, undefined, userCtx)
    );

    // 2. Compute unread count for user accessible notifications
    const unread = userAccessible.filter((n) => !n.read).length;

    // 3. Apply active UI filters (type, read status, date range, search)
    const filtered = userAccessible.filter((item) => 
      NotificationRepository.matchesFilters(item, activeFilters, userCtx)
    );

    // Sort descending by createdAt
    filtered.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    return {
      notifications: filtered,
      allUserNotifications: userAccessible,
      unreadCount: unread
    };
  }, [rawData, currentUserId, currentRole, activeFilters]);

  // Mark single notification as read
  const markAsRead = useCallback(async (id: string, read = true) => {
    try {
      await NotificationRepository.markAsRead(id, read);
    } catch (err: any) {
      console.error("[useNotifications] Failed to mark notification as read:", err);
      toast.error("Erreur lors de la mise à jour de la notification");
      throw err;
    }
  }, []);

  // Mark all currently filtered/accessible unread notifications as read
  const markAllAsRead = useCallback(async () => {
    if (!currentBusinessId) return;
    try {
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
      if (unreadIds.length === 0) return;

      await NotificationRepository.markAllAsRead(currentBusinessId, {
        userId: currentUserId,
        role: currentRole,
        notificationIds: unreadIds
      });
      toast.success("Toutes les notifications ont été marquées comme lues");
    } catch (err: any) {
      console.error("[useNotifications] Failed to mark all as read:", err);
      toast.error("Impossible de marquer toutes les notifications comme lues");
      throw err;
    }
  }, [currentBusinessId, notifications, currentUserId, currentRole]);

  // Delete notification
  const deleteNotification = useCallback(async (id: string) => {
    try {
      await NotificationRepository.delete(id);
      toast.success("Notification supprimée");
    } catch (err: any) {
      console.error("[useNotifications] Failed to delete notification:", err);
      toast.error("Impossible de supprimer la notification");
      throw err;
    }
  }, []);

  // Create new notification
  const createNotification = useCallback(async (dto: CreateNotificationDTO) => {
    try {
      const id = await NotificationRepository.create({
        ...dto,
        businessId: dto.businessId || currentBusinessId
      });
      return id;
    } catch (err: any) {
      console.error("[useNotifications] Failed to create notification:", err);
      toast.error("Erreur lors de la création de la notification");
      throw err;
    }
  }, [currentBusinessId]);

  return {
    notifications,
    allUserNotifications,
    unreadCount,
    loading,
    error,
    refresh,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    createNotification,
    // Filter controls
    filterType,
    setFilterType,
    filterRead,
    setFilterRead,
    filterSeverity,
    setFilterSeverity,
    datePreset,
    setDatePreset,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    searchQuery,
    setSearchQuery
  };
}
