import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import type { DepartureDTO } from "@shared/types";
import { DEPARTURE_STATUSES, DEPARTURE_STATUS_LABELS, type DepartureStatus } from "@shared/constants";
import { formatMoney, toMajor, toMinor } from "@shared/money";
import { formatDate, formatTime, isoToBusinessLocal } from "@shared/time";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { Button } from "@client/components/ui/Button";
import { Field, FormError, Input, Select, Textarea } from "@client/components/ui/Field";
import { DepartureStatusBadge } from "@client/components/ui/Badge";
import { Modal } from "@client/components/ui/Modal";
import { useToast } from "@client/components/ui/Toast";
import { Td, Th } from "./PageHeader";

interface DepForm {
  startDate: string;
  endDate: string;
  departureTime: string;
  returnTime: string;
  bookingDeadline: string;
  seatCapacity: string;
  adultPriceOverride: string;
  childPriceOverride: string;
  status: DepartureStatus;
  notes: string;
}

const empty = (defaults: { departureTime: string | null; returnTime: string | null }): DepForm => ({
  startDate: "",
  endDate: "",
  departureTime: defaults.departureTime ?? "",
  returnTime: defaults.returnTime ?? "",
  bookingDeadline: "",
  seatCapacity: "",
  adultPriceOverride: "",
  childPriceOverride: "",
  status: "scheduled",
  notes: "",
});

