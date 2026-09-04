export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface GenericFilterGroup {
  startDate?: string;
  endDate?: string;
  period?: string; // 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'YYYY-MM'
  branchId?: string | string[];
  departmentId?: string | string[];
  employeeId?: string | string[];
  status?: string | string[];
  type?: string | string[];
  category?: string;
  search?: string;
  accountId?: string;
  [key: string]: any;
}

export type FilterNamespace = 'gl' | 'crm' | 'payroll' | 'attendance' | 'planning' | 'performance' | 'global' | string;

export const DEFAULT_NAMESPACE_FILTERS: Record<string, GenericFilterGroup> = {
  gl: {
    type: ['ALL'],
    category: 'ALL',
    branchId: ['ALL'],
    departmentId: ['ALL'],
    employeeId: ['ALL'],
    period: 'ALL',
    search: '',
    startDate: '',
    endDate: ''
  },
  payroll: {
    period: 'THIS_MONTH',
    branchId: ['ALL'],
    departmentId: ['ALL'],
    status: ['ALL'],
    search: ''
  },
  attendance: {
    period: 'TODAY',
    branchId: ['ALL'],
    departmentId: ['ALL'],
    employeeId: ['ALL'],
    search: '',
    startDate: '',
    endDate: ''
  },
  planning: {
    period: 'THIS_WEEK',
    branchId: ['ALL'],
    departmentId: ['ALL'],
    search: ''
  },
  crm: {
    period: 'ALL',
    status: ['ALL'],
    type: ['ALL'],
    search: ''
  },
  performance: {
    period: 'THIS_MONTH',
    branchId: ['ALL'],
    departmentId: ['ALL'],
    employeeId: ['ALL']
  },
  global: {
    period: 'ALL',
    startDate: '',
    endDate: '',
    branchId: ['ALL'],
    departmentId: ['ALL']
  }
};
