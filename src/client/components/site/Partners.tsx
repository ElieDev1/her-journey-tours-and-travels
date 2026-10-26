import { cn } from "@client/lib/cn";

// Hosted on media.icyuzi.rw, which is allowed in the img-src CSP (security.ts and public/_headers).
export const PARTNERS = [
  { name: "Data Protection and Privacy Officer (DPO)", logo: "https://media.icyuzi.rw/new/data%20profection%20and%20pricacy%20officer%20(DPO).png" },
  { name: "Rwanda ICT Chamber", logo: "https://media.icyuzi.rw/new/ICT%20chamber.jpg" },
];

export const TRUST_SEAL = { name: "Trust seal", logo: "https://media.icyuzi.rw/new/seal.jpeg" };

export function PartnerLogos({ className, logoClassName }: { className?: string; logoClassName?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-4", className)}>
      {PARTNERS.map((p) => (
        <li key={p.name} className="rounded-2xl bg-white p-3 ring-1 ring-line/60">
          <img src={p.logo} alt={p.name} title={p.name} loading="lazy" className={cn("h-14 w-auto object-contain", logoClassName)} />
        </li>
      ))}
    </ul>
  );
}

export function TrustSeal({ className }: { className?: string }) {
  return (
    <img
      src={TRUST_SEAL.logo}
      alt={`${TRUST_SEAL.name}: verified and trusted business`}
      title="Verified and trusted business"
      loading="lazy"
      className={cn("h-24 w-auto object-contain", className)}
    />
  );
}
