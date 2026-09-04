import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { CheckSquare, Square, Inbox } from "lucide-react";
import { Column } from "./EnterpriseTables";

export interface VirtualizedTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string | number;
  rowHeight?: number;
  containerHeight?: number;
  loading?: boolean;
  emptyMessage?: string;
  selectable?: boolean;
  selectedKeys?: (string | number)[];
  onSelectionChange?: (keys: (string | number)[]) => void;
  density?: "compact" | "normal" | "spacious";
  onRowClick?: (row: T) => void;
  className?: string;
  onEndReached?: () => void;
  endReachedThreshold?: number;
  footerContent?: React.ReactNode;
}

export function VirtualizedTable<T>({
  data,
  columns,
  keyExtractor,
  rowHeight = 56,
  containerHeight = 400,
  loading = false,
  emptyMessage = "Aucune donnée disponible",
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  density = "normal",
  onRowClick,
  className = "",
  onEndReached,
  endReachedThreshold = 80,
  footerContent
}: VirtualizedTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const visibleColumns = useMemo(() => columns.filter((c) => !c.hidden), [columns]);

  const densityPadding = {
    compact: "py-2 px-3 text-xs",
    normal: "py-3 px-4 text-xs sm:text-sm",
    spacious: "py-4 px-5 text-sm"
  };

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop: st, scrollHeight, clientHeight } = containerRef.current;
      setScrollTop(st);

      if (onEndReached && scrollHeight - (st + clientHeight) < endReachedThreshold) {
        onEndReached();
      }
    }
  }, [onEndReached, endReachedThreshold]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Calculate visible row slice for windowing
  const totalRows = data.length;
  const totalHeight = totalRows * rowHeight;
  const buffer = 5;

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
  const endIndex = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / rowHeight) + buffer);

  const visibleData = useMemo(() => {
    return data.slice(startIndex, endIndex);
  }, [data, startIndex, endIndex]);

  const paddingTop = startIndex * rowHeight;
  const paddingBottom = Math.max(0, totalHeight - endIndex * rowHeight);

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
      <div
        ref={containerRef}
        style={{ maxHeight: containerHeight, overflowY: "auto" }}
        className="w-full text-left scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent overflow-x-auto"
      >
        <table className="w-full min-w-[600px] sm:min-w-full text-left border-collapse">
          <thead className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800 shadow-sm">
            <tr className="text-xs font-semibold uppercase tracking-wider text-slate-400">
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
              Array.from({ length: 6 }).map((_, i) => (
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
                  <div className="flex flex-col items-center justify-center p-6 text-center space-y-2">
                    <Inbox className="w-8 h-8 text-slate-500" />
                    <p className="text-xs text-slate-400">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr>
                    <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} style={{ height: paddingTop }} />
                  </tr>
                )}
                {visibleData.map((row) => {
                  const key = keyExtractor(row);
                  const isSelected = selectedKeys.includes(key);
                  return (
                    <tr
                      key={key}
                      onClick={() => onRowClick?.(row)}
                      style={{ height: rowHeight }}
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
                })}
                {paddingBottom > 0 && (
                  <tr>
                    <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} style={{ height: paddingBottom }} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      {footerContent && (
        <div className="border-t border-slate-800 bg-slate-900/90 px-4 py-3">
          {footerContent}
        </div>
      )}
    </div>
  );
}
