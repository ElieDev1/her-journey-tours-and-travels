import { useQuery } from "@tanstack/react-query";
import type { AuthConfigDTO } from "@shared/types";
import { api } from "@client/lib/api";

/** Which optional sign-in features (Google, password reset email) are switched on. */
export function useAuthConfig() {
  return useQuery({
    queryKey: ["auth", "config"],
    queryFn: () => api.get<AuthConfigDTO>("/api/auth/config"),
    staleTime: 10 * 60_000,
  });
}
