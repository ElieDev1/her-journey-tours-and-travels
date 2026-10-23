import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@client/lib/cn";

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );
  const btn = "inline-flex size-10 items-center justify-center rounded-full text-sm font-semibold transition-colors";
  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button className={cn(btn, "hover:bg-forest-50 disabled:opacity-40")} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        <ChevronLeft className="size-4" />
      </button>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - pages[i - 1]! > 1 && <span className="px-1 text-muted">…</span>}
          <button
            className={cn(btn, p === page ? "bg-forest-700 text-white" : "text-forest-800 hover:bg-forest-50")}
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        </span>
      ))}
      <button className={cn(btn, "hover:bg-forest-50 disabled:opacity-40")} disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page">
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}
