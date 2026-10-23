import { useEffect } from "react";

/** Keep the tab title and meta description in sync during client-side navigation. */
export function useDocumentMeta(title: string | undefined, description?: string | null) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    }
  }, [title, description]);
}
