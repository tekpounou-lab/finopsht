import { describe, it, expect } from "vitest";
import { NotificationRepository } from "../repositories/NotificationRepository";
import { AppNotification } from "../types/notifications";

describe("NotificationRepository - Filter & RLS Logic", () => {
  const sampleNotifications: AppNotification[] = [
    {
      id: "notif-superadmin",
      businessId: "biz-1",
      targetRoles: ["SUPER_ADMIN"],
      type: "SYSTEM",
      severity: "HIGH",
      title: "Super Admin Platform Update",
      message: "Infrastructure migration completed.",
      createdAt: new Date().toISOString(),
      read: false
    },
    {
      id: "notif-owner-payroll",
      businessId: "biz-1",
      targetRoles: ["OWNER", "MANAGER"],
      type: "PAYROLL",
      severity: "CRITICAL",
      title: "Anomalie Paie Décembre",
      message: "Écart de 5,000 HTG détecté sur le grand livre.",
      createdAt: new Date().toISOString(),
      read: false
    },
    {
      id: "notif-employee-direct",
      businessId: "biz-1",
      targetUserId: "user-123",
      type: "HR",
      severity: "INFO",
      title: "Bulletin disponible",
      message: "Votre bulletin de paie est prêt.",
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
      read: true
    }
  ];

  it("should block Owner from seeing Super Admin targeted notifications (RLS)", () => {
    const ownerContext = { uid: "owner-999", role: "OWNER" as const };
    const superAdminNotif = sampleNotifications[0];
    const canOwnerSee = NotificationRepository.matchesFilters(superAdminNotif, undefined, ownerContext);
    expect(canOwnerSee).toBe(false);
  });

  it("should allow Super Admin to see any notification (RLS)", () => {
    const superAdminContext = { uid: "super-1", role: "SUPER_ADMIN" as const };
    const canSuperAdminSeeAll = sampleNotifications.every((n) =>
      NotificationRepository.matchesFilters(n, undefined, superAdminContext)
    );
    expect(canSuperAdminSeeAll).toBe(true);
  });

  it("should allow target user to see direct user notifications", () => {
    const targetUserCtx = { uid: "user-123", role: "EMPLOYEE" as const };
    const otherUserCtx = { uid: "user-456", role: "EMPLOYEE" as const };

    const directNotif = sampleNotifications[2];
    expect(NotificationRepository.matchesFilters(directNotif, undefined, targetUserCtx)).toBe(true);
    expect(NotificationRepository.matchesFilters(directNotif, undefined, otherUserCtx)).toBe(false);
  });

  it("should filter notifications by type correctly", () => {
    const payrollOnly = sampleNotifications.filter((n) =>
      NotificationRepository.matchesFilters(n, { type: "PAYROLL" })
    );
    expect(payrollOnly.length).toBe(1);
    expect(payrollOnly[0].id).toBe("notif-owner-payroll");
  });

  it("should filter notifications by read status correctly", () => {
    const unreadOnly = sampleNotifications.filter((n) =>
      NotificationRepository.matchesFilters(n, { read: "UNREAD" })
    );
    expect(unreadOnly.length).toBe(2);

    const readOnly = sampleNotifications.filter((n) =>
      NotificationRepository.matchesFilters(n, { read: "READ" })
    );
    expect(readOnly.length).toBe(1);
    expect(readOnly[0].id).toBe("notif-employee-direct");
  });

  it("should filter notifications by date presets (e.g. 7_DAYS)", () => {
    const last7Days = sampleNotifications.filter((n) =>
      NotificationRepository.matchesFilters(n, { dateRangePreset: "7_DAYS" })
    );
    // Notification from 10 days ago should be excluded
    expect(last7Days.map((n) => n.id)).not.toContain("notif-employee-direct");
    expect(last7Days.length).toBe(2);
  });

  it("should search across title, message, and type", () => {
    const searchAnomalie = sampleNotifications.filter((n) =>
      NotificationRepository.matchesFilters(n, { searchQuery: "anomalie" })
    );
    expect(searchAnomalie.length).toBe(1);
    expect(searchAnomalie[0].id).toBe("notif-owner-payroll");
  });

  it("should properly normalize doc data with Firestore Timestamp objects via mapDoc", () => {
    const rawDataWithTimestamp = {
      business_id: "biz-test",
      target_roles: ["MANAGER"],
      createdAt: { seconds: 1785500000, nanoseconds: 0 },
      readAt: { _seconds: 1785503600, _nanoseconds: 0 },
      read: true,
      title: "Test Alert Timestamp",
      message: "Testing Firestore Timestamp parsing",
      type: "FINANCE"
    };

    const mapped = NotificationRepository.mapDoc("doc-timestamp", rawDataWithTimestamp);
    expect(mapped.id).toBe("doc-timestamp");
    expect(typeof mapped.createdAt).toBe("string");
    expect(mapped.createdAt).toBe(new Date(1785500000 * 1000).toISOString());
    expect(typeof mapped.readAt).toBe("string");
    expect(mapped.readAt).toBe(new Date(1785503600 * 1000).toISOString());
  });

  it("should properly normalize doc data with toDate() method on Timestamp", () => {
    const fakeDate = new Date("2026-08-15T08:30:00.000Z");
    const rawData = {
      businessId: "biz-test",
      createdAt: { toDate: () => fakeDate },
      title: "Timestamp with toDate",
      message: "Testing toDate()"
    };

    const mapped = NotificationRepository.mapDoc("doc-todate", rawData);
    expect(typeof mapped.createdAt).toBe("string");
    expect(mapped.createdAt).toBe("2026-08-15T08:30:00.000Z");
  });
});
