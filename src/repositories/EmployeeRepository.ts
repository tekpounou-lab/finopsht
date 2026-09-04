import { db } from "../lib/firebase";
import { 
  doc, 
  getDoc, 
  updateDoc, 
  query, 
  collection, 
  where, 
  getDocs, 
  writeBatch,
  setDoc
} from "firebase/firestore";
import { Employee } from "../types";
import { EventBus } from "../modules/runtime/EventBus";
import { EmployeeAuditService } from "../services/audit/EmployeeAuditService";
import { BranchRepository, DepartmentRepository, CostCenterRepository } from "./organization";
import { mapEmployee } from "../utils/caseConverter";
import { IntegrityValidator } from "../services/integrity/ForeignKeyIntegrityValidator";
import { validateOrThrow, EmployeeIntegritySchema, FinopsException } from "../validations/integritySchemas";

export class EmployeeRepository {
  /**
   * Verifies if the business has room under its subscription seat limit for new employees.
   * Throws FinopsException if seatsUsed + additionalCount > seatsLimit.
   */
  static async assertSeatLimitNotExceeded(businessId: string, additionalCount: number = 1): Promise<void> {
    const { SubscriptionRepository } = await import("./index");
    const sub = await SubscriptionRepository.getWorkspaceSubscription(businessId);
    const seatsLimit = sub.allowedLimits?.maxEmployees ?? 10;

    const q = query(collection(db, "employees"), where("business_id", "==", businessId));
    const snap = await getDocs(q);
    const currentActive = snap.docs.filter(d => {
      const data = d.data();
      return data.status !== "TERMINATED" && data.status !== "ARCHIVED" && data.isActive !== false;
    }).length;

    if (currentActive + additionalCount > seatsLimit) {
      throw new FinopsException(
        `Dépassement de la limite de collaborateurs : Votre forfait (${sub.plan}) autorise au maximum ${seatsLimit} collaborateurs. Vous en comptez actuellement ${currentActive}. Veuillez mettre à niveau votre forfait dans la console Super Admin.`,
        "SEAT_LIMIT_EXCEEDED",
        { currentActive, seatsLimit, plan: sub.plan, additionalCount },
        "Employee",
        403
      );
    }
  }

  /**
   * Suspends an employee: updates status in Firestore, logs audit & forensic entry, blocks login.
   */
  static async suspendEmployee(
    employeeId: string, 
    reason?: string, 
    actor?: { uid: string; name?: string; role?: string }
  ): Promise<Employee> {
    const empRef = doc(db, "employees", employeeId);
    const updates = {
      status: "SUSPENDED" as const,
      isActive: false,
      is_active: false,
      suspendedAt: new Date().toISOString(),
      suspensionReason: reason || "",
      updatedAt: new Date().toISOString()
    };

    await updateDoc(empRef, updates);
    const snap = await getDoc(empRef);
    const updatedEmp = snap.exists() ? mapEmployee<Employee>({ id: snap.id, ...snap.data() }) : null;

    if (updatedEmp) {
      await EmployeeAuditService.logTransition({
        employeeId,
        actorId: actor?.uid || "system",
        actorName: actor?.name || "Administrator",
        actorRole: actor?.role || "OWNER",
        business_id: updatedEmp.business_id,
        action: "EMPLOYEE_SUSPENDED",
        beforeState: { status: "ACTIVE", isActive: true },
        afterState: { status: "SUSPENDED", isActive: false, suspensionReason: reason || "" },
        severity: "warning",
        metadata: { reason: reason || "" }
      });

      try {
        const forensicRef = doc(collection(db, "forensic_logs"));
        await setDoc(forensicRef, {
          id: forensicRef.id,
          timestamp: new Date().toISOString(),
          userId: actor?.uid || "system",
          userName: actor?.name || "Administrator",
          userRole: actor?.role || "OWNER",
          business_id: updatedEmp.business_id,
          action: "EMPLOYEE_SUSPENDED",
          beforeState: JSON.stringify({ status: "ACTIVE", isActive: true }),
          afterState: JSON.stringify({ status: "SUSPENDED", isActive: false, suspensionReason: reason || "" }),
          ipAddress: "127.0.0.1",
          userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "FINOPS_SYSTEM",
          signature: `sig_susp_${Date.now()}_${Math.floor(Math.random() * 999999)}`,
          employeeId,
          entityType: "EMPLOYEE",
          entityId: employeeId,
          severity: "warning",
          metadata: {
            employeeName: updatedEmp.name,
            employeeEmail: updatedEmp.email,
            reason: reason || "",
            actionedBy: actor?.uid || "system"
          }
        });
      } catch (e) {
        console.error("[EmployeeRepository] Forensic log write failed:", e);
      }

      EventBus.publish(EventBus.createEvent({
        correlationId: `suspend_${employeeId}_${Date.now()}`,
        actorId: actor?.uid,
        businessId: updatedEmp.business_id,
        module: "WORKFORCE",
        aggregate: "EMPLOYEE",
        type: "EmployeeSuspended",
        payload: { employeeId, employeeName: updatedEmp.name, reason }
      }));
    }

    return updatedEmp as Employee;
  }