export function DepartureManager({
  tourId,
  departures,
  currency,
  defaults,
  canWrite,
}: {
  tourId: number;
  departures: DepartureDTO[];
  currency: string;
  defaults: { departureTime: string | null; returnTime: string | null };
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<DepartureDTO | "new" | null>(null);
  const [form, setForm] = useState<DepForm>(empty(defaults));

  const open = (d: DepartureDTO | "new") => {
    setEditing(d);
    setForm(
      d === "new"
        ? empty(defaults)
        : {
            startDate: d.startDate,
            endDate: d.endDate ?? "",
            departureTime: d.departureTime ?? "",
            returnTime: d.returnTime ?? "",
            bookingDeadline: d.bookingDeadline ? isoToBusinessLocal(d.bookingDeadline) : "",
            seatCapacity: d.seatCapacity?.toString() ?? "",
            adultPriceOverride: d.adultPriceOverride !== null ? String(toMajor(d.adultPriceOverride, currency)) : "",
            childPriceOverride: d.childPriceOverride !== null ? String(toMajor(d.childPriceOverride, currency)) : "",
            status: d.status,
            notes: d.notes ?? "",
          },
    );
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        startDate: form.startDate,
        endDate: form.endDate || null,
        departureTime: form.departureTime || null,
        returnTime: form.returnTime || null,
        bookingDeadline: form.bookingDeadline || null,
        seatCapacity: form.seatCapacity ? Number(form.seatCapacity) : null,
        adultPriceOverride: form.adultPriceOverride ? toMinor(Number(form.adultPriceOverride), currency) : null,
        childPriceOverride: form.childPriceOverride ? toMinor(Number(form.childPriceOverride), currency) : null,
        status: form.status,
        notes: form.notes || null,
      };
      return editing === "new" || editing === null
        ? api.post(`/api/admin/tours/${tourId}/departures`, body)
        : api.put(`/api/admin/departures/${editing.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tour", tourId] });
      toast(editing === "new" ? "Departure added" : "Departure updated");
      setEditing(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/admin/departures/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tour", tourId] });
      toast("Departure deleted");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const errors = fieldErrors(save.error);
  const set = (k: keyof DepForm) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Each departure is a bookable date with its own seats, deadline and optional price.</p>
        {canWrite && <Button size="sm" icon={<CalendarPlus className="size-4" />} onClick={() => open("new")}>Add departure</Button>}
      </div>
      {departures.length === 0 ? (
        <p className="rounded-xl bg-ivory p-4 text-sm text-muted">No departures yet. Add a date so customers can book.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-ivory"><tr><Th>Date</Th><Th>Times</Th><Th>Seats</Th><Th>Price</Th><Th>Status</Th><Th /></tr></thead>
            <tbody className="divide-y divide-line">
              {departures.map((d) => (
                <tr key={d.id}>
                  <Td>
                    <p className="font-semibold">{formatDate(d.startDate)}</p>
                    {d.endDate && d.endDate !== d.startDate && <p className="text-xs text-muted">to {formatDate(d.endDate)}</p>}
                    {!d.bookable && d.status === "scheduled" && <p className="text-xs text-sun-700">{d.unavailableReason}</p>}
                  </Td>
                  <Td>{formatTime(d.departureTime) ?? "—"}{d.returnTime && ` → ${formatTime(d.returnTime)}`}</Td>
                  <Td>
                    <Link to={`/admin/bookings?departureId=${d.id}`} className="hover:underline">
                      {d.seatsReserved} held{d.seatCapacity !== null ? ` / ${d.seatCapacity}` : ""}
                    </Link>
                    {d.seatCapacity === null && <p className="text-xs text-sun-700">Capacity not set</p>}
                  </Td>
                  <Td>{d.adultPriceOverride !== null ? formatMoney(d.adultPriceOverride, currency) : <span className="text-muted">Tour price</span>}</Td>
                  <Td><DepartureStatusBadge status={d.status} /></Td>
                  <Td className="text-right">
                    {canWrite && (
                      <div className="flex justify-end gap-1">
                        <button onClick={() => open(d)} className="rounded-lg p-1.5 text-muted hover:bg-sand" aria-label="Edit departure"><Pencil className="size-4" /></button>
                        <button
                          onClick={() => confirm(`Delete the ${formatDate(d.startDate)} departure?`) && remove.mutate(d.id)}
                          className="rounded-lg p-1.5 text-danger-600 hover:bg-danger-50"
                          aria-label="Delete departure"
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
        title={editing === "new" ? "Add departure" : "Edit departure"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>Save departure</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" required error={errors.startDate}>{(p) => <Input {...p} type="date" value={form.startDate} onChange={set("startDate")} />}</Field>
          <Field label="End date" error={errors.endDate} hint="For multi-day trips">{(p) => <Input {...p} type="date" min={form.startDate} value={form.endDate} onChange={set("endDate")} />}</Field>
          <Field label="Departure time" error={errors.departureTime}>{(p) => <Input {...p} type="time" value={form.departureTime} onChange={set("departureTime")} />}</Field>
          <Field label="Return time" error={errors.returnTime}>{(p) => <Input {...p} type="time" value={form.returnTime} onChange={set("returnTime")} />}</Field>
          <Field label="Booking deadline" error={errors.bookingDeadline} hint="Kigali time. Leave empty to allow booking until departure.">
            {(p) => <Input {...p} type="datetime-local" value={form.bookingDeadline} onChange={set("bookingDeadline")} />}
          </Field>
          <Field label="Seat capacity" error={errors.seatCapacity} hint={editing && editing !== "new" ? `${editing.seatsReserved} seats currently held. Empty = no limit.` : "Empty = no limit enforced."}>
            {(p) => <Input {...p} type="number" min={1} value={form.seatCapacity} onChange={set("seatCapacity")} />}
          </Field>
          <Field label={`Adult price override (${currency})`} error={errors.adultPriceOverride} hint="Leave empty to use the tour price">
            {(p) => <Input {...p} type="number" min={0} value={form.adultPriceOverride} onChange={set("adultPriceOverride")} />}
          </Field>
          <Field label={`Child price override (${currency})`} error={errors.childPriceOverride}>
            {(p) => <Input {...p} type="number" min={0} value={form.childPriceOverride} onChange={set("childPriceOverride")} />}
          </Field>
          <Field label="Status" error={errors.status}>
            {(p) => (
              <Select {...p} value={form.status} onChange={set("status")}>
                {DEPARTURE_STATUSES.map((s) => <option key={s} value={s}>{DEPARTURE_STATUS_LABELS[s]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Internal notes" error={errors.notes} className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={form.notes} onChange={set("notes")} />}</Field>
        </div>
        <div className="mt-4"><FormError message={save.isError && !Object.keys(errors).length ? errorMessage(save.error) : null} /></div>
      </Modal>
    </div>
  );
}
