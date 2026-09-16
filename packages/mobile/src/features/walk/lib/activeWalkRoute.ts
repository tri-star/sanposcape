import { skipToken, type QueryClient } from "@tanstack/react-query";
import type { WalkRoute } from "@/features/walk/types";

export const activeWalkRouteKey = (id: string | null) => ["activeWalkRoute", id] as const;

/** No query function exists: invalidation, reconnect and refetch cannot hit the API. */
export function activeWalkRouteOptions(id: string | null) {
  return {
    queryKey: activeWalkRouteKey(id),
    queryFn: skipToken,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  } as const;
}

export function pinActiveWalkRoute(client: QueryClient, id: string, route: WalkRoute): void {
  client.setQueryDefaults(["activeWalkRoute"], { gcTime: Infinity, staleTime: Infinity });
  client.setQueryData<WalkRoute>(activeWalkRouteKey(id), route);
}

export function clearActiveWalkRoute(client: QueryClient, id: string): void {
  client.removeQueries({ queryKey: activeWalkRouteKey(id), exact: true });
}
