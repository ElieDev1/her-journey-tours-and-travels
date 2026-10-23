import { cn } from "@client/lib/cn";

/** The official logo lockup, used unmodified on a matching brand-green surface. */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/brand/logo-header.webp"
      srcSet="/brand/logo-header.webp 556w, /brand/logo-lockup.webp 1112w"
      sizes="160px"
      alt="Her Journey Tours and Travels"
      width={556}
      height={320}
      className={cn("w-auto", className)}
    />
  );
}
