import type { ReactNode } from "react";
import { Link } from "react-router";

export function StatCard({ label, value, icon, to, tone = "forest" }: { label: string; value: ReactNode; icon: ReactNode; to?: string; tone?: "forest" | "sun" | "sage" | "info" }) {
  const tones = {
    forest: "bg-forest-50 text-forest-700",
    sun: "bg-sun-100 text-sun-700",
    sage: "bg-sage-100 text-sage-700",
    info: "bg-info-50 text-info-600",
  };
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className={`rounded-xl p-2 ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-forest-950 tabular-nums">{value}</p>
    </>
  );
  const cls = "block rounded-2xl bg-white p-5 shadow-card ring-1 ring-line/70";
  return to ? <Link to={to} className={`${cls} transition-shadow hover:shadow-lift`}>{body}</Link> : <div className={cls}>{body}</div>;
}
