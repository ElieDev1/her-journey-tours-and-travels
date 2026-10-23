import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import type { CategoryDTO } from "@shared/types";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { Button } from "@client/components/ui/Button";
import { Field, FormError, Input, Textarea } from "@client/components/ui/Field";
import { Modal } from "@client/components/ui/Modal";
import { EmptyState, ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { useToast } from "@client/components/ui/Toast";
import { PageHeader, Td, Th } from "../components/PageHeader";
import { useCan } from "../session";
import { slugify } from "./TourEditorPage";

export function CategoriesPage() {
  const can = useCan();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CategoryDTO | "new" | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", description: "", sortOrder: "0" });
  const list = useQuery({ queryKey: ["admin", "categories"], queryFn: () => api.get<{ items: CategoryDTO[] }>("/api/admin/categories") });

  const save = useMutation({
    mutationFn: () => {
      const body = { name: form.name, slug: form.slug, description: form.description || null, sortOrder: Number(form.sortOrder) || 0 };
      return editing === "new" || !editing ? api.post("/api/admin/categories", body) : api.put(`/api/admin/categories/${editing.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
      queryClient.invalidateQueries({ queryKey: ["public"] });
      toast("Category saved");
      setEditing(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/admin/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
      toast("Category deleted");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const errors = fieldErrors(save.error);
  const open = (c: CategoryDTO | "new") => {
    setEditing(c);
    setForm(c === "new" ? { name: "", slug: "", description: "", sortOrder: String((list.data?.items.length ?? 0) + 1) } : { name: c.name, slug: c.slug, description: c.description ?? "", sortOrder: String(c.sortOrder) });
  };

  return (
    <>
      <PageHeader title="Tour categories" description="Group tours so customers can browse by type of trip." actions={can("tours:write") && <Button icon={<Plus className="size-4" />} onClick={() => open("new")}>New category</Button>} />
      {list.isPending ? (
        <PageLoader />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={<FolderTree className="size-6" />} title="No categories yet" />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line/70">
          <table className="w-full text-sm">
            <thead className="bg-ivory"><tr><Th>Name</Th><Th>Slug</Th><Th>Tours</Th><Th>Order</Th><Th /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.data.items.map((c) => (
                <tr key={c.id}>
                  <Td><p className="font-semibold">{c.name}</p>{c.description && <p className="text-xs text-muted">{c.description}</p>}</Td>
                  <Td className="font-mono text-xs">{c.slug}</Td>
                  <Td>{c.tourCount ?? 0}</Td>
                  <Td>{c.sortOrder}</Td>
                  <Td className="text-right">
                    {can("tours:write") && (
                      <div className="flex justify-end gap-1">
                        <button onClick={() => open(c)} className="rounded-lg p-1.5 text-muted hover:bg-sand" aria-label={`Edit ${c.name}`}><Pencil className="size-4" /></button>
                        <button
                          onClick={() => confirm(`Delete "${c.name}"? Its ${c.tourCount ?? 0} tour(s) will become uncategorised.`) && remove.mutate(c.id)}
                          className="rounded-lg p-1.5 text-danger-600 hover:bg-danger-50"
                          aria-label={`Delete ${c.name}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New category" : "Edit category"}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}
      >
        <div className="space-y-4">
          <Field label="Name" required error={errors.name}>
            {(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: editing === "new" ? slugify(e.target.value) : form.slug })} />}
          </Field>
          <Field label="Slug" required error={errors.slug}>{(p) => <Input {...p} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />}</Field>
          <Field label="Description" error={errors.description}>{(p) => <Textarea {...p} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
          <Field label="Display order" error={errors.sortOrder}>{(p) => <Input {...p} type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />}</Field>
          <FormError message={save.isError && !Object.keys(errors).length ? errorMessage(save.error) : null} />
        </div>
      </Modal>
    </>
  );
}
