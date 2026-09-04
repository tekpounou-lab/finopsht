import React from "react";
import { PageContainer, PageHeader, PageToolbar, ContentContainer, SplitLayout, PageSection } from "./EnterpriseLayout";
import { DataTableToolbar, EnterpriseTable, TablePagination, TableSearch } from "./EnterpriseTables";
import { StatCard, DashboardCard } from "./EnterpriseCards";
import { Stepper, StatusBadge } from "./EnterpriseStatus";
import { FormActions } from "./EnterpriseForms";

/**
 * Enterprise CRUD Page Pattern
 * Standardized template for Master/List Management with filters, table, and pagination.
 */
export interface MasterCrudPatternProps<T> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  searchValue: string;
  onSearchChange: (val: string) => void;
  filters?: React.ReactNode;
  tableData: T[];
  tableColumns: any[];
  keyExtractor: (item: T) => string | number;
  loading?: boolean;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onRowClick?: (item: T) => void;
  kpis?: React.ReactNode;
  dialogs?: React.ReactNode;
}

export function MasterCrudPattern<T>({
  title,
  subtitle,
  primaryAction,
  secondaryActions,
  searchValue,
  onSearchChange,
  filters,
  tableData,
  tableColumns,
  keyExtractor,
  loading,
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onRowClick,
  kpis,
  dialogs
}: MasterCrudPatternProps<T>) {
  return (
    <PageContainer>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            {secondaryActions}
            {primaryAction}
          </div>
        }
      />

      {kpis && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{kpis}</div>}

      <DataTableToolbar
        search={<TableSearch value={searchValue} onChange={onSearchChange} />}
        filters={filters}
      />

      <ContentContainer className="p-0 overflow-hidden">
        <EnterpriseTable
          data={tableData}
          columns={tableColumns}
          keyExtractor={keyExtractor}
          loading={loading}
          onRowClick={onRowClick}
        />
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={onPageChange}
        />
      </ContentContainer>

      {dialogs}
    </PageContainer>
  );
}

/**
 * Enterprise Master-Detail Pattern
 * Split view with left listing and right detailed pane for deep inspection.
 */
export const MasterDetailPattern: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  leftList: React.ReactNode;
  rightDetail: React.ReactNode;
}> = ({ title, subtitle, actions, leftList, rightDetail }) => (
  <PageContainer>
    <PageHeader title={title} subtitle={subtitle} actions={actions} />
    <SplitLayout ratio="40/60" left={leftList} right={rightDetail} />
  </PageContainer>
);

/**
 * Enterprise Approval Workflow Pattern
 */
export const ApprovalWorkflowPattern: React.FC<{
  title: string;
  subtitle?: string;
  status: string;
  steps: { id: string; title: string; status: "completed" | "current" | "upcoming" }[];
  content: React.ReactNode;
  onApprove: () => void;
  onReject: () => void;
  loading?: boolean;
}> = ({ title, subtitle, status, steps, content, onApprove, onReject, loading }) => (
  <PageContainer>
    <PageHeader
      title={title}
      subtitle={subtitle}
      badge={<StatusBadge status={status} />}
    />

    <ContentContainer className="space-y-6">
      <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl">
        <Stepper steps={steps} />
      </div>

      <div className="p-2">{content}</div>

      <FormActions>
        <button
          type="button"
          onClick={onReject}
          disabled={loading}
          className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold rounded-xl cursor-pointer transition"
        >
          Rejeter
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={loading}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl cursor-pointer transition"
        >
          Approuver la demande
        </button>
      </FormActions>
    </ContentContainer>
  </PageContainer>
);
