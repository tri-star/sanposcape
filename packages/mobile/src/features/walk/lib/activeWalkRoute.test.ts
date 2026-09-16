import { QueryClient, QueryObserver, focusManager, onlineManager } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import {
  activeWalkRouteKey,
  activeWalkRouteOptions,
  clearActiveWalkRoute,
  pinActiveWalkRoute,
} from "./activeWalkRoute";
import { toWalkRoute } from "./walkRoute";

const point = { latitude: 35, longitude: 139 };
const route = toWalkRoute({
  origin: point,
  destination: { place_id: "p", name: "公園", location: point },
  duration_seconds: 100,
  distance_meters: 120,
  path: [point, point],
  bounds: { north_east: point, south_west: point },
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
  focusManager.setFocused(undefined);
});

it("retains the selected route across elapsed time, remount, invalidation and reconnect without fetching", async () => {
  vi.useFakeTimers();
  const fetch = vi.spyOn(globalThis, "fetch");
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: () => fetch("http://localhost/unexpected") } },
  });
  client.mount();
  pinActiveWalkRoute(client, "walk-1", route);
  const observer = new QueryObserver(client, activeWalkRouteOptions("walk-1"));
  const unsubscribe = observer.subscribe(() => {});
  expect(observer.getCurrentResult().data).toEqual(route);
  unsubscribe();
  await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
  onlineManager.setOnline(false);
  focusManager.setFocused(false);
  onlineManager.setOnline(true);
  focusManager.setFocused(true);
  await client.invalidateQueries();
  await client.refetchQueries();
  const remounted = new QueryObserver(client, activeWalkRouteOptions("walk-1"));
  const off = remounted.subscribe(() => {});
  expect(remounted.getCurrentResult().data).toEqual(route);
  expect(fetch).not.toHaveBeenCalled();
  off();
  clearActiveWalkRoute(client, "walk-1");
  expect(client.getQueryData(activeWalkRouteKey("walk-1"))).toBeUndefined();
  client.unmount();
  client.clear();
});

it("missing active cache does not recover by requesting a new route", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const client = new QueryClient();
  const observer = new QueryObserver(client, activeWalkRouteOptions("missing"));
  const off = observer.subscribe(() => {});
  await client.invalidateQueries();
  expect(observer.getCurrentResult().data).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
  off();
  client.clear();
});
