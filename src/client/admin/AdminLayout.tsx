import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarCheck,
  ExternalLink,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageSquareQuote,
  ScrollText,
  Settings,
  UserCog,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { Permission } from "@shared/constants";
import { ROLE_LABELS } from "@shared/constants";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { SESSION_KEY, useCan, useSession } from "./session";

const nav: Array<{ to: string; label: string; icon: typeof Map; end?: boolean; permission?: Permission }> = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/tours", label: "Tours", icon: Map },
  { to: "/admin/categories", label: "Categories", icon: FolderTree },
  { to: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/admin/payments", label: "Payments", icon: Wallet },
  { to: "/admin/reviews", label: "Reviews", icon: MessageSquareQuote },
  { to: "/admin/settings", label: "Site settings", icon: Settings },
  { to: "/admin/users", label: "Administrators", icon: Users, permission: "users:manage" },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText, permission: "audit:read" },
];

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  const can = useCan();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api.post("/api/admin/auth/logout"),
    onSettled: () => {
      queryClient.setQueryData(SESSION_KEY, null);
      queryClient.removeQueries({ queryKey: ["admin"], predicate: (q) => q.queryKey[1] !== "session" });
      navigate("/admin/login", { replace: true });
    },
  });

  const sidebar = (
    <div className="flex h-full flex-col bg-forest-800 text-forest-100">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <img src="/brand/logo-header.webp" alt="Her Journey Tours and Travels" className="h-20 w-auto" />
        <button className="rounded-lg p-1.5 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="size-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Admin">
        {nav
          .filter((n) => !n.permission || can(n.permission))
          .map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-white/12 text-white shadow-[inset_3px_0_0_var(--color-sun-400)]" : "text-forest-200 hover:bg-white/5 hover:text-white",
                )
              }
            >
              <Icon className="size-4.5" /> {label}
            </NavLink>
          ))}
      </nav>
      <div className="space-y-1 border-t border-white/10 p-3">
        <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-forest-200 hover:bg-white/5 hover:text-white">
          <ExternalLink className="size-4" /> View website
        </a>
        <NavLink to="/admin/account" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-forest-200 hover:bg-white/5 hover:text-white">
          <UserCog className="size-4" /> My account
        </NavLink>
        {session && (
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-sun-400 text-sm font-bold text-forest-950">
              {session.user.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{session.user.name}</p>
              <p className="flex items-center gap-1 text-xs text-forest-300"><BadgeCheck className="size-3" />{ROLE_LABELS[session.user.role]}</p>
            </div>
            <button onClick={() => logout.mutate()} className="rounded-lg p-2 text-forest-200 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f6f5f0]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-forest-950/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-fade-in">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-sand" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <span className="font-semibold text-forest-900">Her Journey Admin</span>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
