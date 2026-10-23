import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import type { SessionDTO } from "@shared/types";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { Button } from "@client/components/ui/Button";
import { Field, FormError, Input } from "@client/components/ui/Field";
import { PageLoader } from "@client/components/ui/Spinner";
import { SESSION_KEY } from "../session";

export interface SetupStatus {
  needsSetup: boolean;
  setupCodeConfigured: boolean;
}

export const SETUP_STATUS_KEY = ["admin", "setup-status"] as const;

export function useSetupStatus() {
  return useQuery({ queryKey: SETUP_STATUS_KEY, queryFn: () => api.get<SetupStatus>("/api/admin/setup/status") });
}

/** First-run page that creates the owner account. Disappears once an admin exists. */
export function SetupPage() {
  const status = useSetupStatus();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ setupToken: "", name: "", email: "", password: "", confirm: "" });
  const setup = useMutation({
    mutationFn: () => api.post<SessionDTO>("/api/admin/setup", { setupToken: form.setupToken, name: form.name, email: form.email, password: form.password }),
    onSuccess: (session) => {
      queryClient.setQueryData(SESSION_KEY, session);
      queryClient.setQueryData(SETUP_STATUS_KEY, { needsSetup: false, setupCodeConfigured: true });
      navigate("/admin", { replace: true });
    },
  });
  const errors = fieldErrors(setup.error);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;

  if (status.isPending) return <PageLoader />;
  if (status.data && !status.data.needsSetup) return <Navigate to="/admin/login" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-forest-700 px-4 py-12">
      <div className="w-full max-w-md">
        <img src="/brand/logo-lockup.webp" alt="Her Journey Tours and Travels" className="mx-auto h-32 w-auto" />
        <div className="mt-8 rounded-3xl bg-white p-8 shadow-lift">
          <div className="flex items-center gap-2 text-forest-700">
            <ShieldCheck className="size-5" />
            <p className="text-xs font-semibold tracking-[0.18em] uppercase">First-time setup</p>
          </div>
          <h1 className="mt-3 font-sans text-2xl font-semibold text-forest-950">Create the owner account</h1>
          <p className="mt-1 text-sm text-muted">This account can manage tours, bookings, payments, settings and other administrators.</p>

          {status.data && !status.data.setupCodeConfigured ? (
            <div className="mt-6 rounded-2xl bg-sun-50 p-4 text-sm text-sun-700 ring-1 ring-sun-300">
              No setup code is configured yet. Add a secret called <code className="font-mono">ADMIN_SETUP_TOKEN</code> in your GitHub repository
              (Settings → Secrets and variables → Actions), re-run the deploy, then reload this page.
            </div>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!mismatch) setup.mutate();
              }}
            >
              <Field label="Setup code" required error={errors.setupToken} hint="The ADMIN_SETUP_TOKEN value you saved in GitHub.">
                {(p) => <Input {...p} type="password" autoComplete="off" value={form.setupToken} onChange={(e) => setForm({ ...form, setupToken: e.target.value })} required />}
              </Field>
              <Field label="Your full name" required error={errors.name}>
                {(p) => <Input {...p} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />}
              </Field>
              <Field label="Email" required error={errors.email} hint="You'll sign in with this.">
                {(p) => <Input {...p} type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />}
              </Field>
              <Field label="Password" required error={errors.password} hint="At least 12 characters, with letters and numbers.">
                {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />}
              </Field>
              <Field label="Confirm password" required error={mismatch ? "Passwords do not match" : undefined}>
                {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />}
              </Field>
              <FormError message={setup.isError && !Object.keys(errors).length ? errorMessage(setup.error) : null} />
              <Button type="submit" size="lg" className="w-full" loading={setup.isPending}>Create account and sign in</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
