import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareQuote, Plus, Star, Trash2 } from "lucide-react";
import type { AdminTourRowDTO, ReviewDTO } from "@shared/types";
import { formatDateTime } from "@shared/time";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { Button } from "@client/components/ui/Button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@client/components/ui/Field";
import { Badge } from "@client/components/ui/Badge";
import { Modal } from "@client/components/ui/Modal";
import { EmptyState, ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { useToast } from "@client/components/ui/Toast";
import { PageHeader } from "../components/PageHeader";
import { useCan } from "../session";

export function ReviewsPage() {
  const can = useCan();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ tourId: "", authorName: "", authorLocation: "", rating: "5", title: "", body: "", isPublished: true, isFeatured: false });
  const list = useQuery({ queryKey: ["admin", "reviews"], queryFn: () => api.get<{ items: ReviewDTO[] }>("/api/admin/reviews") });
  const tours = useQuery({ queryKey: ["admin", "tours", {}], queryFn: () => api.get<{ items: AdminTourRowDTO[] }>("/api/admin/tours"), enabled: adding });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    queryClient.invalidateQueries({ queryKey: ["public"] });
  };
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Pick<ReviewDTO, "isPublished" | "isFeatured">> }) => api.patch(`/api/admin/reviews/${id}`, body),
    onSuccess: () => { refresh(); toast("Review updated"); },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/admin/reviews/${id}`),
    onSuccess: () => { refresh(); toast("Review deleted"); },
  });
  const create = useMutation({
    mutationFn: () => api.post("/api/admin/reviews", { ...form, tourId: form.tourId ? Number(form.tourId) : null, rating: Number(form.rating), authorLocation: form.authorLocation || null, title: form.title || null }),
    onSuccess: () => { refresh(); setAdding(false); toast("Testimonial added"); },
  });
  const errors = fieldErrors(create.error);
  const canWrite = can("content:write");

  return (
    <>
      <PageHeader
        title="Reviews & testimonials"
        description="Customer reviews are held for moderation. Published reviews appear on tour pages; featured ones also appear on the homepage."
        actions={canWrite && <Button icon={<Plus className="size-4" />} onClick={() => { create.reset(); setAdding(true); }}>Add testimonial</Button>}
      />
      {list.isPending ? (
        <PageLoader />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={<MessageSquareQuote className="size-6" />} title="No reviews yet">Reviews submitted by customers on tour pages will appear here for approval.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.data.items.map((r) => (
            <article key={r.id} className="flex flex-col rounded-2xl bg-white p-5 shadow-card ring-1 ring-line/70">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-0.5 text-sun-500">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`size-4 ${i < r.rating ? "fill-current" : "opacity-25"}`} />)}</div>
                <div className="flex gap-1.5">
                  {r.isPublished ? <Badge tone="green">Published</Badge> : <Badge tone="gold">Awaiting approval</Badge>}
                  {r.isFeatured && <Badge tone="sage">Homepage</Badge>}
                </div>
              </div>
              {r.title && <p className="mt-3 font-semibold">{r.title}</p>}
              <p className="mt-1 flex-1 text-sm text-ink/85">{r.body}</p>
              <p className="mt-3 text-xs text-muted">{r.authorName}{r.authorLocation ? `, ${r.authorLocation}` : ""} · {r.tourTitle ?? "General testimonial"} · {formatDateTime(r.createdAt)}</p>
              {canWrite && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  <Button size="sm" variant={r.isPublished ? "secondary" : "primary"} onClick={() => patch.mutate({ id: r.id, body: { isPublished: !r.isPublished } })}>{r.isPublished ? "Unpublish" : "Approve & publish"}</Button>
                  <Button size="sm" variant="secondary" onClick={() => patch.mutate({ id: r.id, body: { isFeatured: !r.isFeatured } })}>{r.isFeatured ? "Remove from homepage" : "Feature on homepage"}</Button>
                  <button onClick={() => confirm("Delete this review?") && remove.mutate(r.id)} className="ml-auto rounded-lg p-2 text-danger-600 hover:bg-danger-50" aria-label="Delete review"><Trash2 className="size-4" /></button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add testimonial" size="lg" footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button loading={create.isPending} onClick={() => create.mutate()}>Save</Button></>}>
        <p className="mb-4 text-sm text-muted">Only add genuine feedback you have received from customers (for example by WhatsApp or email).</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer name" required error={errors.authorName}>{(p) => <Input {...p} value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} />}</Field>
          <Field label="Location" error={errors.authorLocation}>{(p) => <Input {...p} value={form.authorLocation} onChange={(e) => setForm({ ...form, authorLocation: e.target.value })} />}</Field>
          <Field label="Tour" error={errors.tourId}>{(p) => <Select {...p} value={form.tourId} onChange={(e) => setForm({ ...form, tourId: e.target.value })}><option value="">General (no tour)</option>{tours.data?.items.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</Select>}</Field>
          <Field label="Rating" required error={errors.rating}>{(p) => <Select {...p} value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>)}</Select>}</Field>
          <Field label="Title" error={errors.title} className="sm:col-span-2">{(p) => <Input {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
          <Field label="Testimonial" required error={errors.body} className="sm:col-span-2">{(p) => <Textarea {...p} rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />}</Field>
          <Checkbox label="Publish" checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} />
          <Checkbox label="Feature on homepage" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} />
        </div>
        <div className="mt-3"><FormError message={create.isError && !Object.keys(errors).length ? errorMessage(create.error) : null} /></div>
      </Modal>
    </>
  );
}
