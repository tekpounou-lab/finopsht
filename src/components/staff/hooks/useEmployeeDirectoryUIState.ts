import { useState, useEffect } from "react";
import { Employee } from "../../../types";

export function useEmployeeDirectoryUIState() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [hideInactive, setHideInactive] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState(false);

  // Status Action Modal Targets
  const [suspendTarget, setSuspendTarget] = useState<Employee | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<Employee | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset pagination on search / filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, hideInactive]);

  // Workforce Identity Observability states
  const [subTab, setSubTab] = useState<"directory" | "observability">("directory");
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string>("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // QR Drawer States
  const [isQrDrawerOpen, setIsQrDrawerOpen] = useState(false);
  const [qrActiveTab, setQrActiveTab] = useState<"generator" | "scanner">("generator");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [scanMode, setScanMode] = useState<"IN" | "OUT" | "AUTO">("AUTO");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [scannerFeedback, setScannerFeedback] = useState<{ status: string; message: string }>({
    status: "idle",
    message: "",
  });
  const [recentScans, setRecentScans] = useState<{ id: string; name: string; time: string; status: "IN" | "OUT" | "ERROR" }[]>([]);

  return {
    searchQuery, setSearchQuery,
    debouncedSearchQuery, setDebouncedSearchQuery,
    hideInactive, setHideInactive,
    isDbConnected, setIsDbConnected,
    suspendTarget, setSuspendTarget,
    reactivateTarget, setReactivateTarget,
    currentPage, setCurrentPage,
    pageSize, setPageSize,
    subTab, setSubTab,
    auditLogs, setAuditLogs,
    isSyncing, setIsSyncing,
    syncFeedback, setSyncFeedback,
    expandedLogId, setExpandedLogId,
    isQrDrawerOpen, setIsQrDrawerOpen,
    qrActiveTab, setQrActiveTab,
    selectedEmployeeId, setSelectedEmployeeId,
    scanMode, setScanMode,
    isCameraActive, setIsCameraActive,
    isProcessing, setIsProcessing,
    isMuted, setIsMuted,
    scannerFeedback, setScannerFeedback,
    recentScans, setRecentScans,
  };
}
