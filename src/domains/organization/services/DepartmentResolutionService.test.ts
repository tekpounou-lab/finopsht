import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DepartmentResolutionService } from './DepartmentResolutionService';
import { DepartmentRepository } from '../../../repositories/organization';
import { DepartmentNormalizer } from './DepartmentNormalizer';

vi.mock('../../../repositories/organization', () => ({
  DepartmentRepository: {
    listByBusiness: vi.fn(),
    create: vi.fn()
  }
}));

describe('DepartmentResolutionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve an existing department by normalized name', async () => {
    const existingDepts = [
      { id: '1', name: 'Barber Shop', normalized_name: 'barber shop', code: 'BARBER', business_id: 'b1' }
    ];
    vi.mocked(DepartmentRepository.listByBusiness).mockResolvedValue(existingDepts as any);

    const result = await DepartmentResolutionService.resolveOrCreate('b1', ' BARBER SHOP ');
    
    expect(result.id).toBe('1');
    expect(DepartmentRepository.create).not.toHaveBeenCalled();
  });

  it('should create a new department if not found', async () => {
    vi.mocked(DepartmentRepository.listByBusiness).mockResolvedValue([]);
    vi.mocked(DepartmentRepository.create).mockResolvedValue('new_id_2');

    const result = await DepartmentResolutionService.resolveOrCreate('b1', 'Spa & Wellness');

    expect(DepartmentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Spa & Wellness',
      normalized_name: 'spa & wellness',
      code: 'SPAWELLNES',
      is_system_generated: true
    }));
    expect(result.id).toBe('new_id_2');
  });
});

describe('DepartmentNormalizer', () => {
  it('should normalize strings correctly', () => {
    expect(DepartmentNormalizer.normalize(' BarBéR Shop ')).toBe('barber shop');
    expect(DepartmentNormalizer.getCanonicalId(' BarBéR Shop ')).toBe('barbershop');
  });
});
