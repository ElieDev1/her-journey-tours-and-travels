import type { ReactNode } from "react";
import { Link } from "react-router";
import { useSettings } from "@client/hooks/useSettings";
import { useDocumentMeta } from "@client/lib/useDocumentMeta";
import { formatPhone } from "@client/lib/contact";

const CONTACT_EMAIL = "info@herjourney.rw";
const LAST_UPDATED = "24 October 2026";

function LegalLayout({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <>
      <section className="bg-forest-700 py-16 text-white">
        <div className="container-page">
          <p className="eyebrow text-sun-300">Legal</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-forest-100">{intro}</p>
          <p className="mt-4 text-sm text-forest-200">Last updated: {LAST_UPDATED}</p>
        </div>
      </section>
      <article className="container-page max-w-3xl py-14 pb-24 text-[15px] leading-relaxed text-ink/90 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </article>
    </>
  );
}

function ContactBlock() {
  const { data: s } = useSettings();
  return (
    <ul>
      <li>
        Email: <a className="font-semibold text-forest-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </li>
      {s?.phonePrimary && <li>Phone: {formatPhone(s.phonePrimary)}{s.phoneSecondary ? ` or ${formatPhone(s.phoneSecondary)}` : ""}</li>}
      <li>Her Journey Tours and Travels, Kigali, Rwanda</li>
    </ul>
  );
}

export function PrivacyPage() {
  useDocumentMeta("Privacy Policy | Her Journey Tours and Travels", "How Her Journey Tours and Travels collects, uses and protects your personal data.");
  return (
    <LegalLayout
      title="Privacy Policy"
      intro="This policy explains what personal data Her Journey Tours and Travels collects when you use herjourney.rw or book a trip with us, why we use it, and the choices and rights you have."
    >
      <h2>1. Who we are</h2>
      <p>
        Her Journey Tours and Travels ("we", "us") is a tour and travel company based in Kigali, Rwanda. We are responsible for the personal
        data described in this policy and we process it in line with Law Nº 058/2021 of 13/10/2021 relating to the protection of personal data
        and privacy in Rwanda.
      </p>

      <h2>2. Information we collect</h2>
      <ul>
        <li><strong>Booking details:</strong> your full name, email address, phone number, the number of adults and children travelling, the names of other guests if you choose to give them, and any special requests (for example dietary or accessibility needs).</li>
        <li><strong>Payment information:</strong> the MoMo transaction ID, the phone number you paid from, the amount and the payment date. You pay MTN Mobile Money directly; we never see or store your MoMo PIN or full financial details.</li>
        <li><strong>Account information:</strong> if you create an account, your name, email, optional phone number and a securely hashed password (we cannot read your password).</li>
        <li><strong>Sign in with Google:</strong> if you choose it, Google shares your name, email address, whether that email is verified, and a unique Google account identifier. We do not receive your Google password, contacts or other Google data.</li>
        <li><strong>Reviews</strong> you submit, which we publish only after checking them.</li>
        <li><strong>Technical data:</strong> your IP address and basic request information, used to keep the site secure (for example to limit repeated sign-in attempts).</li>
      </ul>

      <h2>3. How we use your information</h2>
      <ul>
        <li>To take, confirm and manage your booking, hold your seats and run the trip (performance of our contract with you).</li>
        <li>To verify your payment and keep accurate financial records (contract and legal obligations).</li>
        <li>To contact you about your trip, including changes, reminders and password-reset emails you request.</li>
        <li>To run your account and let you sign in, including with Google if you choose.</li>
        <li>To protect our customers and our website against fraud and misuse (our legitimate interests).</li>
      </ul>
      <p>We do not sell your personal data and we do not send marketing messages unless you have agreed to receive them.</p>

      <h2>4. Who we share it with</h2>
      <p>We share personal data only as needed to provide our services:</p>
      <ul>
        <li><strong>Cloudflare</strong>, which hosts our website, database, image storage and outgoing email.</li>
        <li><strong>Google</strong>, only if you choose to sign in with Google.</li>
        <li><strong>Guides, drivers and venues</strong> involved in your trip, who receive only what they need (for example the number of guests or a dietary requirement).</li>
        <li><strong>Authorities</strong>, where Rwandan law requires us to.</li>
      </ul>
      <p>
        Some of these providers may process data outside Rwanda. Where that happens we rely on providers that apply appropriate security and
        contractual safeguards, as required by Rwandan law.
      </p>

      <h2>5. Cookies</h2>
      <p>
        We use only cookies that are needed for the website to work: a cookie that keeps you signed in, a short-lived cookie that protects the
        "Sign in with Google" process (it expires after 10 minutes), and a sign-in cookie for our staff dashboard. We do not use advertising or
        tracking cookies.
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>Booking and payment records: for as long as we need them to provide the service and to meet our accounting and tax obligations under Rwandan law.</li>
        <li>Your account: until you ask us to delete it. Bookings linked to it are kept as described above.</li>
        <li>Sign-in sessions last up to 30 days; password-reset links expire after 30 minutes and work only once.</li>
      </ul>

      <h2>7. How we protect it</h2>
      <p>
        Your data is sent over encrypted connections (HTTPS). Passwords are stored only as salted hashes, and access to our booking dashboard is
        limited to authorised staff and recorded in an audit log.
      </p>

      <h2>8. Your rights</h2>
      <p>Under Rwandan data protection law you have the right to:</p>
      <ul>
        <li>be informed about, and get a copy of, the personal data we hold about you;</li>
        <li>have inaccurate data corrected, and have data deleted when we no longer need it;</li>
        <li>object to or ask us to restrict certain processing, and to receive your data in a portable format;</li>
        <li>withdraw your consent at any time where we rely on consent;</li>
        <li>lodge a complaint with the National Cyber Security Authority (NCSA), Rwanda's data protection supervisory authority.</li>
      </ul>
      <p>To exercise any of these rights, contact us using the details below. We may need to confirm your identity first.</p>

      <h2>9. Children</h2>
      <p>
        Bookings must be made by an adult. When you book for children, you give us their details on their behalf, and we use them only to run the
        trip.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>We may update this policy from time to time. The "last updated" date at the top shows when it last changed.</p>

      <h2>11. Contact us</h2>
      <ContactBlock />
      <p>
        See also our <Link to="/terms" className="font-semibold text-forest-700 underline">Terms and Conditions</Link>.
      </p>
    </LegalLayout>
  );
}

