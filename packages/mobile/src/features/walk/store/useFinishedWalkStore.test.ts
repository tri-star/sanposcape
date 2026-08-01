import { beforeEach, describe, expect, it } from "vitest";

import { useFinishedWalkStore } from "@/features/walk/store/useFinishedWalkStore";
import type { FinishedWalk } from "@/features/walk/types";

const FINISHED_WALK: FinishedWalk = {
  clientWalkId: "11111111-1111-4111-8111-111111111111",
  startedAtMs: 1_000_000,
  endedAtMs: 1_060_000,
  elapsedSec: 60,
  distanceMeters: 100,
  destination: {
    placeId: "place-1",
    name: "緑町公園",
    location: { latitude: 35.6875, longitude: 139.7625 },
  },
  track: [],
};

const INITIAL_STATE = { finishedWalk: null, savedWalkId: null, saved: false };

describe("useFinishedWalkStore", () => {
  beforeEach(() => {
    useFinishedWalkStore.setState(INITIAL_STATE);
  });

  it("初期値は null / saved:false", () => {
    const state = useFinishedWalkStore.getState();
    expect(state.finishedWalk).toBeNull();
    expect(state.savedWalkId).toBeNull();
    expect(state.saved).toBe(false);
  });

  it("finishWalk で保持され saved がリセットされる", () => {
    useFinishedWalkStore.setState({ saved: true, savedWalkId: "previous-id" });

    useFinishedWalkStore.getState().finishWalk(FINISHED_WALK);

    const state = useFinishedWalkStore.getState();
    expect(state.finishedWalk).toEqual(FINISHED_WALK);
    expect(state.saved).toBe(false);
    expect(state.savedWalkId).toBeNull();
  });

  it("markSaved(id) で saved:true / savedWalkId が入る", () => {
    useFinishedWalkStore.getState().finishWalk(FINISHED_WALK);
    useFinishedWalkStore.getState().markSaved("walk-id-1");

    const state = useFinishedWalkStore.getState();
    expect(state.saved).toBe(true);
    expect(state.savedWalkId).toBe("walk-id-1");
  });

  it("markSaved(null) でも saved:true になる", () => {
    useFinishedWalkStore.getState().finishWalk(FINISHED_WALK);
    useFinishedWalkStore.getState().markSaved(null);

    const state = useFinishedWalkStore.getState();
    expect(state.saved).toBe(true);
    expect(state.savedWalkId).toBeNull();
  });

  it("clearFinishedWalk で初期状態に戻る", () => {
    useFinishedWalkStore.getState().finishWalk(FINISHED_WALK);
    useFinishedWalkStore.getState().markSaved("walk-id-1");

    useFinishedWalkStore.getState().clearFinishedWalk();

    expect(useFinishedWalkStore.getState()).toMatchObject(INITIAL_STATE);
  });
});
