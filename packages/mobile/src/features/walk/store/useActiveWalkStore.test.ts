import { beforeEach, describe, expect, it } from "vitest";

import { useActiveWalkStore } from "@/features/walk/store/useActiveWalkStore";
import type { ActiveWalk } from "@/features/walk/types";

const WALK: ActiveWalk = {
  origin: { latitude: 35.681236, longitude: 139.767125 },
  destination: {
    placeId: "place-1",
    name: "緑町公園",
    location: { latitude: 35.6875, longitude: 139.7625 },
  },
  roundTripMinutes: 40,
  roundTripKm: 2.6,
  startedAtMs: 1_000_000,
};

describe("useActiveWalkStore", () => {
  beforeEach(() => {
    useActiveWalkStore.setState({ activeWalk: null });
  });

  it("初期値は null", () => {
    expect(useActiveWalkStore.getState().activeWalk).toBeNull();
  });

  it("startWalk で保持される", () => {
    useActiveWalkStore.getState().startWalk(WALK);
    expect(useActiveWalkStore.getState().activeWalk).toEqual(WALK);
  });

  it("endWalk で null に戻る", () => {
    useActiveWalkStore.getState().startWalk(WALK);
    useActiveWalkStore.getState().endWalk();
    expect(useActiveWalkStore.getState().activeWalk).toBeNull();
  });

  it("startWalk を2回呼ぶと後勝ち", () => {
    const second: ActiveWalk = { ...WALK, destination: { ...WALK.destination, name: "別の公園" } };
    useActiveWalkStore.getState().startWalk(WALK);
    useActiveWalkStore.getState().startWalk(second);
    expect(useActiveWalkStore.getState().activeWalk).toEqual(second);
  });
});
