import React, { useState } from "react";
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Filter, 
  MoreVertical, 
  SlidersHorizontal, 
  Inbox,
  CheckSquare,
  Square
} from "lucide-react";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  accessor?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  align?: "left" | "center" | "right";
  hidden?: boolean;
  responsiveHidden?: 'sm' | 'md' | 'lg';
}

export interface EnterpriseTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string | number;
  loading?: boolean;
  emptyMessage?: string;
  selectable?: boolean;
  selectedKeys?: (string | number)[];
  onSelectionChange?: (keys: (string | number)[]) => void;
  density?: "compact" | "normal" | "spacious";
  onRowClick?: (row: T) => void;
  className?: string;
}

import { VirtualizedTable } from "./VirtualizedTable";
export { VirtualizedTable };

export function EnterpriseTable<T>({
  data,
  columns,
  keyExtractor,
  loading = false,
  emptyMessage = "Aucune donnée disponible",
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  density = "normal",
  onRowClick,
  className = ""
}: EnterpriseTableProps<T>) {
  if (data.length > 50) {
    return (
      <VirtualizedTable
        data={data}
        columns={columns}
        keyExtractor={keyExtractor}
        loading={loading}
        emptyMessage={emptyMessage}
        selectable={selectable}
        selectedKeys={selectedKeys}
        onSelectionChange={onSelectionChange}
        density={density}
        onRowClick={onRowClick}
        className={className}
      />
    );
  }
  const visibleColumns = columns.filter((c) => !c.hidden);

  const densityPadding = {
    compact: "py-2 px-3 text-xs",
    normal: "py-3.5 px-4 text-xs sm:text-sm",
    spacious: "py-4.5 px-5 text-sm"
  };

  const allSelected = data.length > 0 && data.every((d) => selectedKeys.includes(keyExtractor(d)));

  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(data.map(keyExtractor));
    }
  };

  const handleSelectRow = (key: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSelectionChange) return;
    if (selectedKeys.includes(key)) {
      onSelectionChange(selectedKeys.filter((k) => k !== key));
    } else {
      onSelectionChange([...selectedKeys, key]);
    }
  };

  return (
    <div className={`w-full overflow-hidden border border-slate-800 rounded-2xl bg-slate-900/60 backdrop-blur-sm ${className}`}>
      <div className="overflow-x-auto w-full">
        <table className="w-full min-w-[600px] sm:min-w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/90 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {selectable && (
                <th className={`w-10 ${densityPadding[density]}`}>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-slate-400 hover:text-slate-200 transition cursor-pointer flex items-center justify-center min-h-[44px] min-w-[44px]"
                  >
                    {allSelected ? <CheckSquare className="w-5 h-5 text-blue-400" /> : <Square className="w-5 h-5" />}
                  </button>
                </th>
              )}
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`${densityPadding[density]} ${
                    col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"
                  } ${col.responsiveHidden ? `hidden ${col.responsiveHidden}:table-cell` : ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {selectable && <td className={densityPadding[density]}><div className="h-4 bg-slate-800 rounded w-4" /></td>}
                  {visibleColumns.map((c) => (
                    <td key={c.key} className={`${densityPadding[density]} ${c.responsiveHidden ? `hidden ${c.responsiveHidden}:table-cell` : ''}`}>
                      <div className="h-4 bg-slate-800 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} className="py-12 text-center text-slate-500">
                  <TableEmptyState message={emptyMessage} />
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const key = keyExtractor(row);
                const isSelected = selectedKeys.includes(key);

                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick?.(row)}
                    className={`transition ${
                      isSelected ? "bg-blue-500/10 hover:bg-blue-500/15" : "hover:bg-slate-800/50"
                    } ${onRowClick ? "cursor-pointer" : ""}`}
                  >
                    {selectable && (
                      <td className={densityPadding[density]}>
                        <button
                          type="button"
                          onClick={(e) => handleSelectRow(key, e)}
                          className="text-slate-400 hover:text-slate-200 transition cursor-pointer flex items-center justify-center min-h-[44px] min-w-[44px]"
                        >
                          {isSelected ? <CheckSquare className="w-5 h-5 text-blue-400" /> : <Square className="w-5 h-5" />}
                        </button>
                      </td>
                    )}
                    {visibleColumns.map((col) => (
                      <td
                        key={col.key}
                        className={`${densityPadding[density]} text-slate-200 ${
                          col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"
                        } ${col.responsiveHidden ? `hidden ${col.responsiveHidden}:table-cell` : ''}`}
                      >
                        {col.accessor ? col.accessor(row) : (row as any)[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const DataGrid = EnterpriseTable;

export const TableSearch: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = "Rechercher dans la table..." }) => (
  <div className="relative min-w-[200px] sm:min-w-[280px]">
    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition"
    />
  </div>
);

export const TablePagination: React.FC<{
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}> = ({ currentPage, totalPages, pageSize, totalItems, onPageChange }) => {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-900/80 border-t border-slate-800 text-xs text-slate-400">
      <div>
        Affichage de <span className="font-semibold text-slate-200">{start}</span> à{" "}
        <span className="font-semibold text-slate-200">{end}</span> sur{" "}
        <span className="font-semibold text-slate-200">{totalItems}</span> résultats
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-slate-300 font-semibold px-2">
          {currentPage} / {totalPages || 1}
        </span>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const DataTableToolbar: React.FC<{
  search?: React.ReactNode;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ search, filters, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-900/80 border border-slate-800 rounded-2xl mb-3">
    <div className="flex items-center gap-2 flex-wrap">
      {search}
      {filters}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const ColumnSelector = () => null;
export const ColumnVisibilityMenu = () => null;
export const TableFilters = () => null;

export const TableExportMenu: React.FC<{ onExportCsv?: () => void; onExportExcel?: () => void }> = ({
  onExportCsv,
  onExportExcel
}) => (
  <button
    type="button"
    onClick={onExportCsv || onExportExcel}
    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 cursor-pointer transition"
  >
    <Download className="w-3.5 h-3.5" />
    <span>Exporter</span>
  </button>
);

export const TableDensitySelector: React.FC<{
  density: "compact" | "normal" | "spacious";
  onChange: (d: "compact" | "normal" | "spacious") => void;
}> = ({ density, onChange }) => (
  <div className="flex items-center border border-slate-800 rounded-xl p-0.5 bg-slate-950">
    {(["compact", "normal", "spacious"] as const).map((d) => (
      <button
        key={d}
        type="button"
        onClick={() => onChange(d)}
        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg capitalize transition cursor-pointer ${
          density === d ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"
        }`}
      >
        {d}
      </button>
    ))}
  </div>
);

