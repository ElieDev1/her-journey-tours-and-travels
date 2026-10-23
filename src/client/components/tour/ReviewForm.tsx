import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { Field, FormError, Input, Textarea } from "@client/components/ui/Field";
import { Button } from "@client/components/ui/Button";

export function ReviewForm({ slug }: { slug: string }) {
  const [form, setForm] = useState({ authorName: "", authorLocation: "", rating: 5, title: "", body: "" });
  const submit = useMutation({ mutationFn: () => api.post(`/api/public/tours/${slug}/reviews`, form) });
  const errors = fieldErrors(submit.error);

  if (submit.isSuccess) {
    return (
      <div className="rounded-2xl bg-forest-50 p-5 text-sm text-forest-800">
        Thank you for sharing your experience! Your review will appear once our team has checked it.
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <FormError message={submit.isError && !Object.keys(errors).length ? errorMessage(submit.error) : null} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-forest-900">Your rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setForm({ ...form, rating: n })} aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={form.rating === n}>
              <Star className={`size-6 ${n <= form.rating ? "fill-sun-400 text-sun-500" : "text-stone-300"}`} />
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.authorName}>
          {(p) => <Input {...p} value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} maxLength={80} required />}
        </Field>
        <Field label="Where are you from?" error={errors.authorLocation}>
          {(p) => <Input {...p} value={form.authorLocation} onChange={(e) => setForm({ ...form, authorLocation: e.target.value })} maxLength={80} />}
        </Field>
      </div>
      <Field label="Title" error={errors.title}>
        {(p) => <Input {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} />}
      </Field>
      <Field label="Your review" required error={errors.body}>
        {(p) => <Textarea {...p} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={2000} required />}
      </Field>
      <Button type="submit" loading={submit.isPending}>Submit review</Button>
    </form>
  );
}
