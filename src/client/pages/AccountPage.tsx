import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, LogOut, Ticket } from "lucide-react";
import type { CustomerBookingDTO, CustomerDTO } from "@shared/types";
import { formatMoney } from "@shared/money";
import { formatDate } from "@shared/time";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { useDocumentMeta } from "@client/lib/useDocumentMeta";
import { cn } from "@client/lib/cn";
import { CUSTOMER_KEY, useCustomer, useLogout } from "@client/hooks/useCustomer";
import { Button, ButtonLink } from "@client/components/ui/Button";
import { BookingStatusBadge } from "@client/components/ui/Badge";
import { Field, FormError, Input } from "@client/components/ui/Field";
import { EmptyState, ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { useToast } from "@client/components/ui/Toast";

type Tab = "bookings" | "profile" | "password";

function BookingsTab() {
  const q = useQuery({ queryKey: ["account", "bookings"], queryFn: () => api.get<{ items: CustomerBookingDTO[] }>("/api/account/bookings") });
  if (q.isPending) return <PageLoader label="Loading your bookings" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data.items.length) {
    return (
      <EmptyState icon={<Ticket className="size-6" />} title="No bookings yet" action={<ButtonLink to="/tours">Explore tours</ButtonLink>}>
        Trips you book while logged in will appear here.
      </EmptyState>
    );
  }
  return (
    <ul className="space-y-3">
      {q.data.items.map((b) => (
        <li key={b.reference}>
          <Link
            to={`/booking/${b.reference}`}
            state={{ email: b.bookingEmail }}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-line/60 transition-shadow hover:shadow-lift"
          >
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold tracking-wider text-muted">{b.reference}</p>
              <p className="mt-1 font-semibold text-forest-900">{b.tourTitle}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <CalendarDays className="size-4 text-sage-500" /> {formatDate(b.departureDate, true)} · {b.totalGuests} guest{b.totalGuests === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <BookingStatusBadge status={b.status} />
              <p className="text-sm font-semibold text-forest-900">{formatMoney(b.totalAmount, b.currency)}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProfileTab({ customer }: { customer: CustomerDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ fullName: customer.fullName, phone: customer.phone ?? "" });
  const save = useMutation({
    mutationFn: () => api.put<{ customer: CustomerDTO }>("/api/account/profile", { fullName: form.fullName, phone: form.phone || null }),
    onSuccess: ({ customer: c }) => { queryClient.setQueryData(CUSTOMER_KEY, c); toast("Profile updated"); },
  });
  const errors = fieldErrors(save.error);
  return (
    <form className="max-w-lg space-y-4 rounded-3xl bg-white p-6 shadow-card ring-1 ring-line/60" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Field label="Email" hint="Contact us if you need to change your email.">{(p) => <Input {...p} value={customer.email} disabled />}</Field>
      <Field label="Full name" required error={errors.fullName}>{(p) => <Input {...p} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />}</Field>
      <Field label="Phone number" error={errors.phone}>{(p) => <Input {...p} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
      <FormError message={save.isError && !Object.keys(errors).length ? errorMessage(save.error) : null} />
      <Button type="submit" loading={save.isPending}>Save profile</Button>
    </form>
  );
}

function PasswordTab() {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const change = useMutation({
    mutationFn: () => api.post("/api/account/password", { currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => { setForm({ currentPassword: "", newPassword: "", confirm: "" }); toast("Password changed. Other devices were logged out."); },
  });
  const errors = fieldErrors(change.error);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword;
  return (
    <form className="max-w-lg space-y-4 rounded-3xl bg-white p-6 shadow-card ring-1 ring-line/60" onSubmit={(e) => { e.preventDefault(); if (!mismatch) change.mutate(); }}>
      <Field label="Current password" required error={errors.currentPassword}>{(p) => <Input {...p} type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />}</Field>
      <Field label="New password" required error={errors.newPassword} hint="At least 8 characters, with letters and numbers.">{(p) => <Input {...p} type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />}</Field>
      <Field label="Confirm new password" required error={mismatch ? "Passwords do not match" : undefined}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />}</Field>
      <FormError message={change.isError && !Object.keys(errors).length ? errorMessage(change.error) : null} />
      <Button type="submit" loading={change.isPending}>Change password</Button>
    </form>
  );
}

export function AccountPage() {
  const { data: customer, isPending } = useCustomer();
  const logout = useLogout();
  const location = useLocation();
  const [tab, setTab] = useState<Tab>("bookings");
  useDocumentMeta("My account | Her Journey Tours and Travels");
  if (isPending) return <PageLoader />;
  if (!customer) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "bookings", label: "My bookings" },
    { id: "profile", label: "Profile" },
    { id: "password", label: "Password" },
  ];
  return (
    <div className="container-page py-12 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">My account</p>
          <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">Hello, {customer.fullName.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-muted">{customer.email}</p>
        </div>
        <Button variant="secondary" icon={<LogOut className="size-4" />} loading={logout.isPending} onClick={() => logout.mutate()}>Log out</Button>
      </div>
      <div className="mt-8 flex gap-2 border-b border-line" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold", tab === t.id ? "border-forest-700 text-forest-800" : "border-transparent text-muted hover:text-forest-700")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-8">
        {tab === "bookings" && <BookingsTab />}
        {tab === "profile" && <ProfileTab customer={customer} />}
        {tab === "password" && <PasswordTab />}
      </div>
    </div>
  );
}
