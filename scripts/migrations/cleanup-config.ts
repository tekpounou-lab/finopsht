/**
 * FINOPS ERP — Configuration des Règles de Nettoyage et Normalisation (Phase 2)
 * 
 * Définit pour chaque collection Firestore :
 * 1. Les champs dupliqués/obsolètes à supprimer (`fieldsToRemove`) avec le champ canonique à conserver (`keepField`).
 * 2. Les règles de validation et de réparation des clés étrangères (`foreignKeyRules`).
 * 3. Les transformations et purges SSOT spécifiques (ex: totalGrossHtg, isPaid).
 */

export interface DuplicateFieldRule {
  fieldToRemove: string;
  fieldToKeep: string;
  fallbackIfKeepMissing?: boolean;
  description: string;
}

export interface ForeignKeyRepairRule {
  field: string;
  foreignCollection: string;
  tenantScoped: boolean;
  fallbackStrategy: "FIRST_OF_TENANT" | "NULL" | "WARN_ONLY";
  description: string;
}

export interface CollectionCleanupConfig {
  collectionName: string;
  duplicateRules: DuplicateFieldRule[];
  obsoleteFieldsToRemove?: string[];
  foreignKeyRules: ForeignKeyRepairRule[];
  customTransform?: (data: Record<string, any>) => {
    updates: Record<string, any>;
    removedFieldsCount: number;
    logMessage?: string;
  };
}

