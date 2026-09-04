import { useState, useEffect } from "react";

export function useSidebarState() {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem("finops-sidebar-collapsed");
    return saved === "true";
  });

  useEffect(() => {
    localStorage.setItem("finops-sidebar-collapsed", String(isCollapsed));
  }, [isCollapsed]);

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  return { isCollapsed, toggleSidebar, setIsCollapsed };
}
