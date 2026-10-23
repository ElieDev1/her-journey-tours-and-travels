import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { Menu, Phone, X } from "lucide-react";
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

        <div className="hidden items-center gap-4 lg:flex">
          {settings?.phonePrimary && (
            <a href={telHref(settings.phonePrimary)} className="flex items-center gap-2 text-sm text-forest-100 hover:text-white">
              <Phone className="size-4 text-sun-400" />
              {formatPhone(settings.phonePrimary)}
            </a>
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
            <ButtonLink to="/tours" variant="accent" className="mt-2">
              Book a Tour
            </ButtonLink>
          </div>
        </nav>
      )}
    </header>
  );
}
