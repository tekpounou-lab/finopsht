import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DepartmentRepository, BusinessUnitRepository, CostCenterRepository } from '../../../repositories/organization';
import { OrganizationIntegrityService } from './OrganizationIntegrityService';
import { EventBus } from '../../../modules/runtime/EventBus';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn()
}));

vi.mock('../../../lib/firebase', () => ({
  db: {}
}));

vi.mock('../../../utils/resilientFirestore', () => ({
  resilientGetDoc: vi.fn(),
  resilientGetDocs: vi.fn()
}));

describe('OrganizationIntegrityService & Multi-Tenancy Protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pillar 1: Multi-Tenancy & SSOT Enforcement', () => {
    it('should throw an error when creating a Department without business_id', async () => {
      await expect(
        DepartmentRepository.create({
          name: 'Invalid Dept',
          code: 'INV'
        } as any)
      ).rejects.toThrow('Multi-Tenancy Violation');
    });

    it('should throw an error when creating a BusinessUnit without business_id', async () => {
      await expect(
        BusinessUnitRepository.create({
          name: 'Invalid BU',
          code: 'BU01',
          status: 'ACTIVE'
        } as any)
      ).rejects.toThrow('Multi-Tenancy Violation');
    });

    it('should throw an error when creating a CostCenter without business_id', async () => {
      await expect(
        CostCenterRepository.create({
          name: 'Invalid CC',
          code: 'CC01',
          budget: 1000,
          currency: 'USD',
          status: 'ACTIVE'
        } as any)
      ).rejects.toThrow('Multi-Tenancy Violation');
    });
  });

  describe('Pillar 2: Referential Integrity & Cascading Constraints', () => {
    it('should block department deletion if active employees are assigned', async () => {
      const mockGetDocs = vi.fn().mockResolvedValue({
        docs: [
          { id: 'emp_1', data: () => ({ name: 'Alice Dupont', email: 'alice@test.com', departmentId: 'dept_ops' }) }
        ],
        size: 1,
        empty: false
      });

      const firestore = await import('firebase/firestore');
      (firestore.getDocs as any) = mockGetDocs;

      const result = await DepartmentRepository.deleteWithIntegrityCheck('biz_123', 'dept_ops', { force: false });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Suppression bloquée');
      expect(result.reassignedCount).toBe(0);
    });

    it('should reassign employees and delete department when reassignToDeptId is specified', async () => {
      const mockGetDocs = vi.fn().mockResolvedValue({
        docs: [
          { id: 'emp_1', data: () => ({ name: 'Alice Dupont', email: 'alice@test.com', departmentId: 'dept_ops' }) }
        ],
        size: 1,
        empty: false
      });

      const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
      const mockDeleteDoc = vi.fn().mockResolvedValue(undefined);

      const firestore = await import('firebase/firestore');
      (firestore.getDocs as any) = mockGetDocs;
      (firestore.updateDoc as any) = mockUpdateDoc;
      (firestore.deleteDoc as any) = mockDeleteDoc;

      const eventSpy = vi.spyOn(EventBus, 'publish');

      const result = await DepartmentRepository.deleteWithIntegrityCheck('biz_123', 'dept_ops', {
        force: true,
        reassignToDeptId: 'd_admin'
      });

      expect(result.success).toBe(true);
      expect(result.reassignedCount).toBe(1);
      expect(mockUpdateDoc).toHaveBeenCalled();
      expect(mockDeleteDoc).toHaveBeenCalled();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'EmployeeTransferred'
        })
      );
    });

    it('should emit COST_CENTER_BUDGET_UPDATED when cost center budget is reallocated', async () => {
      const resilient = await import('../../../utils/resilientFirestore');
      (resilient.resilientGetDoc as any).mockResolvedValue({
        exists: () => true,
        id: 'cc_1',
        data: () => ({ business_id: 'biz_123', name: 'Centre Ops', budget: 5000, currency: 'USD' })
      });

      const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
      const firestore = await import('firebase/firestore');
      (firestore.updateDoc as any) = mockUpdateDoc;

      const eventSpy = vi.spyOn(EventBus, 'publish');

      await CostCenterRepository.reallocateBudget('biz_123', 'cc_1', 8000, 'usr_admin');

      expect(mockUpdateDoc).toHaveBeenCalled();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'COST_CENTER_BUDGET_UPDATED',
          payload: expect.objectContaining({
            costCenterId: 'cc_1',
            oldBudget: 5000,
            newBudget: 8000,
            delta: 3000
          })
        })
      );
    });
  });
});
