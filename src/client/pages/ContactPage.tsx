import { Mail, MapPin, MessageCircle, Phone, Smartphone } from "lucide-react";
import { useSettings } from "@client/hooks/useSettings";
import { useDocumentMeta } from "@client/lib/useDocumentMeta";
import { formatPhone, telHref, whatsappHref } from "@client/lib/contact";
import { PageLoader } from "@client/components/ui/Spinner";
import type { ReactNode } from "react";

function ContactCard({ icon, label, children, href }: { icon: ReactNode; label: string; children: ReactNode; href?: string }) {
  const inner = (
    <>
      <span className="rounded-2xl bg-forest-50 p-3 text-forest-700">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-muted">{label}</span>
        <span className="mt-0.5 block font-semibold break-words text-forest-900">{children}</span>
      </span>
    </>
  );
  const cls = "flex items-center gap-4 rounded-3xl bg-white p-6 shadow-card ring-1 ring-line/60";
  return href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={`${cls} transition-shadow hover:shadow-lift`}>{inner}</a> : <div className={cls}>{inner}</div>;
}

export function ContactPage() {
  const { data: s, isPending } = useSettings();
  useDocumentMeta("Contact us | Her Journey Tours and Travels", "Call, WhatsApp or email Her Journey Tours and Travels to plan your trip.");
  if (isPending || !s) return <PageLoader />;
  return (
    <>
      <section className="bg-forest-700 py-20 text-white">
        <div className="container-page">
          <p className="eyebrow text-sun-300">Contact</p>
          <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">We'd love to hear from you</h1>
          <p className="mt-4 max-w-xl text-forest-100">Questions about a tour, group bookings or payments? Reach us by phone, WhatsApp or email.</p>
        </div>
      </section>
      <div className="container-page grid gap-5 py-16 sm:grid-cols-2 lg:grid-cols-3">
        {s.phonePrimary && <ContactCard icon={<Phone className="size-5" />} label="Bookings" href={telHref(s.phonePrimary)}>{formatPhone(s.phonePrimary)}</ContactCard>}
        {s.phoneSecondary && <ContactCard icon={<Phone className="size-5" />} label="Alternative number" href={telHref(s.phoneSecondary)}>{formatPhone(s.phoneSecondary)}</ContactCard>}
        {s.whatsappNumber && <ContactCard icon={<MessageCircle className="size-5" />} label="WhatsApp" href={whatsappHref(s.whatsappNumber)}>Chat with us</ContactCard>}
        {s.contactEmail && <ContactCard icon={<Mail className="size-5" />} label="Email" href={`mailto:${s.contactEmail}`}>{s.contactEmail}</ContactCard>}
        {s.address && <ContactCard icon={<MapPin className="size-5" />} label="Address">{s.address}</ContactCard>}
        {s.momoPayCode && <ContactCard icon={<Smartphone className="size-5" />} label={`MoMo Pay · ${s.momoMerchantName}`}><span className="font-mono tracking-widest">{s.momoPayCode}</span></ContactCard>}
      </div>
    </>
  );
}
