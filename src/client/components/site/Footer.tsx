import { Link } from "react-router";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { FacebookIcon, InstagramIcon, TikTokIcon } from "./SocialIcons";
import { useSettings } from "@client/hooks/useSettings";
import { formatPhone, telHref, whatsappHref } from "@client/lib/contact";
import { Logo } from "./Logo";

export function Footer() {
  const { data: s } = useSettings();
  const year = new Date().getFullYear();
  return (
    <footer className="bg-forest-700 text-forest-100">
      <div className="container-page grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <Logo className="h-28" />
          {s?.tagline && <p className="mt-5 max-w-xs text-sm leading-relaxed text-forest-200">{s.tagline}</p>}
          <div className="mt-6 flex gap-3">
            {s?.social.instagram && (
              <a href={s.social.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="rounded-full bg-white/10 p-2.5 hover:bg-white/20">
                <InstagramIcon className="size-4" />
              </a>
            )}
            {s?.social.facebook && (
              <a href={s.social.facebook} target="_blank" rel="noreferrer" aria-label="Facebook" className="rounded-full bg-white/10 p-2.5 hover:bg-white/20">
                <FacebookIcon className="size-4" />
              </a>
            )}
            {s?.social.tiktok && (
              <a href={s.social.tiktok} target="_blank" rel="noreferrer" aria-label="TikTok" className="rounded-full bg-white/10 p-2.5 hover:bg-white/20">
                <TikTokIcon className="size-4" />
              </a>
            )}
            {s?.whatsappNumber && (
              <a href={whatsappHref(s.whatsappNumber)} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="rounded-full bg-white/10 p-2.5 hover:bg-white/20">
                <MessageCircle className="size-4" />
              </a>
            )}
          </div>
        </div>

        <div>
          <h2 className="font-sans text-sm font-semibold tracking-[0.16em] text-sage-300 uppercase">Explore</h2>
          <ul className="mt-5 space-y-3 text-sm">
            <li><Link to="/tours" className="hover:text-white">All tours</Link></li>
            <li><Link to="/tours?sort=upcoming" className="hover:text-white">Upcoming departures</Link></li>
            <li><Link to="/tours?featured=1" className="hover:text-white">Featured trips</Link></li>
            <li><Link to="/booking/lookup" className="hover:text-white">Find my booking</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="font-sans text-sm font-semibold tracking-[0.16em] text-sage-300 uppercase">Contact</h2>
          <ul className="mt-5 space-y-3 text-sm">
            {s?.phonePrimary && (
              <li>
                <a href={telHref(s.phonePrimary)} className="flex items-center gap-2.5 hover:text-white">
                  <Phone className="size-4 text-sun-400" /> {formatPhone(s.phonePrimary)}
                </a>
              </li>
            )}
            {s?.phoneSecondary && (
              <li>
                <a href={telHref(s.phoneSecondary)} className="flex items-center gap-2.5 hover:text-white">
                  <Phone className="size-4 text-sun-400" /> {formatPhone(s.phoneSecondary)}
                </a>
              </li>
            )}
            {s?.contactEmail && (
              <li>
                <a href={`mailto:${s.contactEmail}`} className="flex items-center gap-2.5 hover:text-white">
                  <Mail className="size-4 text-sun-400" /> {s.contactEmail}
                </a>
              </li>
            )}
            {s?.address && (
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-sun-400" /> {s.address}
              </li>
            )}
          </ul>
        </div>

        <div>
          <h2 className="font-sans text-sm font-semibold tracking-[0.16em] text-sage-300 uppercase">Pay with MoMo</h2>
          <p className="mt-5 text-sm leading-relaxed text-forest-200">
            Book online, then pay securely with MTN MoMo Pay using our merchant code:
          </p>
          {s?.momoPayCode && (
            <p className="mt-3 inline-flex items-center rounded-2xl bg-white/10 px-4 py-2 font-mono text-xl font-semibold tracking-widest text-sun-300">
              {s.momoPayCode}
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-forest-300 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {s?.companyName ?? "Her Journey Tours and Travels"}. All rights reserved.</p>
          <p className="flex flex-wrap gap-x-5 gap-y-1">
            <Link to="/privacy" className="hover:text-white">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-white">Terms and Conditions</Link>
            <span>Kigali, Rwanda</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
