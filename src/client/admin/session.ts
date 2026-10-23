import { useQuery } from "@tanstack/react-query";
import type { Permission } from "@shared/constants";
import type { SessionDTO } from "@shared/types";
import { api, ApiError } from "@client/lib/api";

export const SESSION_KEY = ["admin", "session"] as const;

export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      try {
        return await api.get<SessionDTO>("/api/admin/auth/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useCan() {
  const { data } = useSession();
  return (permission: Permission) => Boolean(data?.permissions.includes(permission));
}
