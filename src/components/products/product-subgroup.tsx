"use client";

type Props = {
  name: string;
  children: React.ReactNode;
};

export function ProductSubgroup({ name, children }: Props) {
  if (!name) {
    // No subgroup label — just render the fields in a grid
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-brand border-b border-border pb-1">
        {name}
      </h4>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        {children}
      </div>
    </div>
  );
}
