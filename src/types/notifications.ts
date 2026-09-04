import { Role } from "../types";

export type NotificationType = 
  | "ALL"
  | "CRITICAL"
  | "FINANCE"
  | "ATTENDANCE"
  | "HR"
  | "SECURITY"
  | "SYSTEM"
  | "PAYROLL"
  | "INFO"
  | "ALERT";

export type NotificationSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "INFO" | "WARNING" | "ERROR";

export interface AppNotification {
  id: string;
  businessId: string;
  business_id?: string;
  targetRoles?: Role[];
  target_roles?: Role[];
  targetUserId?: string;
  target_user_id?: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  createdAt: string;
  created_at?: string;
  read: boolean;
  readAt?: string;
  read_at?: string;
  sourceId?: string;
  source_id?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  updatedAt?: string;
  updated_at?: string;
}

export interface CreateNotificationDTO {
  businessId: string;
  targetRoles?: Role[];
  targetUserId?: string;
  type: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  sourceId?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  read?: boolean;
  createdAt?: string;
}

export interface NotificationFilters {
  type?: NotificationType | string;
  severity?: NotificationSeverity | string;
  read?: boolean | "ALL" | "UNREAD" | "READ";
  startDate?: string | Date;
  endDate?: string | Date;
  dateRangePreset?: "ALL" | "TODAY" | "7_DAYS" | "30_DAYS";
  targetRole?: Role;
  targetUserId?: string;
  searchQuery?: string;
}

export interface NotificationQueryOptions {
  limitCount?: number;
  orderByField?: "createdAt" | "title" | "severity";
  orderDirection?: "asc" | "desc";
}
