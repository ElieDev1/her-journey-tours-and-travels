import { useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CustomerDTO } from "@shared/types";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { useDocumentMeta } from "@client/lib/useDocumentMeta";
import { CUSTOMER_KEY, useCustomer } from "@client/hooks/useCustomer";
import { Button } from "@client/components/ui/Button";
import { Field, FormError, Input } from "@client/components/ui/Field";

/** Only allow redirects back into this site. */
function safeNext(state: unknown): string {
  const from = (state as { from?: string } | null)?.from;
  return from && from.startsWith("/") && !from.startsWith("//") && !from.startsWith("/admin") ? from : "/account";
}

function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="container-page flex justify-center py-16 sm:py-24">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-white p-8 shadow-lift ring-1 ring-line/60">
          <h1 className="text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
        <div className="mt-6 text-center text-sm text-muted">{footer}</div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { data: customer } = useCustomer();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ email: "", password: "" });
  useDocumentMeta("Log in | Her Journey Tours and Travels");
  const next = safeNext(location.state);
  const login = useMutation({
    mutationFn: () => api.post<{ customer: CustomerDTO }>("/api/account/login", form),
    onSuccess: ({ customer: c }) => {
      queryClient.setQueryData(CUSTOMER_KEY, c);
      navigate(next, { replace: true });
    },
  });
  const errors = fieldErrors(login.error);
  if (customer) return <Navigate to={next} replace />;

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to see your bookings and book faster."
      footer={
        <>
          New here?{" "}
          <Link to="/register" state={location.state} className="font-semibold text-forest-700 underline underline-offset-4">Create an account</Link>
          <span className="mt-3 block text-xs">Staff member? <Link to="/admin/login" className="underline underline-offset-4">Admin sign in</Link></span>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); login.mutate(); }}>
        <Field label="Email" error={errors.email}>
          {(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus />}
        </Field>
        <Field label="Password" error={errors.password}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />}
        </Field>
        <FormError message={login.isError && !Object.keys(errors).length ? errorMessage(login.error) : null} />
        <Button type="submit" size="lg" className="w-full" loading={login.isPending}>Log in</Button>
        <p className="text-center text-xs text-muted">Forgot your password? Contact us by phone or WhatsApp and we'll help.</p>
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { data: customer } = useCustomer();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "", confirm: "" });
  useDocumentMeta("Create an account | Her Journey Tours and Travels");
  const next = safeNext(location.state);
  const register = useMutation({
    mutationFn: () =>
      api.post<{ customer: CustomerDTO }>("/api/account/register", {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone || null,
        password: form.password,
      }),
    onSuccess: ({ customer: c }) => {
      queryClient.setQueryData(CUSTOMER_KEY, c);
      navigate(next, { replace: true });
    },
  });
  const errors = fieldErrors(register.error);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;
  if (customer) return <Navigate to={next} replace />;

  return (
    <AuthCard
      title="Create your account"
      subtitle="Keep all your trips in one place and book in fewer steps."
      footer={<>Already have an account? <Link to="/login" state={location.state} className="font-semibold text-forest-700 underline underline-offset-4">Log in</Link></>}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!mismatch) register.mutate(); }}>
        <Field label="Full name" required error={errors.fullName}>
          {(p) => <Input {...p} autoComplete="name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />}
        </Field>
        <Field label="Email" required error={errors.email}>
          {(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />}
        </Field>
        <Field label="Phone number" error={errors.phone} hint="Optional. Used to fill in your bookings.">
          {(p) => <Input {...p} type="tel" autoComplete="tel" placeholder="07XX XXX XXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
        </Field>
        <Field label="Password" required error={errors.password} hint="At least 8 characters, with letters and numbers.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />}
        </Field>
        <Field label="Confirm password" required error={mismatch ? "Passwords do not match" : undefined}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />}
        </Field>
        <FormError message={register.isError && !Object.keys(errors).length ? errorMessage(register.error) : null} />
        <Button type="submit" size="lg" className="w-full" loading={register.isPending}>Create account</Button>
      </form>
    </AuthCard>
  );
}
