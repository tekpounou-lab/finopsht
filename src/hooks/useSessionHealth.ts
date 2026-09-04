import { useEffect } from "react";
import { useAuth } from "./useAuth";
import { SessionHealthService } from "../services/auth/SessionHealthService";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function useSessionHealth() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      SessionHealthService.stopMonitoring();
      return;
    }

    SessionHealthService.startMonitoring(
      (newContext) => {
        toast.info("Your permissions and workspace modules have been updated by administration.", {
          description: "Refreshing configuration...",
          duration: 4000
        });
        
        // Refresh page or trigger internal route re-resolution if necessary
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      },
      (reason) => {
        toast.error("Secure Session Terminated", {
          description: reason,
          duration: 6000
        });
        
        logout().then(() => {
          navigate("/");
        });
      },
      5 * 60 * 1000 // every 5 minutes
    );

    return () => {
      SessionHealthService.stopMonitoring();
    };
  }, [user, logout, navigate]);
}
