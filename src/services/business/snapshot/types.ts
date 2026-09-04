import { Business, Branch, Department, Role, BusinessSettings } from "../../../types/organization";

export interface BusinessSnapshot {
  snapshotVersion: string;
  schemaVersion: string;
  generatedAt: string;
  generatedBy: string;
  refreshToken: string;
  checksum: string;
  isFrozen?: boolean;
  isSealed?: boolean;
  data: {
    business: Business;
    branches: Branch[];
    departments: Department[];
    roles: Role[];
    settings: BusinessSettings;
  };
}

export type SnapshotState = 'EMPTY' | 'BUILDING' | 'READY' | 'STALE' | 'REFRESHING' | 'FAILED';
