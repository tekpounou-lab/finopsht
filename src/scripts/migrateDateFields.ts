/**
 * FINOPS ERP - One-Time Firestore Date Normalization Migration Utility
 * 
 * Safely iterates through target collections and updates date fields to strict YYYY-MM-DD
 * format using the toDateOnly SSOT engine.
 */

import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toDateOnly } from '../utils/dateNormalization';

export interface MigrationReport {
  collection: string;
  scanned: number;
  migrated: number;
  skipped: number;
  errors: number;
}

export async function migrateCollectionDateFields(
  collectionName: string,
  dateFields: string[]
): Promise<MigrationReport> {
  const report: MigrationReport = {
    collection: collectionName,
    scanned: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    const snap = await getDocs(collection(db, collectionName));
    report.scanned = snap.docs.length;

    let batch = writeBatch(db);
    let batchCount = 0;

    for (const d of snap.docs) {
      const data = d.data();
      const updates: Record<string, any> = {};
      let needsUpdate = false;

      for (const field of dateFields) {
        if (data[field] !== undefined && data[field] !== null) {
          const rawVal = data[field];
          const normalized = toDateOnly(rawVal);

          // If raw date differs from normalized YYYY-MM-DD, stage update
          if (normalized && normalized !== rawVal) {
            updates[field] = normalized;
            needsUpdate = true;
          }
        }
      }

      if (needsUpdate) {
        batch.update(doc(db, collectionName, d.id), updates);
        batchCount++;
        report.migrated++;

        if (batchCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      } else {
        report.skipped++;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
  } catch (error) {
    console.error(`[DateMigration] Error migrating collection ${collectionName}:`, error);
    report.errors++;
  }

  return report;
}

/**
 * Master migration runner for all core collections
 */
export async function runAllDateMigrations(): Promise<MigrationReport[]> {
  console.info('[DateMigration] Starting full date normalization migration...');

  const migrations = [
    { name: 'ledger_transactions', fields: ['date', 'effectiveDate'] },
    { name: 'payroll_records', fields: ['periodStartDate', 'periodEndDate', 'effectiveDate'] },
    { name: 'payroll_cycles', fields: ['startDate', 'endDate'] },
    { name: 'attendance_records', fields: ['date'] },
    { name: 'leaves', fields: ['startDate', 'endDate'] },
    { name: 'invoices', fields: ['issueDate', 'dueDate'] },
    { name: 'proformas', fields: ['issueDate', 'dueDate'] },
    { name: 'employees', fields: ['hireDate', 'terminationDate', 'birthDate'] },
  ];

  const reports: MigrationReport[] = [];

  for (const m of migrations) {
    console.info(`[DateMigration] Processing collection: ${m.name}`);
    const report = await migrateCollectionDateFields(m.name, m.fields);
    reports.push(report);
  }

  console.info('[DateMigration] Completed full date normalization migration.', reports);
  return reports;
}
