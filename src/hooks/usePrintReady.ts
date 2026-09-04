import { useState, useCallback, useEffect } from 'react';

export function usePrintReady() {
  const [isLayoutReady, setIsLayoutReady] = useState(false);

  // Simulation: We assume the layout is ready after fonts/images load.
  // In a real app we'd wait for document.fonts.ready and image onload.
  useEffect(() => {
    let mounted = true;
    document.fonts.ready.then(() => {
      // Add a tiny delay to ensure React commits
      setTimeout(() => {
        if (mounted) setIsLayoutReady(true);
      }, 500);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return { isLayoutReady };
}
