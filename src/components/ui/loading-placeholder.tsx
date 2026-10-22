import { cn } from "@/lib/utils";

interface LoadingPlaceholderProps {
  count?: number;
  height?: string;
  className?: string;
}

export function LoadingPlaceholder({
  count = 1,
  height = "h-56",
  className,
}: LoadingPlaceholderProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-xl border bg-accent animate-pulse",
            height,
            className
          )}
          style={{ animationDelay: `${i * 100}ms` }}
        />
      ))}
    </>
  );
}
