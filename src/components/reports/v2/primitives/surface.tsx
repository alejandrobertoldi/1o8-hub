import type { ReactNode } from "react";

export function Surface({
  title,
  subtitle,
  tools,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  tools?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      /* Stable hook for print.css: break-inside: avoid + shadow removal. Do not
         replace with a class match — card styling changes, this contract does not. */
      data-report-card="true"
      className={`overflow-hidden rounded-[18px] border border-mf-line bg-white shadow-[0_10px_30px_rgba(16,34,39,0.12)] ${className}`}
    >
      {(title || tools) && (
        <div className="flex min-h-[54px] items-center justify-between gap-3.5 border-b border-mf-line px-[18px] py-3.5">
          <div>
            {title && <h3 className="m-0 text-[15px] font-bold tracking-tight text-mf-ink">{title}</h3>}
            {subtitle && <div className="text-xs text-mf-muted">{subtitle}</div>}
          </div>
          {tools && <div className="flex flex-wrap gap-2">{tools}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
