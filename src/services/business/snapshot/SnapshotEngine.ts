import { BusinessSnapshot, SnapshotState } from "./types";
import { ResolverSnapshot } from "../BusinessResolver";
import { sha256Sync } from "../../analytics/TransactionDeduplicationService";
import { EventBus } from "../../../modules/runtime/EventBus";
import { ForensicLogRepository } from "../../../repositories/ForensicLogRepository";

export class SnapshotEngine {
  private static currentState: SnapshotState = 'EMPTY';
  private static lastSnapshot: BusinessSnapshot | null = null;

  static async build(resolverSnapshot: ResolverSnapshot): Promise<BusinessSnapshot> {
    this.currentState = 'BUILDING';
    console.log("[SnapshotEngine] Building snapshot...");

    try {
      if (!resolverSnapshot.business) throw new Error("Missing business data");

      const generatedAt = new Date().toISOString();
      const rawDataString = JSON.stringify({
        businessId: resolverSnapshot.business.id,
        businessName: resolverSnapshot.business.name,
        branchCount: resolverSnapshot.branches.length,
        deptCount: resolverSnapshot.departments.length,
        generatedAt
      });
      const checksumHex = sha256Sync(rawDataString);

      const snapshot: BusinessSnapshot = {
        snapshotVersion: "1.0.0",
        schemaVersion: "1.0.0",
        generatedAt,
        generatedBy: "BusinessSnapshotEngine",
        refreshToken: Math.random().toString(36).substring(7),
        checksum: `sha256:${checksumHex}`,
        isFrozen: true,
        isSealed: true,
        data: {
          business: resolverSnapshot.business,
          branches: resolverSnapshot.branches,
          departments: resolverSnapshot.departments,
          roles: resolverSnapshot.roles,
          settings: resolverSnapshot.settings || {} as any
        }
      };

      this.lastSnapshot = snapshot;
      this.currentState = 'READY';
      console.log("[SnapshotEngine] Sealed snapshot built successfully with checksum:", snapshot.checksum);

      // Publish event on EventBus
      try {
        EventBus.publish(
          EventBus.createEvent({
            correlationId: `snap_rebuilt_${snapshot.data.business.id}_${Date.now()}`,
            businessId: snapshot.data.business.id,
            module: "ANALYTICS",
            aggregate: "BusinessSnapshot",
            type: "ANALYTICS_SNAPSHOT_REBUILT",
            payload: {
              businessId: snapshot.data.business.id,
              checksum: snapshot.checksum,
              isFrozen: true,
              isSealed: true,
              timestamp: generatedAt,
            },
          })
        );
      } catch (busErr) {
        console.warn("[SnapshotEngine] Failed to publish event on EventBus:", busErr);
      }

      // Record Forensic Audit Log
      try {
        const forensicLog = await ForensicLogRepository.createAndSignLog({
          business_id: snapshot.data.business.id,
          timestamp: generatedAt,
          userId: "SYSTEM_SNAPSHOT_ENGINE",
          userName: "SYSTEM_SNAPSHOT_ENGINE",
          userEmail: "system@finops.internal",
          userRole: "SYSTEM",
          action: "SNAPSHOT_REBUILT_AND_SEALED",
          details: `Immutable business snapshot rebuilt and sealed. Checksum: ${snapshot.checksum}`,
          ipAddress: "127.0.0.1",
          userAgent: "FinOps-SnapshotEngine/1.0",
        });
        await ForensicLogRepository.writeForensicLog(forensicLog);
      } catch (forensicErr) {
        console.warn("[SnapshotEngine] Failed to record forensic audit log:", forensicErr);
      }

      return snapshot;
    } catch (error) {
      this.currentState = 'FAILED';
      console.error("[SnapshotEngine] Failed to build snapshot", error);
      throw error;
    }
  }

  static getState(): SnapshotState {
    return this.currentState;
  }

  static getLastSnapshot(): BusinessSnapshot | null {
    return this.lastSnapshot;
  }
}
