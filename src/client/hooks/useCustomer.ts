import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomerDTO } from "@shared/types";
import { api } from "@client/lib/api";

export const CUSTOMER_KEY = ["account", "me"] as const;

/** The signed-in traveller, or null when browsing as a guest. */
export function useCustomer() {
  return useQuery({
    queryKey: CUSTOMER_KEY,
    queryFn: async () => (await api.get<{ customer: CustomerDTO | null }>("/api/account/me")).customer,
    staleTime: 5 * 60_000,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/api/account/logout"),
    onSettled: () => {
      queryClient.setQueryData(CUSTOMER_KEY, null);
      queryClient.removeQueries({ queryKey: ["account", "bookings"] });
    },
  });
}
