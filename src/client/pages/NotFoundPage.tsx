import { Compass } from "lucide-react";
import { ButtonLink } from "@client/components/ui/Button";
import { useDocumentMeta } from "@client/lib/useDocumentMeta";

export function NotFoundPage() {
  useDocumentMeta("Page not found | Her Journey Tours and Travels");
  return (
    <div className="container-page flex flex-col items-center py-28 text-center">
      <span className="rounded-full bg-forest-50 p-4 text-forest-700"><Compass className="size-8" /></span>
      <h1 className="mt-6 text-5xl font-semibold">This path doesn't lead anywhere</h1>
      <p className="mt-3 max-w-md text-muted">The page you're looking for may have moved. Let's get you back on the journey.</p>
      <div className="mt-8 flex gap-3">
        <ButtonLink to="/">Go home</ButtonLink>
        <ButtonLink to="/tours" variant="secondary">Explore tours</ButtonLink>
      </div>
    </div>
  );
}
