import type { ReactNode } from "react";
import { Surface } from "./surface";

export function ChartFrame({
  title,
  subtitle,
  tools,
  summary,
  legend,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  tools?: ReactNode;
  summary?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Surface title={title} subtitle={subtitle} tools={tools} className={className}>
      <div className="p-[18px]">
        {summary && <div className="mb-3.5">{summary}</div>}
        {children}
        {legend && <div className="mt-2 flex flex-wrap justify-center gap-4 text-[11px] text-mf-muted">{legend}</div>}
      </div>
    </Surface>
  );
}