export function TermsPage() {
  useDocumentMeta("Terms and Conditions | Her Journey Tours and Travels", "The terms that apply when you book a tour with Her Journey Tours and Travels.");
  return (
    <LegalLayout
      title="Terms and Conditions"
      intro="These terms apply when you use herjourney.rw and when you book a tour with Her Journey Tours and Travels. Please read them before booking."
    >
      <h2>1. About us</h2>
      <p>Her Journey Tours and Travels is a tour and travel company based in Kigali, Rwanda, offering guided tours, day trips and scheduled group travel.</p>

      <h2>2. Making a booking</h2>
      <ul>
        <li>When you book online we reserve your seats for a limited time, shown on your booking page, while you pay.</li>
        <li>Your booking is <strong>confirmed only after we have verified your payment</strong>. Submitting a transaction ID does not confirm a booking on its own.</li>
        <li>If payment is not received before the deadline, the booking expires automatically and the seats are released.</li>
        <li>Please check your booking details. You are responsible for the information you give us, including the details of the guests you book for.</li>
      </ul>

      <h2>3. Prices and payment</h2>
      <ul>
        <li>Prices are shown in Rwandan francs (RWF) unless stated otherwise, and include the services listed on each tour page.</li>
        <li>Payment is made with MTN MoMo Pay to the merchant code shown on your booking page. Only pay to the code we show; we will never ask you for your MoMo PIN.</li>
        <li>Anything listed as "not included" on the tour page is at your own cost.</li>
      </ul>

      <h2>4. Changes and cancellations by you</h2>
      <p>
        If you need to change or cancel, contact us as soon as possible. Refunds and changes follow the cancellation policy shown on the tour
        page. Where a tour has no published policy, contact us and we will explain the options for your booking. Approved refunds are paid back
        using the method you paid with.
      </p>

      <h2>5. Changes and cancellations by us</h2>
      <p>
        We may need to change or cancel a trip, for example because of weather, safety concerns, too few participants or events outside our
        control. If we cancel, we will offer you another date or a refund of the amount you paid for that trip.
      </p>

      <h2>6. On the trip</h2>
      <ul>
        <li>Please arrive at the pickup point or meeting point on time. We cannot always wait for late arrivals.</li>
        <li>Follow the guide's instructions and the safety information given for the tour.</li>
        <li>Tell us about any health condition, mobility need or dietary requirement that may affect your participation.</li>
        <li>Bring any identification you may need, and anything listed under "What to bring" on the tour page.</li>
        <li>We may refuse to continue providing services to anyone whose behaviour puts others at risk.</li>
      </ul>

      <h2>7. Photos</h2>
      <p>
        Some trips include a photoshoot. We will only use photos in which you can be identified for promotional purposes if you agree. Just let
        your guide or us know your preference.
      </p>

      <h2>8. Accounts</h2>
      <p>
        You can book as a guest or create an account, including with Sign in with Google. Keep your password safe and tell us if you think your
        account has been misused. We may disable accounts that are used fraudulently or abusively.
      </p>

      <h2>9. Our responsibility</h2>
      <p>
        We plan our trips carefully and work with trusted partners. To the extent permitted by Rwandan law, we are not responsible for losses
        caused by events outside our reasonable control, or by your failure to follow safety instructions. Nothing in these terms limits any
        rights you have under Rwandan consumer law.
      </p>

      <h2>10. Privacy</h2>
      <p>
        We handle your personal data as described in our <Link to="/privacy" className="font-semibold text-forest-700 underline">Privacy Policy</Link>.
      </p>

      <h2>11. Governing law</h2>
      <p>These terms are governed by the laws of the Republic of Rwanda, and the courts of Rwanda have jurisdiction over any dispute.</p>

      <h2>12. Changes to these terms</h2>
      <p>We may update these terms from time to time. The version shown when you make a booking applies to that booking.</p>

      <h2>13. Contact us</h2>
      <ContactBlock />
    </LegalLayout>
  );
}
