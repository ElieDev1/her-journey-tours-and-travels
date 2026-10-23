import type { ReactNode } from "react";

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line bg-white/60 px-6 py-14 text-center">
      {icon && <div className="mb-4 rounded-full bg-forest-50 p-3 text-forest-600">{icon}</div>}
      <h3 className="font-sans text-base font-semibold text-forest-900">{title}</h3>
      {children && <div className="mt-1.5 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-3xl border border-danger-600/20 bg-danger-50 px-6 py-10 text-center">
      <p className="font-semibold text-danger-700">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 text-sm font-semibold text-forest-700 underline underline-offset-4">
          Try again
        </button>
      )}
    </div>
  );
}
