import { useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import type { SessionDTO } from "@shared/types";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { Button } from "@client/components/ui/Button";
import { Field, FormError, Input } from "@client/components/ui/Field";
import { SESSION_KEY, useSession } from "../session";
import { useSetupStatus } from "./SetupPage";
import { GoogleButton, OrDivider, googleErrorMessage } from "@client/components/site/GoogleButton";

export function LoginPage() {
  const session = useSession();
  const setupStatus = useSetupStatus();
  const [params] = useSearchParams();
  const googleError = googleErrorMessage(params.get("error"));
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ email: "", password: "" });
  const from = (location.state as { from?: string } | null)?.from ?? "/admin";
  const login = useMutation({
    mutationFn: () => api.post<SessionDTO>("/api/admin/auth/login", form),
    onSuccess: (data) => {
      queryClient.setQueryData(SESSION_KEY, data);
      navigate(from.startsWith("/admin") && from !== "/admin/login" ? from : "/admin", { replace: true });
    },
  });
  const errors = fieldErrors(login.error);
  if (session.data) return <Navigate to="/admin" replace />;
  if (setupStatus.data?.needsSetup) return <Navigate to="/admin/setup" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-forest-700 px-4 py-12">
      <div className="w-full max-w-sm">
        <img src="/brand/logo-lockup.webp" alt="Her Journey Tours and Travels" className="mx-auto h-36 w-auto" />
        <div className="mt-8 rounded-3xl bg-white p-8 shadow-lift">
          <div className="flex items-center gap-2 text-forest-700">
            <Lock className="size-4" />
            <p className="text-xs font-semibold tracking-[0.18em] uppercase">Administrator sign in</p>
          </div>
          {googleError && <div className="mt-6"><FormError message={googleError} /></div>}
          <div className="mt-6">
            <GoogleButton intent="admin" returnTo={from.startsWith("/admin") && from !== "/admin/login" ? from : "/admin"} label="Sign in with Google" />
          </div>
          <OrDivider />
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate();
            }}
          >
            <Field label="Email" error={errors.email}>
              {(p) => <Input {...p} type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus />}
            </Field>
            <Field label="Password" error={errors.password}>
              {(p) => <Input {...p} type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />}
            </Field>
            <FormError message={login.isError && !Object.keys(errors).length ? errorMessage(login.error) : null} />
            <Button type="submit" className="w-full" size="lg" loading={login.isPending}>Sign in</Button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-forest-200">Authorised staff only. Sign-in attempts are logged.</p>
      </div>
    </div>
  );
}
