import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, UserPlus } from "lucide-react";
import type { AdminUserDTO } from "@shared/types";
import { ADMIN_ROLES, ROLE_LABELS, ROLE_PERMISSIONS, type AdminRole } from "@shared/constants";
import { formatDateTime } from "@shared/time";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { Button } from "@client/components/ui/Button";
import { Field, FormError, Input, Select } from "@client/components/ui/Field";
import { Badge } from "@client/components/ui/Badge";
import { Modal } from "@client/components/ui/Modal";
import { ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { useToast } from "@client/components/ui/Toast";
import { PageHeader, Td, Th } from "../components/PageHeader";
import { useCan, useSession } from "../session";

export function UsersPage() {
  const can = useCan();
  const { data: session } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<AdminUserDTO | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "staff" as AdminRole, password: "" });
  const [newPassword, setNewPassword] = useState("");
  const list = useQuery({ queryKey: ["admin", "users"], queryFn: () => api.get<{ items: AdminUserDTO[] }>("/api/admin/users"), enabled: can("users:manage") });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  const create = useMutation({
    mutationFn: () => api.post("/api/admin/users", form),
    onSuccess: () => { refresh(); setCreating(false); toast("Administrator added"); },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/api/admin/users/${id}`, body),
    onSuccess: () => { refresh(); setResetFor(null); toast("Administrator updated"); },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const errors = fieldErrors(create.error);

  if (!can("users:manage")) return <ErrorState message="Only owners can manage administrators." />;
  return (
    <>
      <PageHeader
        title="Administrators"
        description="Who can sign in to this dashboard, and what they can do."
        actions={<Button icon={<UserPlus className="size-4" />} onClick={() => { create.reset(); setForm({ name: "", email: "", role: "staff", password: "" }); setCreating(true); }}>Add administrator</Button>}
      />
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {ADMIN_ROLES.map((r) => (
          <div key={r} className="rounded-2xl bg-white p-4 text-sm ring-1 ring-line/70">
            <p className="font-semibold">{ROLE_LABELS[r]}</p>
            <p className="mt-1 text-xs text-muted">{ROLE_PERMISSIONS[r].join(", ")}</p>
          </div>
        ))}
      </div>
      {list.isPending ? (
        <PageLoader />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line/70">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-ivory"><tr><Th>Name</Th><Th>Role</Th><Th>Status</Th><Th>Last sign-in</Th><Th /></tr></thead>
              <tbody className="divide-y divide-line">
                {list.data.items.map((u) => {
                  const self = u.id === session?.user.id;
                  return (
                    <tr key={u.id}>
                      <Td><p className="font-semibold">{u.name}{self && <span className="ml-2 text-xs text-muted">(you)</span>}</p><p className="text-xs text-muted">{u.email}</p></Td>
                      <Td>
                        <Select aria-label="Role" className="w-36 py-1.5" value={u.role} disabled={self} onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value } })}>
                          {ADMIN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </Select>
                      </Td>
                      <Td>{u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Deactivated</Badge>}</Td>
                      <Td>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : <span className="text-muted">Never</span>}</Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" icon={<KeyRound className="size-4" />} onClick={() => { setNewPassword(""); update.reset(); setResetFor(u); }}>Reset password</Button>
                          {!self && (
                            <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: u.id, body: { isActive: !u.isActive } })}>
                              {u.isActive ? "Deactivate" : "Reactivate"}
                            </Button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Add administrator" footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button loading={create.isPending} onClick={() => create.mutate()}>Add</Button></>}>
        <div className="space-y-4">
          <Field label="Full name" required error={errors.name}>{(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label="Email" required error={errors.email}>{(p) => <Input {...p} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
          <Field label="Role" required error={errors.role}>{(p) => <Select {...p} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}>{ADMIN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>}</Field>
          <Field label="Temporary password" required error={errors.password} hint="At least 12 characters with letters and numbers. Share it securely and ask them to change it.">
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
          </Field>
          <FormError message={create.isError && !Object.keys(errors).length ? errorMessage(create.error) : null} />
        </div>
      </Modal>

      <Modal open={resetFor !== null} onClose={() => setResetFor(null)} title={`Reset password for ${resetFor?.name ?? ""}`} footer={<><Button variant="secondary" onClick={() => setResetFor(null)}>Cancel</Button><Button loading={update.isPending} onClick={() => resetFor && update.mutate({ id: resetFor.id, body: { password: newPassword } })}>Set password</Button></>}>
        <Field label="New password" required error={fieldErrors(update.error).password} hint="They will be signed out of all sessions.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />}
        </Field>
      </Modal>
    </>
  );
}
