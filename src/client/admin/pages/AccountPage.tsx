import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { ROLE_LABELS } from "@shared/constants";
import { Button } from "@client/components/ui/Button";
import { Field, FormError, Input } from "@client/components/ui/Field";
import { useToast } from "@client/components/ui/Toast";
import { PageHeader, Panel } from "../components/PageHeader";
import { useSession } from "../session";

export function AccountPage() {
  const { data } = useSession();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const change = useMutation({
    mutationFn: () => api.post("/api/admin/auth/password", { currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => { setForm({ currentPassword: "", newPassword: "", confirm: "" }); toast("Password changed. Other sessions were signed out."); },
  });
  const errors = fieldErrors(change.error);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword;
  return (
    <>
      <PageHeader title="My account" />
      <div className="grid max-w-3xl gap-6">
        <Panel title="Profile">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted">Name</dt><dd className="font-semibold">{data?.user.name}</dd></div>
            <div><dt className="text-xs text-muted">Email</dt><dd>{data?.user.email}</dd></div>
            <div><dt className="text-xs text-muted">Role</dt><dd>{data && ROLE_LABELS[data.user.role]}</dd></div>
          </dl>
        </Panel>
        <Panel title="Change password">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!mismatch) change.mutate(); }}>
            <Field label="Current password" required error={errors.currentPassword}>{(p) => <Input {...p} type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />}</Field>
            <Field label="New password" required error={errors.newPassword} hint="At least 12 characters with letters and numbers.">{(p) => <Input {...p} type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />}</Field>
            <Field label="Confirm new password" required error={mismatch ? "Passwords do not match" : undefined}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />}</Field>
            <FormError message={change.isError && !Object.keys(errors).length ? errorMessage(change.error) : null} />
            <Button type="submit" loading={change.isPending}>Update password</Button>
          </form>
        </Panel>
      </div>
    </>
  );
}
