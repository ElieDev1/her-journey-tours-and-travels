import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Input } from "@client/components/ui/Field";

/** Edit an ordered list of short text items (inclusions, highlights, …). */
export function ListEditor({ label, items, onChange, placeholder, hint }: { label: string; items: string[]; onChange: (items: string[]) => void; placeholder?: string; hint?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (!value || items.includes(value)) return;
    onChange([...items, value]);
    setDraft("");
  };
  const move = (i: number, dir: -1 | 1) => {
    const next = [...items];
    const [item] = next.splice(i, 1);
    next.splice(i + dir, 0, item!);
    onChange(next);
  };
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-forest-900">{label}</p>
      {hint && <p className="-mt-1 mb-2 text-xs text-muted">{hint}</p>}
      {items.length > 0 && (
        <ul className="mb-2 divide-y divide-line rounded-xl ring-1 ring-line">
          {items.map((item, i) => (
            <li key={`${item}-${i}`} className="flex items-center gap-2 bg-white px-3 py-2 text-sm first:rounded-t-xl last:rounded-b-xl">
              <span className="flex-1">{item}</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-muted hover:bg-sand disabled:opacity-30" aria-label={`Move ${item} up`}>
                <ArrowUp className="size-3.5" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="rounded p-1 text-muted hover:bg-sand disabled:opacity-30" aria-label={`Move ${item} down`}>
                <ArrowDown className="size-3.5" />
              </button>
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="rounded p-1 text-danger-600 hover:bg-danger-50" aria-label={`Remove ${item}`}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder ?? "Add an item and press Enter"}
          maxLength={200}
          aria-label={`Add to ${label}`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" onClick={add} className="inline-flex shrink-0 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-forest-700 ring-1 ring-line hover:bg-forest-50">
          <Plus className="size-4" /> Add
        </button>
      </div>
    </div>
  );
}