  /**
   * Reactivates a suspended employee: restores ACTIVE status and access in Firestore.
   */
  static async reactivateEmployee(
    employeeId: string, 
    actor?: { uid: string; name?: string; role?: string }
  ): Promise<Employee> {
    const empRef = doc(db, "employees", employeeId);
    const updates = {
      status: "ACTIVE" as const,
      isActive: true,
      is_active: true,
      suspendedAt: null,
      suspensionReason: null,
      updatedAt: new Date().toISOString()
    };

    await updateDoc(empRef, updates);
    const snap = await getDoc(empRef);
    const updatedEmp = snap.exists() ? mapEmployee<Employee>({ id: snap.id, ...snap.data() }) : null;

    if (updatedEmp) {
      await EmployeeAuditService.logTransition({
        employeeId,
        actorId: actor?.uid || "system",
        actorName: actor?.name || "Administrator",
        actorRole: actor?.role || "OWNER",
        business_id: updatedEmp.business_id,
        action: "EMPLOYEE_ACTIVATED",
        beforeState: { status: "SUSPENDED", isActive: false },
        afterState: { status: "ACTIVE", isActive: true },
        severity: "info",
        metadata: {}
      });

      try {
        const forensicRef = doc(collection(db, "forensic_logs"));
        await setDoc(forensicRef, {
          id: forensicRef.id,
          timestamp: new Date().toISOString(),
          userId: actor?.uid || "system",
          userName: actor?.name || "Administrator",
          userRole: actor?.role || "OWNER",
          business_id: updatedEmp.business_id,
          action: "EMPLOYEE_REACTIVATED",
          beforeState: JSON.stringify({ status: "SUSPENDED", isActive: false }),
          afterState: JSON.stringify({ status: "ACTIVE", isActive: true }),
          ipAddress: "127.0.0.1",
          userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "FINOPS_SYSTEM",
          signature: `sig_react_${Date.now()}_${Math.floor(Math.random() * 999999)}`,
          employeeId,
          entityType: "EMPLOYEE",
          entityId: employeeId,
          severity: "info",
          metadata: {
            employeeName: updatedEmp.name,
            employeeEmail: updatedEmp.email,
            actionedBy: actor?.uid || "system"
          }
        });
      } catch (e) {
        console.error("[EmployeeRepository] Forensic log write failed:", e);
      }

      EventBus.publish(EventBus.createEvent({
        correlationId: `reactivate_${employeeId}_${Date.now()}`,
        actorId: actor?.uid,
        businessId: updatedEmp.business_id,
        module: "WORKFORCE",
        aggregate: "EMPLOYEE",
        type: "EmployeeReactivated",
        payload: { employeeId, employeeName: updatedEmp.name }
      }));
    }

    return updatedEmp as Employee;
  }

