import React from "react";

export interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: "full" | "7xl" | "6xl" | "5xl" | "4xl";
}

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  className = "",
  maxWidth = "full"
}) => {
  const maxWidthMap = {
    full: "w-full max-w-full",
    "7xl": "max-w-7xl mx-auto",
    "6xl": "max-w-6xl mx-auto",
    "5xl": "max-w-5xl mx-auto",
    "4xl": "max-w-4xl mx-auto"
  };

  return (
    <div className={`p-3 sm:p-5 lg:p-6 space-y-4 sm:space-y-6 ${maxWidthMap[maxWidth]} ${className}`}>
      {children}
    </div>
  );
};

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  badge,
  actions,
  breadcrumbs,
  className = ""
}) => {
  return (
    <div className={`flex flex-col gap-3 pb-4 sm:pb-5 border-b border-slate-800/80 ${className}`}>
      {breadcrumbs && <div className="text-xs text-slate-400">{breadcrumbs}</div>}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle && (
            <p className="text-xs sm:text-sm text-slate-400 font-medium max-w-3xl leading-normal">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

export const PageActions: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = ""
}) => (
  <div className={`flex items-center gap-2 sm:gap-3 ${className}`}>{children}</div>
);

export const PageToolbar: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = ""
}) => (
  <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 bg-slate-900/80 border border-slate-800 rounded-2xl ${className}`}>
    {children}
  </div>
);

export const PageSection: React.FC<{
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, description, actions, children, className = "" }) => (
  <section className={`space-y-3.5 sm:space-y-4 ${className}`}>
    {(title || actions) && (
      <div className="flex items-center justify-between gap-3">
        <div>
          {title && <h2 className="text-base sm:text-lg font-bold text-slate-100">{title}</h2>}
          {description && <p className="text-xs text-slate-400">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    )}
    <div>{children}</div>
  </section>
);

export const ContentContainer: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = ""
}) => (
  <div className={`bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-6 backdrop-blur-sm ${className}`}>
    {children}
  </div>
);

export const AppShell: React.FC<{
  sidebar?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ sidebar, header, children, footer }) => (
  <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-500/30 selection:text-blue-200">
    {header}
    <div className="flex-1 flex min-h-0">
      {sidebar}
      <main className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        {children}
        {footer}
      </main>
    </div>
  </div>
);

export const SidebarLayout: React.FC<{
  sidebar: React.ReactNode;
  children: React.ReactNode;
  sidebarWidth?: string;
}> = ({ sidebar, children, sidebarWidth = "w-64" }) => (
  <div className="flex flex-col md:flex-row gap-6 w-full">
    <div className={`shrink-0 ${sidebarWidth}`}>{sidebar}</div>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

export const SplitLayout: React.FC<{
  left: React.ReactNode;
  right: React.ReactNode;
  ratio?: "50/50" | "60/40" | "70/30" | "40/60" | "30/70";
}> = ({ left, right, ratio = "50/50" }) => {
  const ratioMap = {
    "50/50": "lg:grid-cols-2",
    "60/40": "lg:grid-cols-[1.5fr_1fr]",
    "70/30": "lg:grid-cols-[2.3fr_1fr]",
    "40/60": "lg:grid-cols-[1fr_1.5fr]",
    "30/70": "lg:grid-cols-[1fr_2.3fr]"
  };

  return (
    <div className={`grid grid-cols-1 ${ratioMap[ratio]} gap-4 sm:gap-6 w-full`}>
      <div className="min-w-0">{left}</div>
      <div className="min-w-0">{right}</div>
    </div>
  );
};

export const Stack: React.FC<{
  children: React.ReactNode;
  direction?: "row" | "col";
  gap?: 1 | 2 | 3 | 4 | 6 | 8;
  className?: string;
}> = ({ children, direction = "col", gap = 4, className = "" }) => {
  const gapClasses = {
    1: "gap-1",
    2: "gap-2",
    3: "gap-3",
    4: "gap-4",
    6: "gap-6",
    8: "gap-8"
  };

  return (
    <div className={`flex flex-${direction} ${gapClasses[gap]} ${className}`}>
      {children}
    </div>
  );
};

export const Grid: React.FC<{
  children: React.ReactNode;
  cols?: 1 | 2 | 3 | 4 | 5 | 6 | 12;
  gap?: 2 | 3 | 4 | 6 | 8;
  className?: string;
}> = ({ children, cols = 3, gap = 4, className = "" }) => {
  const colsClasses = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
    12: "grid-cols-12"
  };

  const gapClasses = {
    2: "gap-2",
    3: "gap-3",
    4: "gap-4",
    6: "gap-6",
    8: "gap-8"
  };

  return (
    <div className={`grid ${colsClasses[cols]} ${gapClasses[gap]} ${className}`}>
      {children}
    </div>
  );
};

export const ResponsiveGrid: React.FC<{
  children: React.ReactNode;
  minWidth?: number;
  gap?: number;
  className?: string;
}> = ({ children, minWidth = 280, gap = 16, className = "" }) => (
  <div
    className={`grid ${className}`}
    style={{
      gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
      gap: `${gap}px`
    }}
  >
    {children}
  </div>
);

export const Spacer: React.FC<{ size?: 1 | 2 | 3 | 4 | 6 | 8 | 12 }> = ({ size = 4 }) => {
  const heightClasses = {
    1: "h-1",
    2: "h-2",
    3: "h-3",
    4: "h-4",
    6: "h-6",
    8: "h-8",
    12: "h-12"
  };
  return <div className={`w-full ${heightClasses[size]}`} aria-hidden="true" />;
};
