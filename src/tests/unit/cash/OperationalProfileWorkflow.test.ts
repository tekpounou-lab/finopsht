import { describe, it, expect } from 'vitest';
import { TransactionMappingEngine, DEFAULT_SYSTEM_TRANSACTION_TYPES } from '../../../services/cash/transactionMappingEngine';
import { OperationalProfile, TransactionTypeItem } from '../../../types/transactionTypes';

describe('RH-PROFILE-01: Operational Profile Workflow & Desk Transaction Constraints', () => {
  
  describe('1. Profile Resolution from Role and Position (resolveOperationalProfile)', () => {
    it('resolves OWNER, ADMIN, SUPER_ADMIN, and MANAGER to polyvalent profile', () => {
      expect(TransactionMappingEngine.resolveOperationalProfile('OWNER')).toBe('polyvalent');
      expect(TransactionMappingEngine.resolveOperationalProfile('ADMIN')).toBe('polyvalent');
      expect(TransactionMappingEngine.resolveOperationalProfile('SUPER_ADMIN')).toBe('polyvalent');
      expect(TransactionMappingEngine.resolveOperationalProfile('MANAGER')).toBe('polyvalent');
    });

    it('resolves HEAD_TELLER and related position titles to head_teller profile', () => {
      expect(TransactionMappingEngine.resolveOperationalProfile('HEAD_TELLER')).toBe('head_teller');
      expect(TransactionMappingEngine.resolveOperationalProfile('EMPLOYEE', 'Chef Caissier Principal')).toBe('head_teller');
      expect(TransactionMappingEngine.resolveOperationalProfile(undefined, 'Head Teller Desk 1')).toBe('head_teller');
      expect(TransactionMappingEngine.resolveOperationalProfile(undefined, 'Responsable Guichet')).toBe('head_teller');
    });

    it('resolves JUNIOR_TELLER, SENIOR_TELLER, and teller positions to teller profile', () => {
      expect(TransactionMappingEngine.resolveOperationalProfile('JUNIOR_TELLER')).toBe('teller');
      expect(TransactionMappingEngine.resolveOperationalProfile('SENIOR_TELLER')).toBe('teller');
      expect(TransactionMappingEngine.resolveOperationalProfile('EMPLOYEE', 'Caissier Guichet #2')).toBe('teller');
      expect(TransactionMappingEngine.resolveOperationalProfile('EMPLOYEE', 'Guichetier')).toBe('teller');
    });

    it('resolves sales and commercial positions to vendeur profile', () => {
      expect(TransactionMappingEngine.resolveOperationalProfile('EMPLOYEE', 'Vendeur Comptoir')).toBe('vendeur');
      expect(TransactionMappingEngine.resolveOperationalProfile(undefined, 'Commercial Terrain')).toBe('vendeur');
      expect(TransactionMappingEngine.resolveOperationalProfile(undefined, 'Sales Representative')).toBe('vendeur');
    });

    it('falls back to least-privilege vendeur profile when role/position are unassigned', () => {
      expect(TransactionMappingEngine.resolveOperationalProfile(undefined, undefined)).toBe('vendeur');
      expect(TransactionMappingEngine.resolveOperationalProfile('', '')).toBe('vendeur');
      expect(TransactionMappingEngine.resolveOperationalProfile('UNKNOWN_ROLE')).toBe('vendeur');
    });
  });

  describe('2. Catalog Filtering by Operational Profile (filterTypesByProfile)', () => {
    const allTypes = DEFAULT_SYSTEM_TRANSACTION_TYPES;

    it('restricts VENDEUR to Sales and Services categories only', () => {
      const vendeurTypes = TransactionMappingEngine.filterTypesByProfile(allTypes, 'vendeur');
      expect(vendeurTypes.length).toBeGreaterThan(0);
      
      const allowedCategories = new Set(['Sales', 'Services']);
      vendeurTypes.forEach(t => {
        expect(allowedCategories.has(t.category)).toBe(true);
      });

      // Must not include Money Transfer, Mobile Transfer, Operating Expenses, or Clearing
      expect(vendeurTypes.some(t => t.code === '1001')).toBe(false); // Dépôt Cash
      expect(vendeurTypes.some(t => t.code === '2001')).toBe(false); // Retrait Cash
      expect(vendeurTypes.some(t => t.code === '6001')).toBe(false); // Dépense Exploitation
      expect(vendeurTypes.some(t => t.code === '2910')).toBe(false); // Clearing
    });

    it('restricts TELLER to Money Transfer, Mobile Transfer, and Currency Exchange', () => {
      const tellerTypes = TransactionMappingEngine.filterTypesByProfile(allTypes, 'teller');
      expect(tellerTypes.length).toBeGreaterThan(0);

      const allowedCategories = new Set(['Money Transfer', 'Mobile Transfer', 'Currency Exchange']);
      tellerTypes.forEach(t => {
        expect(allowedCategories.has(t.category)).toBe(true);
      });

      // Must not include Sales or Services
      expect(tellerTypes.some(t => t.code === '3001')).toBe(false); // Vente Marchandises
      expect(tellerTypes.some(t => t.code === '3101')).toBe(false); // Prestation Service
      expect(tellerTypes.some(t => t.code === '6001')).toBe(false); // Dépense Exploitation
    });

    it('allows POLYVALENT the union of operational categories, excluding OpEx and Clearing', () => {
      const polyTypes = TransactionMappingEngine.filterTypesByProfile(allTypes, 'polyvalent');
      expect(polyTypes.length).toBeGreaterThan(0);

      // Polyvalent can do Sales, Services, Money Transfer, Mobile Transfer, Currency Exchange
      expect(polyTypes.some(t => t.code === '3001')).toBe(true); // Vente Marchandises
      expect(polyTypes.some(t => t.code === '1001')).toBe(true); // Dépôt Cash
      expect(polyTypes.some(t => t.code === '5001')).toBe(true); // Recharge Mobile

      // But CANNOT do OpEx or Clearing
      expect(polyTypes.some(t => t.code === '6001')).toBe(false);
      expect(polyTypes.some(t => t.code === '2910')).toBe(false);
    });

    it('allows HEAD_TELLER operational categories plus Operating Expenses and Internal Transfers', () => {
      const headTypes = TransactionMappingEngine.filterTypesByProfile(allTypes, 'head_teller');
      expect(headTypes.length).toBeGreaterThan(0);

      expect(headTypes.some(t => t.code === '3001')).toBe(true); // Vente
      expect(headTypes.some(t => t.code === '1001')).toBe(true); // Dépôt
      expect(headTypes.some(t => t.code === '6001')).toBe(true); // Dépense Exploitation
      expect(headTypes.some(t => t.code === '1910')).toBe(true); // Transfert Interne

      // Must NOT include Clearing (Manager/Owner only)
      expect(headTypes.some(t => t.code === '2910')).toBe(false);
    });

    it('allows MANAGER and OWNER full access to all system transaction types', () => {
      const managerTypes = TransactionMappingEngine.filterTypesByProfile(allTypes, 'manager');
      const ownerTypes = TransactionMappingEngine.filterTypesByProfile(allTypes, 'owner');
      
      const activeCount = allTypes.filter(t => t.isActive).length;
      expect(managerTypes.length).toBe(activeCount);
      expect(ownerTypes.length).toBe(activeCount);
      expect(managerTypes.some(t => t.code === '2910')).toBe(true); // Clearing is accessible
    });
  });

  describe('3. Operation Authorization Check (isOperationAllowedForProfile)', () => {
    const saleOp = DEFAULT_SYSTEM_TRANSACTION_TYPES.find(t => t.code === '3001')!;
    const serviceOp = DEFAULT_SYSTEM_TRANSACTION_TYPES.find(t => t.code === '3101')!;
    const depositOp = DEFAULT_SYSTEM_TRANSACTION_TYPES.find(t => t.code === '1001')!;
    const withdrawalOp = DEFAULT_SYSTEM_TRANSACTION_TYPES.find(t => t.code === '2001')!;
    const opexOp = DEFAULT_SYSTEM_TRANSACTION_TYPES.find(t => t.code === '6001')!;
    const clearingOp = DEFAULT_SYSTEM_TRANSACTION_TYPES.find(t => t.code === '2910')!;

    it('rejects undefined operation', () => {
      const res = TransactionMappingEngine.isOperationAllowedForProfile(undefined, 'vendeur');
      expect(res.isAllowed).toBe(false);
      expect(res.reason).toContain("Aucune opération");
    });

    it('strictly forbids TELLER from executing Sales and Services', () => {
      const checkSale = TransactionMappingEngine.isOperationAllowedForProfile(saleOp, 'teller');
      expect(checkSale.isAllowed).toBe(false);
      expect(checkSale.reason).toContain('Caissier / Guichetier');

      const checkService = TransactionMappingEngine.isOperationAllowedForProfile(serviceOp, 'teller');
      expect(checkService.isAllowed).toBe(false);
    });

    it('strictly forbids VENDEUR from executing Cash Transfers, Withdrawals and OpEx', () => {
      const checkDeposit = TransactionMappingEngine.isOperationAllowedForProfile(depositOp, 'vendeur');
      expect(checkDeposit.isAllowed).toBe(false);
      expect(checkDeposit.reason).toContain('Vendeur est strictement limité');

      const checkWithdrawal = TransactionMappingEngine.isOperationAllowedForProfile(withdrawalOp, 'vendeur');
      expect(checkWithdrawal.isAllowed).toBe(false);

      const checkOpex = TransactionMappingEngine.isOperationAllowedForProfile(opexOp, 'vendeur');
      expect(checkOpex.isAllowed).toBe(false);
    });

    it('strictly forbids POLYVALENT from executing Operating Expenses or Clearing', () => {
      const checkOpex = TransactionMappingEngine.isOperationAllowedForProfile(opexOp, 'polyvalent');
      expect(checkOpex.isAllowed).toBe(false);

      const checkClearing = TransactionMappingEngine.isOperationAllowedForProfile(clearingOp, 'polyvalent');
      expect(checkClearing.isAllowed).toBe(false);
    });

    it('allows HEAD_TELLER to execute Operating Expenses but forbids Clearing', () => {
      const checkOpex = TransactionMappingEngine.isOperationAllowedForProfile(opexOp, 'head_teller');
      expect(checkOpex.isAllowed).toBe(true);

      const checkClearing = TransactionMappingEngine.isOperationAllowedForProfile(clearingOp, 'head_teller');
      expect(checkClearing.isAllowed).toBe(false);
      expect(checkClearing.reason).toContain('Clearing / Compensation générale');
    });

    it('allows OWNER and MANAGER full operational authority', () => {
      expect(TransactionMappingEngine.isOperationAllowedForProfile(saleOp, 'owner').isAllowed).toBe(true);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(clearingOp, 'owner').isAllowed).toBe(true);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(opexOp, 'manager').isAllowed).toBe(true);
    });
  });

  describe('4. Profile Switch Permissions & Privilege Escalation Prevention', () => {
    it('forbids operational tellers and general staff from switching profiles', () => {
      expect(TransactionMappingEngine.canSwitchProfile('JUNIOR_TELLER')).toBe(false);
      expect(TransactionMappingEngine.canSwitchProfile('SENIOR_TELLER')).toBe(false);
      expect(TransactionMappingEngine.canSwitchProfile('EMPLOYEE')).toBe(false);

      expect(TransactionMappingEngine.isProfileSwitchAllowed('JUNIOR_TELLER', 'head_teller')).toBe(false);
      expect(TransactionMappingEngine.isProfileSwitchAllowed('JUNIOR_TELLER', 'polyvalent')).toBe(false);
      expect(TransactionMappingEngine.isProfileSwitchAllowed('JUNIOR_TELLER', 'vendeur')).toBe(false);
      expect(TransactionMappingEngine.isProfileSwitchAllowed('JUNIOR_TELLER', 'teller')).toBe(true); // Own profile
    });

    it('allows HEAD_TELLER to switch only between operational profiles (vendeur, teller, head_teller)', () => {
      expect(TransactionMappingEngine.canSwitchProfile('HEAD_TELLER')).toBe(true);
      expect(TransactionMappingEngine.isProfileSwitchAllowed('HEAD_TELLER', 'vendeur')).toBe(true);
      expect(TransactionMappingEngine.isProfileSwitchAllowed('HEAD_TELLER', 'teller')).toBe(true);
      expect(TransactionMappingEngine.isProfileSwitchAllowed('HEAD_TELLER', 'head_teller')).toBe(true);
      expect(TransactionMappingEngine.isProfileSwitchAllowed('HEAD_TELLER', 'polyvalent')).toBe(false);
    });

    it('allows OWNER, ADMIN, SUPER_ADMIN, and MANAGER to switch to any operational profile', () => {
      expect(TransactionMappingEngine.canSwitchProfile('OWNER')).toBe(true);
      expect(TransactionMappingEngine.canSwitchProfile('MANAGER')).toBe(true);
      expect(TransactionMappingEngine.canSwitchProfile('SUPER_ADMIN')).toBe(true);

      const profiles: OperationalProfile[] = ['vendeur', 'teller', 'polyvalent', 'head_teller'];
      profiles.forEach(p => {
        expect(TransactionMappingEngine.isProfileSwitchAllowed('OWNER', p)).toBe(true);
        expect(TransactionMappingEngine.isProfileSwitchAllowed('MANAGER', p)).toBe(true);
        expect(TransactionMappingEngine.isProfileSwitchAllowed('SUPER_ADMIN', p)).toBe(true);
      });
    });
  });

  describe('5. Double-Entry Accounting and Cash Flow Verification', () => {
    it('calculates Cash Inflow (+1) when cash account 1111 is debited', () => {
      const flow = TransactionMappingEngine.calculateFlowBehavior('1111', '4000');
      expect(flow.behavior).toBe(1);
      expect(flow.label).toContain('Entrée');
    });

    it('calculates Cash Outflow (-1) when cash account 1111 is credited', () => {
      const flow = TransactionMappingEngine.calculateFlowBehavior('6010', '1111');
      expect(flow.behavior).toBe(-1);
      expect(flow.label).toContain('Sortie');
    });

    it('calculates Neutral (0) when cash account is neither debited nor credited', () => {
      const flow = TransactionMappingEngine.calculateFlowBehavior('2910', '2910');
      expect(flow.behavior).toBe(0);
      expect(flow.label).toContain('Sans mouvement de caisse');
    });

    it('validates Sales and Services rule: Class 1 debit and Class 4/7 credit', () => {
      const validSale = TransactionMappingEngine.validateSalesAndServicesRule('Sales', '1111', '4000');
      expect(validSale.isValid).toBe(true);

      const invalidDebit = TransactionMappingEngine.validateSalesAndServicesRule('Sales', '6010', '4000');
      expect(invalidDebit.isValid).toBe(false);
      expect(invalidDebit.error).toContain('Classe 1');

      const invalidCredit = TransactionMappingEngine.validateSalesAndServicesRule('Sales', '1111', '1111');
      expect(invalidCredit.isValid).toBe(false);
    });
  });
});
