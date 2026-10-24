import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { LogOut, Menu, Phone, UserRound, X } from "lucide-react";
import { useCustomer, useLogout } from "@client/hooks/useCustomer";
import { cn } from "@client/lib/cn";
import { useSettings } from "@client/hooks/useSettings";
import { formatPhone, telHref } from "@client/lib/contact";
import { ButtonLink } from "@client/components/ui/Button";
import { Logo } from "./Logo";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/tours", label: "Explore Tours" },
  { to: "/booking/lookup", label: "My Booking" },
  { to: "/contact", label: "Contact" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const [menuPath, setMenuPath] = useState(pathname);
  const { data: settings } = useSettings();
  const { data: customer } = useCustomer();
  const logout = useLogout();
  // Close the mobile menu whenever the route changes.
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 bg-forest-700 text-white shadow-[0_1px_0_rgb(255_255_255/0.06)]">
      <div className="container-page flex h-20 items-center justify-between gap-6 lg:h-24">
        <Link to="/" className="shrink-0" aria-label="Her Journey Tours and Travels home">
          <Logo className="h-16 lg:h-20" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-white/10 text-white" : "text-forest-100 hover:text-white",
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {settings?.phonePrimary && (
            <a href={telHref(settings.phonePrimary)} className="hidden items-center gap-2 text-sm text-forest-100 hover:text-white xl:flex">
              <Phone className="size-4 text-sun-400" />
              {formatPhone(settings.phonePrimary)}
            </a>
          )}
          {customer ? (
            <Link to="/account" className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-white ring-1 ring-white/30 hover:bg-white/10">
              <UserRound className="size-4 text-sun-400" />
              {customer.fullName.split(" ")[0]}
            </Link>
          ) : (
            <>
              <Link to="/login" state={{ from: pathname }} className="rounded-full px-3 py-2 text-sm font-medium text-white hover:bg-white/10">
                Log in
              </Link>
              <Link to="/register" state={{ from: pathname }} className="rounded-full px-4 py-2 text-sm font-medium text-white ring-1 ring-white/40 hover:bg-white/10">
                Sign up
              </Link>
            </>
          )}
          <ButtonLink to="/tours" variant="accent">
            Book a Tour
          </ButtonLink>
        </div>

        <button
          className="rounded-full p-2 text-white hover:bg-white/10 lg:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" className="animate-fade-in border-t border-white/10 bg-forest-800 lg:hidden" aria-label="Mobile">
          <div className="container-page flex flex-col gap-1 py-4">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cn("rounded-xl px-4 py-3 text-base font-medium", isActive ? "bg-white/10 text-white" : "text-forest-100")
                }
              >
                {l.label}
              </NavLink>
            ))}
            {settings?.phonePrimary && (
              <a href={telHref(settings.phonePrimary)} className="flex items-center gap-2 px-4 py-3 text-forest-100">
                <Phone className="size-4 text-sun-400" /> {formatPhone(settings.phonePrimary)}
              </a>
            )}
            <div className="mt-2 border-t border-white/10 pt-3">
              {customer ? (
                <>
                  <NavLink to="/account" className="flex items-center gap-2 rounded-xl px-4 py-3 text-base font-medium text-forest-100">
                    <UserRound className="size-4 text-sun-400" /> My account ({customer.fullName.split(" ")[0]})
                  </NavLink>
                  <button onClick={() => logout.mutate()} className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left text-base font-medium text-forest-100">
                    <LogOut className="size-4 text-sun-400" /> Log out
                  </button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2 px-1">
                  <Link to="/login" state={{ from: pathname }} className="rounded-full px-4 py-2.5 text-center text-sm font-semibold text-white ring-1 ring-white/40">
                    Log in
                  </Link>
                  <Link to="/register" state={{ from: pathname }} className="rounded-full bg-white px-4 py-2.5 text-center text-sm font-semibold text-forest-800">
                    Sign up
                  </Link>
                </div>
              )}
            </div>
            <ButtonLink to="/tours" variant="accent" className="mt-2">
              Book a Tour
            </ButtonLink>
          </div>
        </nav>
      )}
    </header>
  );
}