  /**
   * Safe self-service profile update for an employee.
   * Strictly blocks changes to sensitive/admin fields (e.g. salary, role, status).
   */
  static async updateSelfServiceProfile(
    employeeId: string,
    allowedUpdates: {
      phone?: string;
      address?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      emergencyContactRelation?: string;
    },
    actor: { uid: string; name?: string; role?: string }
  ): Promise<Employee> {
    const sanitized: Partial<Employee> = {};
    if (allowedUpdates.phone !== undefined) sanitized.phone = allowedUpdates.phone;
    if (allowedUpdates.address !== undefined) (sanitized as any).address = allowedUpdates.address;
    if (allowedUpdates.emergencyContactName !== undefined) (sanitized as any).emergencyContactName = allowedUpdates.emergencyContactName;
    if (allowedUpdates.emergencyContactPhone !== undefined) (sanitized as any).emergencyContactPhone = allowedUpdates.emergencyContactPhone;
    if (allowedUpdates.emergencyContactRelation !== undefined) (sanitized as any).emergencyContactRelation = allowedUpdates.emergencyContactRelation;

    const emp = await this.updateEmployee(employeeId, sanitized, actor);

    try {
      const forensicRef = doc(collection(db, "forensic_logs"));
      await setDoc(forensicRef, {
        id: forensicRef.id,
        timestamp: new Date().toISOString(),
        userId: actor.uid,
        userName: actor.name || emp.name,
        userRole: actor.role || "EMPLOYEE",
        business_id: emp.business_id,
        action: "EMPLOYEE_PROFILE_UPDATED",
        beforeState: JSON.stringify({ phone: emp.phone, address: (emp as any).address }),
        afterState: JSON.stringify(sanitized),
        ipAddress: "127.0.0.1",
        userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "FINOPS_SYSTEM",
        signature: `sig_prof_${Date.now()}_${Math.floor(Math.random() * 999999)}`,
        employeeId,
        entityType: "EMPLOYEE",
        entityId: employeeId,
        severity: "info",
        metadata: {
          employeeName: emp.name,
          employeeEmail: emp.email,
          updatedFields: Object.keys(sanitized)
        }
      });
    } catch (e) {
      console.error("[EmployeeRepository] Forensic log write failed for profile update:", e);
    }

    return emp;
  }
  /**
   * Updates an employee record and synchronizes any pending invitation.
   */
  static async updateEmployee(employeeId: string, updates: Partial<Employee>, actor?: any): Promise<Employee> {
    const batch = writeBatch(db);
    const empRef = doc(db, "employees", employeeId);
    
    // Fetch existing employee data to calculate email_history
    const existingSnap = await getDoc(empRef);
    const existingData = existingSnap.exists() ? (existingSnap.data() as Employee) : null;

    let emailHistory = existingData?.email_history || [];
    if (updates.email && existingData?.email) {
      const oldClean = existingData.email.toLowerCase().trim();
      const newClean = updates.email.toLowerCase().trim();
      if (oldClean !== newClean) {
        emailHistory = Array.from(new Set([
          ...emailHistory,
          oldClean,
          newClean
        ])).filter(Boolean);
      }
    }

    const finalUpdates: any = {
      ...updates,
      ...(updates.email ? { normalizedEmail: updates.email.toLowerCase().trim() } : {}),
      ...(emailHistory.length > 0 ? { email_history: emailHistory } : {}),
      updatedAt: new Date().toISOString()
    };

    if (updates.branchId !== undefined) {
      finalUpdates.branch_id = updates.branchId;
    } else if ((updates as any).branch_id !== undefined) {
      finalUpdates.branchId = (updates as any).branch_id;
    }

    if (updates.departmentId !== undefined) {
      finalUpdates.department_id = updates.departmentId;
    } else if ((updates as any).department_id !== undefined) {
      finalUpdates.departmentId = (updates as any).department_id;
    }

    const resolvedSalary = updates.baseSalary !== undefined 
      ? updates.baseSalary 
      : (updates.salaryBaseHtg !== undefined ? updates.salaryBaseHtg : (updates as any).salary_base_htg);
    if (resolvedSalary !== undefined) {
      finalUpdates.baseSalary = resolvedSalary;
      finalUpdates.salaryBaseHtg = resolvedSalary;
    }

    const resolvedCommission = updates.commissionRate !== undefined 
      ? updates.commissionRate 
      : (updates as any).commission_rate;
    if (resolvedCommission !== undefined) {
      finalUpdates.commissionRate = resolvedCommission;
      finalUpdates.commission_rate = resolvedCommission;
    }

    // 1. Queue Employee Update
    batch.update(empRef, finalUpdates);

    // 2. Sync Invitation (if pending or sent)
    const invQuery1 = query(
      collection(db, "invitations"),
      where("employeeId", "==", employeeId)
    );
    const invQuery2 = query(
      collection(db, "invitations"),
      where("employee_id", "==", employeeId)
    );
    
    // 3. Sync active Employee Contract if compensation, contractType, or regime changed
    const contractQ1 = query(
      collection(db, "employee_contracts"),
      where("employeeId", "==", employeeId)
    );
    const contractQ2 = query(
      collection(db, "employee_contracts"),
      where("employee_id", "==", employeeId)
    );

    const [invSnap1, invSnap2, contractSnap1, contractSnap2] = await Promise.all([
      getDocs(invQuery1).catch(() => null),
      getDocs(invQuery2).catch(() => null),
      getDocs(contractQ1).catch(() => null),
      getDocs(contractQ2).catch(() => null)
    ]);

    const invDocs = [...(invSnap1?.docs || []), ...(invSnap2?.docs || [])];
    const processedIds = new Set<string>();

    invDocs.forEach((invDoc) => {
      if (!processedIds.has(invDoc.id)) {
        processedIds.add(invDoc.id);
        const invData = invDoc.data();
        if (invData.status === "PENDING" || invData.status === "SENT") {
          const invHistory = Array.from(new Set([
            ...(Array.isArray(invData.email_history) ? invData.email_history : []),
            (invData.email || "").toLowerCase().trim(),
            ...(updates.email ? [updates.email.toLowerCase().trim()] : [])
          ])).filter(Boolean);

          batch.update(invDoc.ref, {
            ...(updates.email ? { email: updates.email.toLowerCase().trim(), normalizedEmail: updates.email.toLowerCase().trim() } : {}),
            ...(invHistory.length > 0 ? { email_history: invHistory } : {}),
            employee_id: employeeId,
            employeeId: employeeId,
            role: updates.role || undefined,
            branchId: (updates as any).branchId || undefined,
            departmentId: (updates as any).departmentId || undefined,
            updatedAt: new Date().toISOString()
          });
        }
      }
    });

    const contractDocs = [...(contractSnap1?.docs || []), ...(contractSnap2?.docs || [])];
    const processedContractIds = new Set<string>();

    contractDocs.forEach((cDoc) => {
      if (!processedContractIds.has(cDoc.id)) {
        processedContractIds.add(cDoc.id);
        const cUpdates: any = {
          updatedAt: new Date().toISOString()
        };
        if (resolvedSalary !== undefined) {
          cUpdates.salaryBaseHtg = resolvedSalary;
        }
        if (updates.contractType) {
          cUpdates.contractType = updates.contractType;
        }
        if (updates.payRegime || updates.paymentModel) {
          cUpdates.payRegime = (updates.payRegime || updates.paymentModel?.toLowerCase()) as any;
        }
        if (resolvedCommission !== undefined) {
          cUpdates.commissionRate = resolvedCommission;
        }
        batch.update(cDoc.ref, cUpdates);
      }
    });

    await batch.commit();
    const updatedSnap = await getDoc(empRef);
    const updatedEmp = updatedSnap.exists() 
      ? mapEmployee<Employee>({ id: updatedSnap.id, ...updatedSnap.data() }) 
      : mapEmployee<Employee>({ id: employeeId, ...finalUpdates });

    EventBus.publish(EventBus.createEvent({
      correlationId: `update_${employeeId}`,
      actorId: actor?.uid,
      businessId: updatedEmp.business_id,
      module: "WORKFORCE",
      aggregate: "EMPLOYEE",
      type: "EmployeeUpdated",
      payload: { employeeId, updates }
    }));

    return updatedEmp;
  }

