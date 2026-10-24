# Her Journey Tours and Travels

A tour booking platform for **Her Journey Tours and Travels**. Customers browse and book scheduled tours, then pay with MTN **MoMo Pay**. Staff verify payments and manage tours, departures, bookings and site content from a secure admin dashboard.

It is a single Cloudflare Worker that serves:

- a **React single-page app** (public website and admin dashboard), as static assets
- a **Hono JSON API** at `/api/*`
- **uploaded media** from R2 at `/media/*`
- **server-rendered SEO metadata** for `/`, `/tours` and `/tours/:slug`, plus `sitemap.xml` and `robots.txt`

There is no separate server to host.

---

## Technology stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, Vite 8, TypeScript (strict), Tailwind CSS 4, React Router 7, TanStack Query |
| Backend | Cloudflare Workers, Hono |
| Database | Cloudflare D1 (SQLite) with Drizzle ORM and Drizzle Kit migrations |
| Media | Cloudflare R2 |
| Validation | Zod (schemas shared by client and server) |
| Build/deploy | `@cloudflare/vite-plugin`, Wrangler, Cloudflare Workers Builds (deploy), GitHub Actions (checks) |

## Brand system

The colours come from the official logo and are defined once as tokens in `src/client/styles/index.css` (Tailwind 4's `@theme` block is the Tailwind configuration):

| Token | Hex | Source in logo | Used for |
| --- | --- | --- | --- |
| `forest-700` (primary) | `#1D5233` | background | header, footer, sidebar, primary buttons, headings |
| `sage-400` (secondary) | `#88B379` | "Tours and Travels" | eyebrows, icons, secondary accents |
| `sun-400` (accent) | `#EFB864` | rising sun | calls to action, highlights, focus rings |
| `ivory` / `sand` | `#FBF9F4` / `#F3EFE5` | (neutral) | page and section backgrounds |
| `ink` | `#1B2620` | (neutral) | body text |

Each brand colour has a full 50–950 scale. The logo is used unmodified. The header, footer and admin sidebar use a tightly cropped copy of the original image on a matching green surface. The favicon uses the emblem from the same image. The whole site uses one typeface, Inter, self-hosted through Fontsource.

## Project structure

```
src/
  shared/            Code used by both Worker and client
    constants.ts     Statuses, roles and permissions, labels
    schemas.ts       Zod request schemas (the single source of validation)
    pricing.ts       Price/quote calculation (client estimate = server price)
    money.ts         Integer minor-unit money helpers
    time.ts          Africa/Kigali date helpers
    types.ts         API response types
  worker/            Cloudflare Worker (Hono)
    index.ts         App entry, error handling, cron handler
    db/schema.ts     Drizzle schema (all tables)
    middleware/      Admin auth, CSRF/same-origin, security headers
    services/        bookings, payments, tours, auth, media (R2), settings,
                     audit, rate limiting, email
    routes/          public.ts, seo.ts, admin/* (one file per area)
  client/            React app
    pages/           Public pages
    components/ui    Design-system primitives (Button, Field, Modal, Badge…)
    components/site  Header, footer, tour card, images
    admin/           Admin dashboard (lazy-loaded, separate bundle)
migrations/          D1 migrations (schema + initial data)
scripts/             create-admin.mjs
public/              Logo assets, placeholder illustrations, _headers
```

## Getting started

Requirements: Node.js 22+ and npm.

```bash
npm install
cp .dev.vars.example .dev.vars       # local-only variables
npm run db:migrate:local             # create the local D1 database + seed data
npm run admin:create -- --local      # create your first administrator (prompts)
npm run dev                          # http://localhost:5173
```

`npm run dev` runs the Worker and the React app together in the real Workers runtime (workerd), with local D1 and R2 emulation stored in `.wrangler/`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server (frontend + Worker) |
| `npm run build` | Typecheck and production build |
| `npm run typecheck` | TypeScript project check |
| `npm run lint` | ESLint |
| `npm run preview` | Build and serve the production bundle locally |
| `npm run db:generate` | Generate a migration after editing `src/worker/db/schema.ts` |
| `npm run db:migrate:local` / `db:migrate:remote` | Apply migrations |
| `npm run admin:create -- --local\|--remote` | Create an admin or reset their password |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` |
| `npm run deploy` | Build and deploy with Wrangler |

## Database

Tables: `tours`, `tour_categories`, `tour_departures`, `tour_images`, `tour_list_items`, `bookings`, `booking_guests`, `payments`, `customers`, `customer_sessions`, `password_reset_tokens`, `admin_users`, `admin_sessions`, `site_settings`, `tour_reviews`, `audit_logs`, `rate_limits`.

Design notes:

- **Money** is stored as integers in the currency's minor unit (RWF has none, so `41000` = 41,000 RWF), with the currency stored alongside every amount. Bookings snapshot their unit prices and totals.
- **Lists** (inclusions, exclusions, highlights, activities, amenities, what to bring) are rows in `tour_list_items`, not JSON blobs.
- **Payments are separate from bookings.** A booking can have several payment records (for example a rejected attempt, then a verified one).
- Foreign keys, CHECK constraints (non-negative prices and seats, `seats_reserved <= seat_capacity`, ratings 1–5), unique constraints (slugs, booking references, one live claim per transaction ID) and indexes on all filter columns.
- Timestamps are ISO-8601 UTC. Dates and times shown to people use Africa/Kigali time (UTC+2).

### Migrations

- `0000_initial_schema.sql`: generated by Drizzle Kit from `src/worker/db/schema.ts`.
- `0001_seed_initial_data.sql`: categories, site settings and the initial **Eagle View Farm Bugesera Weekend Escape** tour with its 15 November 2026, 7:00 AM departure.

To change the schema, edit `schema.ts`, run `npm run db:generate`, review the SQL, then apply it locally and remotely.

### Initial tour data

The seed contains only the facts the company supplied: the title, operator, destination, date, 7:00 AM departure, pickup at Rubis Gisementi Station, 41,000 RWF per person, the included services, lunch at Yellow Elephant Coffee, MoMo Pay code 2262157, and booking numbers 0783937619 / 0789221347.

These are left **empty on purpose**. Complete them in **Admin → Tours → Eagle View Farm…**:

- seat capacity (no limit is enforced while it is empty)
- return time and duration
- booking deadline (bookings stay open until departure while it is empty)
- cancellation policy and terms
- contact email (in Site settings)
- real photographs (illustrated placeholders are shown until you upload some)

Children are charged the per-person price unless a child price is set. The site's WhatsApp number defaults to the primary booking number (`+250783937619`). Change it in Site settings if WhatsApp uses a different line.

## Booking and payment flow

1. The customer picks a departure, the number of adults and children, and enters their details.
2. The Worker re-validates everything and calculates the price itself, using the same `calculateQuote` the browser uses for its live estimate.
3. **Seats are reserved atomically.** One D1 batch (a transaction) inserts the booking only if `seats_reserved + guests <= seat_capacity`, then increments the seat count. Concurrent requests cannot oversell. In testing, 10 simultaneous bookings for 5 seats produced exactly 5 bookings.
4. The booking gets a reference (`HJ-XXXXXX`) and a private access link, and is **Pending Payment**. Its seats are held for the configurable *seat hold time* (Site settings, default 120 minutes). The hold never runs past the booking deadline.
5. The payment page shows the company name, MoMo Pay code, reference, amount, deadline and step-by-step instructions.
6. The customer submits their MoMo transaction ID, phone, amount and date. The booking becomes **Payment Submitted**. **Nothing is marked as paid automatically.**
7. A staff member checks the transaction in the MoMo merchant account, then chooses **Verify** or **Reject** in the admin. Verifying a payment that covers the total **confirms** the booking. Rejecting reopens the payment window, and the customer sees the reason.
8. Unpaid bookings **expire** and release their seats. This runs every 15 minutes (Cron Trigger) and also before new bookings and admin views. Cancelled and refunded bookings release seats too.

Booking statuses: Pending Payment, Payment Submitted, Confirmed, Cancelled, Expired, Refunded.
Payment statuses: Pending, Submitted, Verified, Rejected, Refunded.

Customers can find their booking any time at **/booking/lookup** with their reference and email.

**Future MoMo API integration.** Payments have `method`, `provider` and `provider_payload` columns. All state changes go through `services/payments.ts` (`submitPayment`, `verifyPayment`, …). An official MTN MoMo API integration would add a provider that creates payments with `provider = "mtn_momo_api"` and calls `verifyPayment` from a webhook route. The booking flow would not change.

> Confirm the USSD wording in the payment steps (`*182*8*1*<code>#`) matches your MoMo Pay merchant setup. It is generated in `paymentInstructions()` in `src/worker/services/bookings.ts`.

## Admin dashboard

Go to `/admin`. Features:

- **Dashboard:** totals, payments awaiting verification, verified revenue, recent bookings, upcoming trips with seats held.
- **Tours:** a sectioned editor (Basics, Location, Schedule & dates, Pricing, Inclusions, Features, Media, Booking info, SEO) covering every tour field. It can publish, unpublish or archive tours, mark them featured or popular, and duplicate them. Tours with bookings can be archived but not deleted.
- **Departures:** per-date seats, booking deadline, time and price overrides, and status. Capacity cannot be set below the seats already held.
- **Media:** cover, gallery and poster uploads to R2. Images are resized in the browser to 1920px and 800px WebP for responsive `srcset`. Alt text, reorder, replace and remove are supported.
- **Categories, Reviews:** customer reviews are moderated before they are published. Staff can add genuine testimonials.
- **Bookings:** search and filter by tour, departure date and status. Detail view shows guests, payments and history. Staff can confirm, cancel, add notes and record cash or phone payments. Bookings export to CSV.
- **Payments:** search by transaction ID; verify, reject or refund; view revenue.
- **Site settings:** contact details, MoMo code, seat hold time, homepage hero text and image, social links.
- **Users:** traveller accounts with search by name, email or phone, status and sign-in method filters, and pagination. A user's page shows their bookings, payments and account history. Owners and managers can disable or re-enable an account (disabling signs the user out everywhere and voids any pending reset link) and export users to CSV. Every action is audit-logged.
- **Administrators** (owners only, at `/admin/administrators`) and the **Audit log**.

Roles:

| Role | Can do |
| --- | --- |
| Owner | Everything, including managing administrators and settings |
| Manager | Tours, bookings, payments (verify and refund), content, disabling users and user CSV export, audit log |
| Staff | Bookings and payment verification; can view users but not disable or export them |

### Creating administrators

No credentials are hard-coded.

**From the browser (no command line needed).** Add a repository secret `ADMIN_SETUP_TOKEN` (any long phrase you choose) under *Settings → Secrets and variables → Actions*. The deploy workflow copies it to the Worker. Then open `/admin/login`: while no administrator exists, it sends you to `/admin/setup`, where you enter that code plus your name, email and password to create the owner account. Once any administrator exists, the setup page is permanently disabled.

**From the command line.** Create the first owner with:

```bash
npm run admin:create -- --local                       # development
npm run admin:create -- --remote --email you@example.com --name "Your Name"   # production
```

The script prompts for the password, hashes it locally (PBKDF2-SHA256, 100,000 iterations, the same parameters the Worker uses) and inserts only the hash through `wrangler d1 execute`. Running it again for the same email resets that password. Owners can add more administrators from the dashboard.

## Traveller accounts

Travellers can book as guests or with an account (`/register`, `/login`, `/account`).

- **Sign in with Google** (`/api/auth/google/start` then `/api/auth/google/callback`): authorization-code flow with `state`, `nonce` and PKCE (S256), kept in a 10-minute `httpOnly` cookie. The ID token is verified with Web Crypto against Google's JWKS (RS256 signature, `iss`, `aud`, `exp`, `nonce`, `email_verified`). The redirect URI is built from the request's origin, so it works on `herjourney.rw`, `www.herjourney.rw`, the `workers.dev` host and localhost. `returnTo` only accepts paths on this site.
  - First Google sign-in creates the account.
  - If an account with the same email already exists, it is **linked** rather than duplicated. If that account's email had never been verified, its password and sessions are cleared when linking. Otherwise someone who registered your address first could keep access (account pre-hijacking). Verified accounts keep their password.
  - Google never creates admins. An existing, active admin can use **Sign in with Google** on `/admin/login` when the verified Google email equals their admin email.
  - The Google buttons are hidden unless `GOOGLE_CLIENT_ID` and the `GOOGLE_CLIENT_SECRET` secret are both set.
- **Forgot password** (`/forgot-password`, `/reset-password`): emails a single-use link that expires in 30 minutes. Only a SHA-256 hash of the token is stored, and requesting a new link voids the old one. Requests are rate-limited (10 per IP and 3 per address per hour), and the response is identical whether or not the email exists. Completing a reset ends all of that user's sessions. Accounts created with Google can use it to set a password.
- **Disabled accounts** cannot sign in by password, Google or session, and receive no reset emails.

## Images (R2)

Uploads go to the `MEDIA` bucket under `tours/<id>/…` and `site/…`. They are served by the Worker at `/media/<key>` with immutable caching. The server checks file signatures (magic bytes), not the declared content type, and accepts only JPEG, PNG, WebP or AVIF up to 8 MB. Replacing or removing an image deletes the old object. Images are never stored in D1.

## Email

Password resets and booking emails are sent through **Cloudflare Email Sending** via the `EMAIL` (`send_email`) binding in `wrangler.jsonc`, from `noreply@herjourney.rw`. If that fails and a `RESEND_API_KEY` secret exists, [Resend](https://resend.com) is used instead. Email is best effort: failures are logged (`email_send_failed` in Workers Logs) and never break a booking. When no email method is configured, the forgot-password page tells travellers to contact you instead.

To switch it on for herjourney.rw (the zone is already on this Cloudflare account):

1. Make sure the account is on the **Workers Paid** plan. Sending to arbitrary recipients requires it.
2. In the dashboard go to **Compute → Email Service → Email Sending → Onboard Domain** and choose `herjourney.rw` (or run `npx wrangler email sending enable herjourney.rw`).
3. Accept the DNS records Cloudflare proposes. It adds them for you because the zone is on Cloudflare:
   - **SPF** (TXT) and **MX** records on the `cf-bounce.herjourney.rw` bounce subdomain;
   - a **DKIM** TXT record (Cloudflare's selector, under `._domainkey.herjourney.rw`);
   - a **DMARC** TXT record at `_dmarc.herjourney.rw`, if you don't have one.

   If herjourney.rw already has an SPF record (for example for Google Workspace), keep a **single** SPF record and merge the includes, because two SPF records break delivery. Existing MX records for receiving mail are not affected.
4. Wait for the records to verify (usually 5–15 minutes), then try **Forgot password** on the live site.

In local development the binding is simulated. Emails are printed to the console and saved under `.wrangler/tmp/email/`.

## SEO

React with Vite is client-rendered. Rather than adopt a different framework, the Worker handles public pages itself. For `/`, `/tours` and `/tours/:slug` it streams the built `index.html` through `HTMLRewriter`, injecting:

- a unique `<title>`, meta description and canonical URL
- Open Graph and Twitter tags (using the tour cover photo once one is uploaded)
- JSON-LD (`TravelAgency`, `TouristTrip` with offers per departure, `BreadcrumbList`)
- crawlable HTML (heading, description, price, dates and inclusions) inside `#root`, which React replaces when it loads

Unknown tour slugs return HTTP 404. `sitemap.xml` is built from published tours. `robots.txt` excludes `/admin`, `/api/` and `/booking/`, and admin pages add `noindex`. Images are lazy-loaded with `srcset`. Lists are paginated and indexed.

## Security

- **Admin passwords:** PBKDF2-SHA256 (100k iterations, random salt). Accounts lock for 15 minutes after 5 failed sign-ins. Login timing is equalised for unknown emails.
- **Sessions:** a random 256-bit token in a `__Host-` cookie (`HttpOnly`, `Secure`, `SameSite=Strict`). Only its SHA-256 hash is stored. Sessions expire after 12 hours, or 2 hours idle. Changing a password, role or active state revokes sessions.
- **Authorization:** every admin route requires a session, and each mutation checks a role permission on the server.
- **CSRF:** cookie-authenticated mutations must come from the site's own origin (`Origin` and `Sec-Fetch-Site` checks) and carry an `X-Requested-With` header, on top of `SameSite=Strict`.
- **Validation:** every request body and query is parsed with Zod on the server. All queries are parameterised. CSV exports neutralise spreadsheet formulas.
- **Rate limiting** (D1-backed) on login, booking, booking lookup, payment submission and reviews.
- **Customer access:** customers reach their booking with an unguessable token (stored hashed) or their reference plus email. Missing bookings and wrong credentials return the same error.
- **Headers:** CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`, set by the Worker and by `public/_headers`.
- **Audit log:** staff actions (sign-ins, tour edits, payment verification, refunds, cancellations, exports, settings and user changes) are recorded with admin and IP.
- **Traveller accounts:** separate session cookie and table from admins. Passwords are hashed the same way, accounts lock after repeated failures, and sessions end on password change, reset or disable. See [Traveller accounts](#traveller-accounts) for Google sign-in and reset-link protections.
- **Secrets:** no secrets live in frontend code or `vars`. Optional secrets are set as Worker secrets (`wrangler secret put` or the dashboard).

## Environment variables

| Name | Where | Required | Purpose |
| --- | --- | --- | --- |
| `APP_ENV` | `vars` / `.dev.vars` | yes | `production` or `development`. Development relaxes cookie `Secure` flags and HSTS/CSP for localhost |
| `PUBLIC_SITE_URL` | `vars` | yes | Canonical origin (`https://herjourney.rw`) for SEO tags, sitemap and email links |
| `GOOGLE_CLIENT_ID` | `vars` | for Google | Public OAuth client id (project "Her Journey Website") |
| `GOOGLE_CLIENT_SECRET` | secret | for Google | OAuth client secret. Google buttons are hidden without it |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | `vars` | yes | Sender address and display name for outgoing email |
| `EMAIL` | `send_email` binding | for email | Cloudflare Email Sending (see [Email](#email)) |
| `RESEND_API_KEY` | secret | no | Fallback email provider |
| `ADMIN_NOTIFY_EMAIL` | secret | no | Inbox notified when a customer submits a payment |
| `ADMIN_SETUP_TOKEN` | secret | for browser setup | Unlocks `/admin/setup` while no administrator exists |
| `DEV_GOOGLE_*_URL` | `.dev.vars` | no | Local testing only: point the Google flow at a mock. Ignored unless `APP_ENV=development` |

Without email configured the site still works: customers see every status change on their booking page.

## Deployment (Cloudflare)

1. Log in: `npx wrangler login`
2. Create the database and bucket:
   ```bash
   npx wrangler d1 create her-journey-db       # copy the database_id into wrangler.jsonc
   npx wrangler r2 bucket create her-journey-media
   ```
3. In `wrangler.jsonc`, set `PUBLIC_SITE_URL` to your real domain, then run `npm run cf-typegen`.
4. Apply migrations and create the first owner:
   ```bash
   npm run db:migrate:remote
   npm run admin:create -- --remote
   ```
5. Optional email: `npx wrangler secret put RESEND_API_KEY` (and the other email secrets).
6. Deploy: `npm run deploy`. Add a custom domain in the Cloudflare dashboard if needed.

**Live deployment.** The site runs at **https://herjourney.rw** (also `www.herjourney.rw` and `her-journey-tours-and-travels.her-journey.workers.dev`). **Cloudflare Workers Builds** deploys it from the `claude/kind-knuth-4ktp7x` branch with the deploy command `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`, so new migrations apply automatically on each push. Keep `main` identical to that branch. The custom domains are managed in the Cloudflare dashboard.

**CI.** `.github/workflows/ci.yml` only typechecks, lints, builds and test-applies migrations. It needs no secrets and does not deploy.

## Verification performed

Run during development against the local Workers runtime:

- `npm run typecheck`, `npm run lint` and `npm run build` pass. `wrangler deploy --dry-run` validates the bundle and bindings.
- Migrations apply to a fresh D1 database.
- **API:** booking creation, the concurrent overbooking test (10 requests, 5 seats, exactly 5 succeed), payment submission, duplicate transaction ID rejected, verify confirms the booking, reject reopens the payment window, cancel and refund release seats, CSV export, auth guard, CSRF blocking, image upload with file-signature check, R2 serving and deletion, sitemap, robots and SEO tags.
- **Browser (Playwright):** booking a tour, submitting a payment, admin sign-in and verification, and the customer seeing "confirmed" via booking lookup. Desktop and mobile layouts were checked visually. The production preview was checked with the CSP active.

- **Accounts round (Google, password reset, Users):** 47 browser checks against a local mock of Google's OAuth endpoints. The mock enforced PKCE, the exact redirect URI and the client secret, and signed real RS256 tokens. Checks covered sign-up and linking (including the pre-hijack case), conflict, cancel, tampered state, unverified email, admin Google sign-in, reset emails (single use, expiry, no account enumeration, rate limits, sessions ended), disable/enable, CSV export, audit entries and role checks. The ID-token verifier was also tested directly against forged, expired, tampered and wrong-audience tokens.

There is no automated test suite in the repository yet. Adding Vitest tests for `pricing.ts` and the booking service would be a good next step.
