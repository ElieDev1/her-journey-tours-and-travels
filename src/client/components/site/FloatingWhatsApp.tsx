import { MessageCircle } from "lucide-react";
import { useSettings } from "@client/hooks/useSettings";
import { whatsappHref } from "@client/lib/contact";

export function FloatingWhatsApp() {
  const { data: s } = useSettings();
  if (!s?.whatsappNumber) return null;
  return (
    <a
      href={whatsappHref(s.whatsappNumber, "Hello Her Journey Tours, I would like to ask about a tour.")}
      target="_blank"
      rel="noreferrer"
      className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-[#1f8f4e] px-4 py-3 text-sm font-semibold text-white shadow-lift transition-transform hover:-translate-y-0.5 sm:right-6 sm:bottom-6"
      aria-label="Chat with us on WhatsApp"
    >
      <MessageCircle className="size-5" />
      <span className="hidden sm:inline">WhatsApp us</span>
    </a>
  );
}