  static async listAll(businessId?: string): Promise<Employee[]> {
    try {
      const colRef = collection(db, "employees");
      const q = businessId ? query(colRef, where("business_id", "==", businessId)) : query(colRef);
      const snap = await getDocs(q);
      return snap.docs.map(doc => mapEmployee<Employee>({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error("[EmployeeRepository.listAll] Error fetching employees:", err);
      return [];
    }
  }

  static async getById(employeeId: string): Promise<Employee | null> {
    try {
      const docSnap = await getDoc(doc(db, "employees", employeeId));
      if (docSnap.exists()) return mapEmployee<Employee>({ id: docSnap.id, ...docSnap.data() });
      const snap = await getDocs(query(collection(db, "employees"), where("id", "==", employeeId)));
      if (snap.empty) return null;
      return mapEmployee<Employee>({ id: snap.docs[0].id, ...snap.docs[0].data() });
    } catch (e) {
      console.warn("[EmployeeRepository.getById] Fallback query error:", e);
      return null;
    }
  }

  static async assignBranch(employeeId: string, branchId: string, actor: any): Promise<void> {
    await this.updateEmployee(employeeId, { branchId });
  }

  static async assignDepartment(employeeId: string, departmentId: string, actor: any): Promise<void> {
    await this.updateEmployee(employeeId, { departmentId });
  }

  static async createEmployee(employee: Employee, actor?: any): Promise<Employee> {
    const bizId = employee.business_id || (employee as any).businessId;
    if (!bizId) {
      throw new Error("Multi-Tenancy Violation: business_id is required when creating an Employee.");
    }

    // Verify subscription seat limit before creating employee
    await this.assertSeatLimitNotExceeded(bizId, 1);

    // Integrity constraint check: validate parent business, branch, and department
    await IntegrityValidator.validateBusinessExists(bizId);
    const branchId = employee.branchId || employee.branch_id;
    if (branchId) {
      await IntegrityValidator.validateBranchExists(bizId, branchId);
    }
    const deptId = employee.departmentId || employee.department_id;
    if (deptId) {
      await IntegrityValidator.validateDepartmentExists(bizId, deptId);
    }

    const id = employee.id || `emp_${Math.random().toString(36).substring(2, 9)}`;
    const newEmp = mapEmployee<Employee>({
      ...employee,
      id,
      business_id: bizId,
      businessId: bizId,
      branch_id: branchId,
      branchId: branchId,
      department_id: deptId,
      departmentId: deptId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Validate with Zod schema before persisting to Firestore
    validateOrThrow(EmployeeIntegritySchema, {
      ...newEmp,
      businessId: bizId,
      branchId: branchId || "BRANCH_DEFAULT",
      departmentId: deptId || "DEP_DEFAULT",
      name: newEmp.name,
      email: newEmp.email,
      baseSalary: newEmp.baseSalary || 0
    }, "Employee");

    await setDoc(doc(db, "employees", id), newEmp);

    // Auto-provision permanent deterministic badge for QR attendance
    try {
      const badgeId = `bdg_${id}`;
      const badgeSig = `HMAC::${btoa(id + newEmp.business_id).substring(0, 16).toUpperCase()}`;
      const badgePayload = {
        employee_id: id,
        business_id: newEmp.business_id,
        branch_id: newEmp.branchId || "BRANCH_DEFAULT",
        department_id: newEmp.departmentId || "DEP_DEFAULT",
        role: newEmp.role || "EMPLOYEE",
        signature: badgeSig
      };
      const badge = {
        id: badgeId,
        employeeId: id,
        business_id: newEmp.business_id,
        branchId: newEmp.branchId || "BRANCH_DEFAULT",
        departmentId: newEmp.departmentId || "DEP_DEFAULT",
        role: newEmp.role || "EMPLOYEE",
        issuedAt: new Date().toISOString(),
        signature: badgeSig,
        qrPayload: JSON.stringify(badgePayload)
      };
      await setDoc(doc(db, "employee_badges", badgeId), badge);
    } catch (badgeErr) {
      console.warn("[EmployeeRepository] Auto-badge generation warning:", badgeErr);
    }

    EventBus.publish(EventBus.createEvent({
      correlationId: `create_${id}`,
      actorId: actor?.uid,
      businessId: newEmp.business_id,
      module: "WORKFORCE",
      aggregate: "EMPLOYEE",
      type: "EmployeeCreated",
      payload: { employee: newEmp }
    }));

    return newEmp;
  }

  static async saveBadge(badge: any, actor?: any): Promise<void> {
    await setDoc(doc(db, "employee_badges", badge.id), badge);
  }

  static async saveContract(contract: any, actor?: any): Promise<void> {
    await setDoc(doc(db, "employee_contracts", contract.id), contract);
  }

  static async createInvitationBatch(employee: any, invitation: any, badge: any, contract: any): Promise<void> {
    const batch = writeBatch(db);
    batch.set(doc(db, "employees", employee.id), employee);
    batch.set(doc(db, "invitations", invitation.id), invitation);
    batch.set(doc(db, "employee_badges", badge.id), badge);
    batch.set(doc(db, "employee_contracts", contract.id), contract);
    await batch.commit();
  }

  static async updateInvitationStatus(invitationId: string, data: any): Promise<void> {
    const status = typeof data === "string" ? data : data.status;
    await updateDoc(doc(db, "invitations", invitationId), { status, updatedAt: new Date().toISOString() });
  }

  static async requestInvitationAcceptance(params: {
    employeeId: string;
    employee: any;
    invitationId: string;
    invitation: any;
    badgeId: string;
    badge: any;
    contractId: string;
    contract: any;
  }): Promise<void> {
    EventBus.publish(EventBus.createEvent({
      correlationId: `orch_inv_${params.invitationId}`,
      businessId: params.employee.business_id,
      module: "WORKFORCE",
      aggregate: "INVITATION",
      type: "InvitationAcceptanceRequested",
      payload: params
    }));
  }

  static async _applyInvitationAcceptance(params: any): Promise<void> {
    const { employeeId, employee, invitationId, badgeId, badge, contractId, contract } = params;
    const batch = writeBatch(db);
    batch.update(doc(db, "employees", employeeId), { ...employee, status: "ACTIVE", updatedAt: new Date().toISOString() });
    batch.update(doc(db, "invitations", invitationId), { status: "ACCEPTED", updatedAt: new Date().toISOString() });
    batch.set(doc(db, "employee_badges", badgeId), badge);
    batch.set(doc(db, "employee_contracts", contractId), contract);
    await batch.commit();
  }

  static async saveAttendanceLog(log: any, actor?: any): Promise<void> {
    await setDoc(doc(db, "attendance_logs", log.id), log);
  }

  static async createBulkImportBatch(
    employees: any[], 
    invitations: any[], 
    badges: any[], 
    contracts: any[],
    branchesToCreate: any[] = [],
    departmentsToCreate: any[] = []
  ): Promise<void> {
    if (employees.length > 0) {
      const sampleBizId = employees[0].business_id || employees[0].businessId;
      if (sampleBizId) {
        await this.assertSeatLimitNotExceeded(sampleBizId, employees.length);
      }
    }

    const uniqueBranchIds = new Set<string>();
    const uniqueDeptIds = new Set<string>();

    const branchMap = new Map<string, any>();
    branchesToCreate.forEach(b => branchMap.set(b.id, b));

    const deptMap = new Map<string, any>();
    departmentsToCreate.forEach(d => deptMap.set(d.id, d));

    employees.forEach(emp => {
      const bId = emp.branchId || emp.branch_id;
      const dId = emp.departmentId || emp.department_id;
      if (bId) uniqueBranchIds.add(bId);
      if (dId) uniqueDeptIds.add(dId);
    });

    // 1. Verify all Branches exist or are in creation batch
    for (const bId of uniqueBranchIds) {
      if (branchMap.has(bId)) {
        continue;
      }
      const branch = await BranchRepository.getById(bId);
      if (!branch) {
        throw new Error(`Erreur d'intégrité : La succursale [${bId}] n'existe pas. Import annulé.`);
      }
    }

    // 2. Verify all Departments exist or are in creation batch
    const fetchedDepts = new Map<string, any>();
    for (const dId of uniqueDeptIds) {
      if (deptMap.has(dId)) {
        fetchedDepts.set(dId, deptMap.get(dId));
        continue;
      }
      const dept = await DepartmentRepository.getById(dId);
      if (!dept) {
        throw new Error(`Erreur d'intégrité : Le département [${dId}] n'existe pas. Import annulé.`);
      }
      fetchedDepts.set(dId, dept);
    }

    // 3. Verify Budget Rule (EMPLOYEE role only assigned to active budget departments)
    for (const emp of employees) {
      if (emp.role === "EMPLOYEE") {
         const dId = emp.departmentId || emp.department_id;
         const dept = fetchedDepts.get(dId);
         if (dept) {
            let activeBudget = false;
            // Check direct budget (if added to metadata or model or default 50000)
            if (dept.budget && dept.budget > 0) activeBudget = true;
            if (dept.metadata?.budget && dept.metadata.budget > 0) activeBudget = true;
            
            // Check attached Cost Center
            if (dept.cost_center_id) {
               const cc = await CostCenterRepository.getById(dept.cost_center_id);
               if (cc && cc.budget > 0 && cc.status === "ACTIVE") activeBudget = true;
            }

            // If system-generated import or newly created, allow default budget
            if (dept.is_system_generated || dept.source === "BULK_IMPORT" || dept.source === "SYSTEM_IMPORT" || dept.source === "GL_IMPORT") {
              activeBudget = true;
            }

            if (!activeBudget) {
               throw new Error(`Erreur de validation : L'employé [${emp.name}] avec le rôle EMPLOYEE ne peut être assigné qu'à un département avec un budget actif (Département: ${dept.name}). Les MANAGERs peuvent être assignés librement.`);
            }
         }
      }
    }

    const batch = writeBatch(db);

    // Write new branches and departments in the same atomic batch
    branchesToCreate.forEach(branch => {
      batch.set(doc(db, "branches", branch.id), branch);
    });

    departmentsToCreate.forEach(dept => {
      batch.set(doc(db, "departments", dept.id), dept);
    });

    employees.forEach(emp => {
      const normalizedEmp = { ...emp };
      if (emp.branchId !== undefined) normalizedEmp.branch_id = emp.branchId;
      else if (emp.branch_id !== undefined) normalizedEmp.branchId = emp.branch_id;
      if (emp.departmentId !== undefined) normalizedEmp.department_id = emp.departmentId;
      else if (emp.department_id !== undefined) normalizedEmp.departmentId = emp.department_id;
      batch.set(doc(db, "employees", emp.id), normalizedEmp);
    });
    invitations.forEach(inv => batch.set(doc(db, "invitations", inv.id), inv));
    badges.forEach(badge => batch.set(doc(db, "employee_badges", badge.id), badge));
    contracts.forEach(contract => batch.set(doc(db, "employee_contracts", contract.id), contract));
    
    // Forensic Log Entry
    const logId = "f_bulk_" + Math.random().toString(36).substring(2, 9);
    batch.set(doc(db, "forensic_logs", logId), {
      id: logId,
      timestamp: new Date().toISOString(),
      userId: "sys_bulk",
      userName: "Moteur Import FinOps",
      userRole: "SYSTEM",
      business_id: employees[0]?.business_id || employees[0]?.businessId,
      action: "HR_EMPLOYEE_ONBOARD_BULK_ATOMIC",
      beforeState: "{}",
      afterState: JSON.stringify({ 
        importedCount: employees.length,
        createdBranchesCount: branchesToCreate.length,
        createdDepartmentsCount: departmentsToCreate.length
      }),
      ipAddress: "201.222.45.99",
      userAgent: "FinOps Enterprise ERP Server",
      signature: "seal_bulk_" + Math.floor(Math.random() * 999999)
    });

    await batch.commit();

    EventBus.publish(EventBus.createEvent({
      correlationId: "bulk_import",
      businessId: employees[0]?.business_id,
      module: "WORKFORCE",
      aggregate: "EMPLOYEE",
      type: "EmployeesBulkImported",
      payload: { 
        count: employees.length,
        branchesCount: branchesToCreate.length,
        departmentsCount: departmentsToCreate.length
      }
    }));
  }
}

