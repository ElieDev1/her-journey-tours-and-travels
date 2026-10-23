import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Save, Trash2 } from "lucide-react";
import type { AdminSettingsDTO } from "@shared/types";
import type { SiteSettingsInput } from "@shared/schemas";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { prepareImage } from "@client/lib/image";
import { Button } from "@client/components/ui/Button";
import { Field, FormError, Input, Textarea } from "@client/components/ui/Field";
import { ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { useToast } from "@client/components/ui/Toast";
import { PageHeader, Panel } from "../components/PageHeader";
import { useCan } from "../session";

const TEXT_KEYS = [
  "company_name", "tagline", "phone_primary", "phone_secondary", "whatsapp_number", "contact_email", "address",
  "momo_pay_code", "momo_merchant_name", "hero_title", "hero_subtitle", "about_text", "social_instagram", "social_facebook", "social_tiktok",
] as const;
type TextKey = (typeof TEXT_KEYS)[number];
type FormState = Record<TextKey, string> & { booking_hold_minutes: string };

function toForm(values: Record<string, unknown>): FormState {
  const f = Object.fromEntries(TEXT_KEYS.map((k) => [k, typeof values[k] === "string" ? values[k] : ""])) as Record<TextKey, string>;
  return { ...f, booking_hold_minutes: String(values.booking_hold_minutes ?? 120) };
}

export function SettingsPage() {
  const q = useQuery({ queryKey: ["admin", "settings"], queryFn: () => api.get<AdminSettingsDTO>("/api/admin/settings") });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isPending) return <PageLoader />;
  return <SettingsForm data={q.data} />;
}

function SettingsForm({ data }: { data: AdminSettingsDTO }) {
  const can = useCan();
  const canWrite = can("settings:write");
  const toast = useToast();
  const queryClient = useQueryClient();
  const heroInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(() => toForm(data.values));

  const onSaved = (data: AdminSettingsDTO) => {
    queryClient.setQueryData(["admin", "settings"], data);
    queryClient.invalidateQueries({ queryKey: ["public"] });
  };
  const save = useMutation({
    mutationFn: () => {
      const body: SiteSettingsInput = { ...form, booking_hold_minutes: Number(form.booking_hold_minutes) };
      return api.put<AdminSettingsDTO>("/api/admin/settings", body);
    },
    onSuccess: (data) => { onSaved(data); setForm(toForm(data.values)); toast("Settings saved"); },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const hero = useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) return api.delete<AdminSettingsDTO>("/api/admin/settings/hero-image");
      const prepared = await prepareImage(file);
      const body = new FormData();
      body.set("file", prepared.file, prepared.file.type === "image/webp" ? "hero.webp" : "hero.jpg");
      return api.post<AdminSettingsDTO>("/api/admin/settings/hero-image", body);
    },
    onSuccess: (data) => { onSaved(data); toast("Hero image updated"); },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  const errors = fieldErrors(save.error);
  const field = (key: keyof FormState, label: string, opts: { hint?: string; rows?: number; type?: string; required?: boolean; className?: string } = {}) => (
    <Field label={label} error={errors[key]} hint={opts.hint} required={opts.required} className={opts.className}>
      {(p) =>
        opts.rows ? (
          <Textarea {...p} rows={opts.rows} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} disabled={!canWrite} />
        ) : (
          <Input {...p} type={opts.type ?? "text"} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} disabled={!canWrite} />
        )
      }
    </Field>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-6 pb-24">
      <PageHeader title="Site settings" description="Company details, contact information, payments and homepage content." />
      <FormError message={save.isError && Object.keys(errors).length ? "Please fix the highlighted fields." : null} />

      <Panel title="Company & contact" description="Shown in the header, footer, contact page and booking pages.">
        <div className="grid gap-5 sm:grid-cols-2">
          {field("company_name", "Company name", { required: true })}
          {field("tagline", "Tagline")}
          {field("phone_primary", "Primary phone", { type: "tel" })}
          {field("phone_secondary", "Secondary phone", { type: "tel" })}
          {field("whatsapp_number", "WhatsApp number", { type: "tel", hint: "International format recommended, e.g. +250 78…" })}
          {field("contact_email", "Contact email", { type: "email" })}
          {field("address", "Address", { className: "sm:col-span-2" })}
        </div>
      </Panel>

      <Panel title="Payments & bookings">
        <div className="grid gap-5 sm:grid-cols-3">
          {field("momo_pay_code", "MoMo Pay merchant code", { required: true })}
          {field("momo_merchant_name", "Merchant name shown to customers", { required: true })}
          {field("booking_hold_minutes", "Seat hold time (minutes)", { type: "number", hint: "Unpaid bookings expire after this time (15–10080)." })}
        </div>
      </Panel>

      <Panel title="Homepage">
        <div className="grid gap-5">
          {field("hero_title", "Hero headline", { required: true })}
          {field("hero_subtitle", "Hero subtitle", { rows: 2 })}
          {field("about_text", "About / why choose us", { rows: 4 })}
          <div>
            <p className="mb-1.5 text-sm font-medium text-forest-900">Hero image</p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="h-28 w-48 overflow-hidden rounded-xl bg-sand ring-1 ring-line">
                <img src={data.heroImageUrl ?? "/images/placeholders/hero-landscape.svg"} alt="" className="h-full w-full object-cover" />
              </div>
              {canWrite && (
                <div className="flex flex-col gap-2">
                  <input ref={heroInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) hero.mutate(f); e.target.value = ""; }} />
                  <Button size="sm" variant="secondary" icon={<ImagePlus className="size-4" />} loading={hero.isPending} onClick={() => heroInput.current?.click()}>Upload photo</Button>
                  {data.heroImageUrl && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => hero.mutate(null)}>Use illustration</Button>}
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">A wide landscape photo (at least 1920px) works best. Text is shown on the left side.</p>
          </div>
        </div>
      </Panel>

      <Panel title="Social media">
        <div className="grid gap-5 sm:grid-cols-3">
          {field("social_instagram", "Instagram URL", { type: "url" })}
          {field("social_facebook", "Facebook URL", { type: "url" })}
          {field("social_tiktok", "TikTok URL", { type: "url" })}
        </div>
      </Panel>

      {canWrite && (
        <div className="sticky bottom-4 z-20 flex justify-end rounded-2xl bg-white/95 px-5 py-3 shadow-lift ring-1 ring-line backdrop-blur">
          <Button type="submit" loading={save.isPending} icon={<Save className="size-4" />}>Save settings</Button>
        </div>
      )}
    </form>
  );
}
