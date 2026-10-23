import { useQuery } from "@tanstack/react-query";
import type { PublicSettingsDTO } from "@shared/types";
import { api } from "@client/lib/api";

export function useSettings() {
  return useQuery({
    queryKey: ["public", "settings"],
    queryFn: () => api.get<PublicSettingsDTO>("/api/public/settings"),
    staleTime: 5 * 60_000,
  });
}
