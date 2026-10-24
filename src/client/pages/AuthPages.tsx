import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MailCheck } from "lucide-react";
import type { CustomerDTO } from "@shared/types";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { useDocumentMeta } from "@client/lib/useDocumentMeta";
import { CUSTOMER_KEY, useCustomer } from "@client/hooks/useCustomer";
import { useAuthConfig } from "@client/hooks/useAuthConfig";
import { useSettings } from "@client/hooks/useSettings";
import { formatPhone, telHref } from "@client/lib/contact";
import { Button, ButtonLink } from "@client/components/ui/Button";
import { Field, FormError, Input } from "@client/components/ui/Field";
import { GoogleButton, OrDivider, googleErrorMessage } from "@client/components/site/GoogleButton";

/** Only allow redirects back into this site. */
function safeNext(state: unknown): string {
  const from = (state as { from?: string } | null)?.from;
  return from && from.startsWith("/") && !from.startsWith("//") && !from.startsWith("/admin") ? from : "/account";
}

function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="container-page flex justify-center py-16 sm:py-24">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-white p-8 shadow-lift ring-1 ring-line/60">
          <h1 className="text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}

function ContactLine() {
  const { data: s } = useSettings();
  if (!s?.phonePrimary) return null;
  return (
    <>
      {" "}
      Call us on{" "}
      <a href={telHref(s.phonePrimary)} className="font-semibold text-forest-700 underline underline-offset-4">
        {formatPhone(s.phonePrimary)}
      </a>
      .
    </>
  );
}

export function LoginPage() {
  const { data: customer } = useCustomer();
  const location = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ email: "", password: "" });
  useDocumentMeta("Log in | Her Journey Tours and Travels");
  const next = safeNext(location.state);
  const googleError = googleErrorMessage(params.get("error"));
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
      {googleError && <div className="mb-5"><FormError message={googleError} /></div>}
      <GoogleButton returnTo={next} />
      <OrDivider />
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); login.mutate(); }}>
        <Field label="Email" error={errors.email}>
          {(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />}
        </Field>
        <Field label="Password" error={errors.password}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />}
        </Field>
        <div className="-mt-1 text-right">
          <Link to="/forgot-password" className="text-sm font-semibold text-forest-700 underline underline-offset-4">Forgot password?</Link>
        </div>
        <FormError message={login.isError && !Object.keys(errors).length ? errorMessage(login.error) : null} />
        <Button type="submit" size="lg" className="w-full" loading={login.isPending}>Log in</Button>
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
      <GoogleButton returnTo={next} label="Sign up with Google" />
      <OrDivider />
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
        <p className="text-center text-xs text-muted">
          By creating an account you agree to our <Link to="/terms" className="underline underline-offset-2">Terms</Link> and{" "}
          <Link to="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
        </p>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const { data: config, isPending } = useAuthConfig();
  const [email, setEmail] = useState("");
  useDocumentMeta("Forgot password | Her Journey Tours and Travels");
  const request = useMutation({ mutationFn: () => api.post("/api/account/password/forgot", { email }) });
  const errors = fieldErrors(request.error);

  if (!isPending && !config?.passwordReset) {
    return (
      <AuthCard title="Forgot your password?" subtitle="Password reset by email isn't switched on yet.">
        <p className="text-sm text-muted">
          Please contact us and we'll help you get back into your account.<ContactLine />
        </p>
        <ButtonLink to="/login" variant="secondary" className="mt-6 w-full">Back to log in</ButtonLink>
      </AuthCard>
    );
  }
  if (request.isSuccess) {
    return (
      <AuthCard title="Check your email" subtitle={`If an account exists for ${email}, we've sent a link to reset your password.`}>
        <div className="flex items-start gap-3 rounded-2xl bg-forest-50 p-4 text-sm text-forest-800">
          <MailCheck className="mt-0.5 size-5 shrink-0" />
          <p>The link works once and expires in 30 minutes. Didn't get it after a few minutes? Check your spam folder or try again.</p>
        </div>
        <ButtonLink to="/login" variant="secondary" className="mt-6 w-full">Back to log in</ButtonLink>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter the email you use for your account and we'll send you a link to choose a new password."
      footer={<Link to="/login" className="font-semibold text-forest-700 underline underline-offset-4">Back to log in</Link>}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); request.mutate(); }}>
        <Field label="Email" error={errors.email}>
          {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />}
        </Field>
        <FormError message={request.isError && !Object.keys(errors).length ? errorMessage(request.error) : null} />
        <Button type="submit" size="lg" className="w-full" loading={request.isPending}>Send reset link</Button>
      </form>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  const [form, setForm] = useState({ password: "", confirm: "" });
  useDocumentMeta("Choose a new password | Her Journey Tours and Travels");
  // Keep the one-time token out of the address bar and browser history.
  useEffect(() => {
    if (params.has("token")) window.history.replaceState(null, "", "/reset-password");
  }, [params]);
  const reset = useMutation({ mutationFn: () => api.post("/api/account/password/reset", { token, newPassword: form.password }) });
  const errors = fieldErrors(reset.error);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;

  if (reset.isSuccess) {
    return (
      <AuthCard title="Password updated" subtitle="You've been signed out everywhere. Log in with your new password.">
        <div className="flex items-center gap-3 rounded-2xl bg-forest-50 p-4 text-sm text-forest-800">
          <CheckCircle2 className="size-5 shrink-0" /> Your new password is ready to use.
        </div>
        <ButtonLink to="/login" className="mt-6 w-full">Log in</ButtonLink>
      </AuthCard>
    );
  }
  if (!token) {
    return (
      <AuthCard title="Reset link missing" subtitle="Open the link from your email again, or request a new one.">
        <ButtonLink to="/forgot-password" className="w-full">Request a new link</ButtonLink>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password" subtitle="Your new password will replace the old one and sign you out on every device.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!mismatch) reset.mutate(); }}>
        <Field label="New password" required error={errors.newPassword} hint="At least 8 characters, with letters and numbers.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoFocus />}
        </Field>
        <Field label="Confirm new password" required error={mismatch ? "Passwords do not match" : undefined}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />}
        </Field>
        <FormError message={reset.isError && !errors.newPassword ? errorMessage(reset.error) : null} />
        {reset.isError && !errors.newPassword && (
          <Link to="/forgot-password" className="block text-center text-sm font-semibold text-forest-700 underline underline-offset-4">Request a new link</Link>
        )}
        <Button type="submit" size="lg" className="w-full" loading={reset.isPending}>Save new password</Button>
      </form>
    </AuthCard>
  );
}
