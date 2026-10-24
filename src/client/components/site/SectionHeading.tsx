import type { ReactNode } from "react";
import { cn } from "@client/lib/cn";

export function SectionHeading({
  eyebrow,
  title,
  children,
  action,
  center,
  className,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", center && "items-center text-center sm:flex-col sm:items-center", className)}>
      <div className={cn("max-w-2xl", center && "mx-auto")}>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="mt-2 text-3xl font-bold sm:text-4xl">{title}</h2>
        {children && <p className="mt-3 text-base leading-relaxed text-muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}
