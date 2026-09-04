import React, { useRef, useState, useEffect } from "react";
import { ResponsiveContainer } from "recharts";

interface SafeChartContainerProps {
  children: React.ReactElement;
  height?: number | string;
  minHeight?: number;
  aspect?: number;
  className?: string;
  id?: string;
}

export const SafeChartContainer: React.FC<SafeChartContainerProps> = ({
  children,
  height = "100%",
  minHeight = 220,
  aspect,
  className = "w-full h-full relative",
  id
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let animationFrameId: number;

    const measureElement = () => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = Math.floor(rect.width || el.clientWidth || 0);
      const h = Math.floor(rect.height || el.clientHeight || (typeof minHeight === "number" ? minHeight : 220));
      
      // Strict threshold: width and height must be >= 10px to mount ResponsiveContainer
      if (w >= 10 && h >= 10) {
        setDimensions((prev) => {
          if (prev && prev.width === w && prev.height === h) return prev;
          return { width: w, height: h };
        });
      }
    };

    // Initial check
    measureElement();

    const observer = new ResizeObserver((entries) => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        for (const entry of entries) {
          const w = Math.floor(entry.contentRect.width || 0);
          const h = Math.floor(entry.contentRect.height || (typeof minHeight === "number" ? minHeight : 220));
          if (w >= 10 && h >= 10) {
            setDimensions((prev) => {
              if (prev && prev.width === w && prev.height === h) return prev;
              return { width: w, height: h };
            });
          }
        }
      });
    });

    observer.observe(el);

    // Re-check on window resize / tab focus
    window.addEventListener("resize", measureElement);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      observer.disconnect();
      window.removeEventListener("resize", measureElement);
    };
  }, [minHeight]);

  const isReady = Boolean(dimensions && dimensions.width >= 10 && dimensions.height >= 10);

  return (
    <div
      ref={containerRef}
      id={id}
      className={className}
      style={{
        minHeight: typeof minHeight === "number" ? `${minHeight}px` : minHeight,
        height: typeof height === "number" ? `${height}px` : height,
        width: "100%",
        minWidth: "100%",
        display: "block",
        position: "relative"
      }}
    >
      {isReady && dimensions ? (
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={10}
          minHeight={10}
          aspect={aspect}
          initialDimension={{ width: dimensions.width, height: dimensions.height }}
        >
          {children}
        </ResponsiveContainer>
      ) : (
        <div 
          className="w-full h-full flex items-center justify-center bg-slate-900/10 dark:bg-slate-900/30 rounded-xl border border-slate-700/20 dark:border-slate-800/40 p-4"
          style={{ minHeight: typeof minHeight === "number" ? `${minHeight}px` : minHeight }}
        >
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-cyan-500/60" />
            Chargement de la visualisation...
          </div>
        </div>
      )}
    </div>
  );
};

export default SafeChartContainer;