export const TableEmptyState: React.FC<{ message?: string; action?: React.ReactNode }> = ({
  message = "Aucun enregistrement trouvé",
  action
}) => (
  <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
    <div className="p-3 bg-slate-800/80 rounded-2xl text-slate-400">
      <Inbox className="w-8 h-8" />
    </div>
    <div className="text-xs sm:text-sm font-semibold text-slate-400 max-w-sm">{message}</div>
    {action}
  </div>
);

export const StickyTableHeader = () => null;

export const RowActions: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-1.5 justify-end">{children}</div>
);

export const BulkActionsToolbar: React.FC<{
  selectedCount: number;
  onClearSelection: () => void;
  children: React.ReactNode;
}> = ({ selectedCount, onClearSelection, children }) => {
  if (selectedCount === 0) return null;

  return (
    <div className="p-3 bg-blue-950/60 border border-blue-800/80 rounded-2xl flex items-center justify-between gap-3 text-xs text-blue-200 mb-3 animate-fadeIn">
      <div className="flex items-center gap-2">
        <span className="font-bold">{selectedCount}</span> éléments sélectionnés
        <button
          type="button"
          onClick={onClearSelection}
          className="underline hover:text-white transition ml-2 cursor-pointer"
        >
          Désélectionner
        </button>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
};
