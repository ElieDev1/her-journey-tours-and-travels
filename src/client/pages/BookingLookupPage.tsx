import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import type { PublicBookingDTO } from "@shared/types";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { useDocumentMeta } from "@client/lib/useDocumentMeta";
import { Button } from "@client/components/ui/Button";
import { Field, FormError, Input } from "@client/components/ui/Field";

export function BookingLookupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ reference: "", email: "" });
  useDocumentMeta("Find my booking | Her Journey Tours and Travels");
  const lookup = useMutation({
    mutationFn: () => api.post<PublicBookingDTO>("/api/public/bookings/lookup", form),
    onSuccess: (booking) => {
      queryClient.setQueryData(["public", "booking", booking.reference], booking);
      navigate(`/booking/${booking.reference}`, { state: { email: form.email.trim().toLowerCase() } });
    },
  });
  const errors = fieldErrors(lookup.error);
  return (
    <div className="container-page flex justify-center py-20">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lift ring-1 ring-line/60">
        <span className="inline-flex rounded-2xl bg-forest-50 p-3 text-forest-700"><Search className="size-6" /></span>
        <h1 className="mt-5 text-4xl font-semibold">Find my booking</h1>
        <p className="mt-2 text-sm text-muted">Enter the reference from your booking (for example HJ-7K3QX9) and the email you booked with.</p>
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            lookup.mutate();
          }}
        >
          <Field label="Booking reference" required error={errors.reference}>
            {(p) => <Input {...p} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value.toUpperCase() })} placeholder="HJ-XXXXXX" className="font-mono tracking-wider" required />}
          </Field>
          <Field label="Email" required error={errors.email}>
            {(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />}
          </Field>
          <FormError message={lookup.isError && !Object.keys(errors).length ? errorMessage(lookup.error) : null} />
          <Button type="submit" size="lg" className="w-full" loading={lookup.isPending}>View booking</Button>
        </form>
      </div>
    </div>
  );
}