export const CLEANUP_CONFIG: Record<string, CollectionCleanupConfig> = {
  users: {
    collectionName: "users",
    duplicateRules: [
      {
        fieldToRemove: "business_id",
        fieldToKeep: "businessId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessId'"
      },
      {
        fieldToRemove: "employee_id",
        fieldToKeep: "employeeId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'employeeId'"
      },
      {
        fieldToRemove: "branch_id",
        fieldToKeep: "branchId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'branchId'"
      },
      {
        fieldToRemove: "department_id",
        fieldToKeep: "departmentId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'departmentId'"
      },
      {
        fieldToRemove: "display_name",
        fieldToKeep: "displayName",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'displayName'"
      },
      {
        fieldToRemove: "account_status",
        fieldToKeep: "accountStatus",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'accountStatus'"
      },
      {
        fieldToRemove: "business_status",
        fieldToKeep: "businessStatus",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessStatus'"
      },
      {
        fieldToRemove: "onboarding_completed",
        fieldToKeep: "onboardingComplete",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'onboardingComplete'"
      },
      {
        fieldToRemove: "created_at",
        fieldToKeep: "createdAt",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'createdAt'"
      },
      {
        fieldToRemove: "updated_at",
        fieldToKeep: "updatedAt",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'updatedAt'"
      }
    ],
    foreignKeyRules: []
  },

  businesses: {
    collectionName: "businesses",
    duplicateRules: [
      {
        fieldToRemove: "owner_id",
        fieldToKeep: "ownerId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'ownerId'"
      },
      {
        fieldToRemove: "owner_employee_id",
        fieldToKeep: "ownerEmployeeId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'ownerEmployeeId'"
      },
      {
        fieldToRemove: "created_at",
        fieldToKeep: "createdAt",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'createdAt'"
      },
      {
        fieldToRemove: "updated_at",
        fieldToKeep: "updatedAt",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'updatedAt'"
      }
    ],
    foreignKeyRules: []
  },

  branches: {
    collectionName: "branches",
    duplicateRules: [
      {
        fieldToRemove: "business_id",
        fieldToKeep: "businessId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessId'"
      },
      {
        fieldToRemove: "is_active",
        fieldToKeep: "isActive",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'isActive'"
      },
      {
        fieldToRemove: "manager_id",
        fieldToKeep: "managerId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'managerId'"
      },
      {
        fieldToRemove: "created_at",
        fieldToKeep: "createdAt",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'createdAt'"
      },
      {
        fieldToRemove: "updated_at",
        fieldToKeep: "updatedAt",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'updatedAt'"
      }
    ],
    foreignKeyRules: []
  },

  departments: {
    collectionName: "departments",
    duplicateRules: [
      {
        fieldToRemove: "business_id",
        fieldToKeep: "businessId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessId'"
      },
      {
        fieldToRemove: "branch_id",
        fieldToKeep: "branchId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'branchId'"
      },
      {
        fieldToRemove: "business_unit_id",
        fieldToKeep: "businessUnitId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessUnitId'"
      },
      {
        fieldToRemove: "cost_center_id",
        fieldToKeep: "costCenterId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'costCenterId'"
      },
      {
        fieldToRemove: "manager_id",
        fieldToKeep: "managerId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'managerId'"
      },
      {
        fieldToRemove: "is_active",
        fieldToKeep: "isActive",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'isActive'"
      },
      {
        fieldToRemove: "normalized_name",
        fieldToKeep: "normalizedName",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'normalizedName'"
      },
      {
        fieldToRemove: "is_system_generated",
        fieldToKeep: "isSystemGenerated",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'isSystemGenerated'"
      },
      {
        fieldToRemove: "created_by",
        fieldToKeep: "createdBy",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'createdBy'"
      },
      {
        fieldToRemove: "created_at",
        fieldToKeep: "createdAt",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'createdAt'"
      },
      {
        fieldToRemove: "updated_at",
        fieldToKeep: "updatedAt",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'updatedAt'"
      }
    ],
    foreignKeyRules: []
  },

  employees: {
    collectionName: "employees",
    duplicateRules: [
      {
        fieldToRemove: "employee_name",
        fieldToKeep: "name",
        fallbackIfKeepMissing: true,
        description: "Normalisation du nom de l'employé vers 'name'"
      },
      {
        fieldToRemove: "firebase_uid",
        fieldToKeep: "uid",
        fallbackIfKeepMissing: true,
        description: "Normalisation de l'UID Firebase Auth vers 'uid'"
      },
      {
        fieldToRemove: "salaryBaseHtg",
        fieldToKeep: "baseSalary",
        fallbackIfKeepMissing: true,
        description: "Normalisation du salaire de base vers 'baseSalary'"
      },
      {
        fieldToRemove: "salary_base_htg",
        fieldToKeep: "baseSalary",
        fallbackIfKeepMissing: true,
        description: "Suppression du doublon snake_case salary_base_htg"
      },
      {
        fieldToRemove: "base_salary",
        fieldToKeep: "baseSalary",
        fallbackIfKeepMissing: true,
        description: "Suppression du doublon base_salary"
      },
      {
        fieldToRemove: "branch_id",
        fieldToKeep: "branchId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'branchId'"
      },
      {
        fieldToRemove: "department_id",
        fieldToKeep: "departmentId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'departmentId'"
      },
      {
        fieldToRemove: "business_id",
        fieldToKeep: "businessId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessId'"
      },
      {
        fieldToRemove: "display_name",
        fieldToKeep: "displayName",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'displayName'"
      },
      {
        fieldToRemove: "hire_date",
        fieldToKeep: "hireDate",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'hireDate'"
      },
      {
        fieldToRemove: "commission_rate",
        fieldToKeep: "commissionRate",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'commissionRate'"
      },
      {
        fieldToRemove: "payment_model",
        fieldToKeep: "paymentModel",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'paymentModel'"
      },
      {
        fieldToRemove: "contract_type",
        fieldToKeep: "contractType",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'contractType'"
      },
      {
        fieldToRemove: "pay_regime",
        fieldToKeep: "payRegime",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'payRegime'"
      },
      {
        fieldToRemove: "is_active",
        fieldToKeep: "isActive",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'isActive'"
      },
      {
        fieldToRemove: "onboarding_completed",
        fieldToKeep: "onboardingComplete",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'onboardingComplete'"
      },
      {
        fieldToRemove: "created_at",
        fieldToKeep: "createdAt",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'createdAt'"
      },
      {
        fieldToRemove: "updated_at",
        fieldToKeep: "updatedAt",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'updatedAt'"
      }
    ],
    foreignKeyRules: [
      {
        field: "branchId",
        foreignCollection: "branches",
        tenantScoped: true,
        fallbackStrategy: "FIRST_OF_TENANT",
        description: "Assigne la première branche active du tenant si la branche est orpheline"
      },
      {
        field: "departmentId",
        foreignCollection: "departments",
        tenantScoped: true,
        fallbackStrategy: "FIRST_OF_TENANT",
        description: "Assigne le premier département du tenant si orphelin"
      }
    ]
  },

  attendance_records: {
    collectionName: "attendance_records",
    duplicateRules: [
      {
        fieldToRemove: "employee_id",
        fieldToKeep: "employeeId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'employeeId'"
      },
      {
        fieldToRemove: "business_id",
        fieldToKeep: "businessId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessId'"
      },
      {
        fieldToRemove: "branch_id",
        fieldToKeep: "branchId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'branchId'"
      },
      {
        fieldToRemove: "department_id",
        fieldToKeep: "departmentId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'departmentId'"
      }
    ],
    foreignKeyRules: [
      {
        field: "employeeId",
        foreignCollection: "employees",
        tenantScoped: true,
        fallbackStrategy: "WARN_ONLY",
        description: "Vérifie que l'employé existe dans la base"
      }
    ]
  },

  payroll_cycles: {
    collectionName: "payroll_cycles",
    duplicateRules: [
      {
        fieldToRemove: "business_id",
        fieldToKeep: "businessId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessId'"
      },
      {
        fieldToRemove: "totalGrossHtg",
        fieldToKeep: "grossTotal",
        fallbackIfKeepMissing: false,
        description: "Suppression du total brut déprécié"
      },
      {
        fieldToRemove: "totalNetHtg",
        fieldToKeep: "netTotal",
        fallbackIfKeepMissing: false,
        description: "Suppression du total net déprécié"
      }
    ],
    obsoleteFieldsToRemove: ["totalGrossHtg", "totalNetHtg"],
    foreignKeyRules: []
  },

  invoices: {
    collectionName: "invoices",
    duplicateRules: [
      {
        fieldToRemove: "business_id",
        fieldToKeep: "businessId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessId'"
      },
      {
        fieldToRemove: "customer_id",
        fieldToKeep: "customerId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'customerId'"
      }
    ],
    obsoleteFieldsToRemove: ["amountPaid", "isPaid"],
    foreignKeyRules: [
      {
        field: "accountingTransactionId",
        foreignCollection: "ledger_transactions",
        tenantScoped: true,
        fallbackStrategy: "NULL",
        description: "Délie la transaction Grand Livre si inexistante"
      }
    ],
    customTransform: (data) => {
      const updates: Record<string, any> = {};
      let removedFieldsCount = 0;
      // If invoice has amountPaid or isPaid stored statically, remove them to enforce SSOT through ledger
      if (data.amountPaid !== undefined) {
        updates.amountPaid = null; // will be deleted via deleteField() in handler
        removedFieldsCount++;
      }
      if (data.isPaid !== undefined) {
        updates.isPaid = null;
        removedFieldsCount++;
      }
      return { updates, removedFieldsCount };
    }
  },

  proformas: {
    collectionName: "proformas",
    duplicateRules: [
      {
        fieldToRemove: "business_id",
        fieldToKeep: "businessId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessId'"
      },
      {
        fieldToRemove: "customer_id",
        fieldToKeep: "customerId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'customerId'"
      }
    ],
    foreignKeyRules: []
  },

  ledger_transactions: {
    collectionName: "ledger_transactions",
    duplicateRules: [
      {
        fieldToRemove: "business_id",
        fieldToKeep: "businessId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessId'"
      },
      {
        fieldToRemove: "branch_id",
        fieldToKeep: "branchId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'branchId'"
      },
      {
        fieldToRemove: "department_id",
        fieldToKeep: "departmentId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'departmentId'"
      }
    ],
    foreignKeyRules: [
      {
        field: "branchId",
        foreignCollection: "branches",
        tenantScoped: true,
        fallbackStrategy: "FIRST_OF_TENANT",
        description: "Assigne la première branche active du tenant si la branche est orpheline"
      },
      {
        field: "departmentId",
        foreignCollection: "departments",
        tenantScoped: true,
        fallbackStrategy: "FIRST_OF_TENANT",
        description: "Assigne le premier département du tenant si orphelin"
      }
    ]
  },

  notifications: {
    collectionName: "notifications",
    duplicateRules: [
      {
        fieldToRemove: "target_user_id",
        fieldToKeep: "targetUserId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'targetUserId'"
      },
      {
        fieldToRemove: "target_roles",
        fieldToKeep: "targetRoles",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'targetRoles'"
      },
      {
        fieldToRemove: "business_id",
        fieldToKeep: "businessId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessId'"
      }
    ],
    foreignKeyRules: []
  },

  shifts: {
    collectionName: "shifts",
    duplicateRules: [
      {
        fieldToRemove: "business_id",
        fieldToKeep: "businessId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessId'"
      },
      {
        fieldToRemove: "branch_id",
        fieldToKeep: "branchId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'branchId'"
      },
      {
        fieldToRemove: "department_id",
        fieldToKeep: "departmentId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'departmentId'"
      }
    ],
    foreignKeyRules: []
  },

  leaves: {
    collectionName: "leaves",
    duplicateRules: [
      {
        fieldToRemove: "employee_id",
        fieldToKeep: "employeeId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'employeeId'"
      },
      {
        fieldToRemove: "business_id",
        fieldToKeep: "businessId",
        fallbackIfKeepMissing: true,
        description: "Normalisation vers 'businessId'"
      }
    ],
    foreignKeyRules: [
      {
        field: "employeeId",
        foreignCollection: "employees",
        tenantScoped: true,
        fallbackStrategy: "WARN_ONLY",
        description: "Vérifie l'existence de l'employé"
      }
    ]
  }
};
