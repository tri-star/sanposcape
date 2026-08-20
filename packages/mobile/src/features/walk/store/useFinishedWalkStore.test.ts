import { beforeEach, describe, expect, it } from "vitest";

import { useFinishedWalkStore } from "@/features/walk/store/useFinishedWalkStore";
import type { FinishedWalk } from "@/features/walk/types";
import { runWalkDeletionCleanup } from "@/lib/walkDeletionCleanup";

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

const INITIAL_STATE = {
  finishedWalk: null,
  savedWalkId: null,
  saved: false,
  signInForSaveRequested: false,
};

describe("useFinishedWalkStore", () => {
  beforeEach(() => {
    useFinishedWalkStore.setState(INITIAL_STATE);
  });

  it("初期値は null / saved:false / signInForSaveRequested:false", () => {
    const state = useFinishedWalkStore.getState();
    expect(state.finishedWalk).toBeNull();
    expect(state.savedWalkId).toBeNull();
    expect(state.saved).toBe(false);
    expect(state.signInForSaveRequested).toBe(false);
  });

  it("finishWalk で保持され saved / signInForSaveRequested がリセットされる", () => {
    useFinishedWalkStore.setState({
      saved: true,
      savedWalkId: "previous-id",
      signInForSaveRequested: true,
    });

    useFinishedWalkStore.getState().finishWalk(FINISHED_WALK);

    const state = useFinishedWalkStore.getState();
    expect(state.finishedWalk).toEqual(FINISHED_WALK);
    expect(state.saved).toBe(false);
    expect(state.savedWalkId).toBeNull();
    expect(state.signInForSaveRequested).toBe(false);
  });

  it("requestSignInForSave で signInForSaveRequested が true になる（SS-37）", () => {
    useFinishedWalkStore.getState().finishWalk(FINISHED_WALK);

    useFinishedWalkStore.getState().requestSignInForSave();

    expect(useFinishedWalkStore.getState().signInForSaveRequested).toBe(true);
  });

  it("markSaved で signInForSaveRequested がリセットされる（SS-37）", () => {
    useFinishedWalkStore.getState().finishWalk(FINISHED_WALK);
    useFinishedWalkStore.getState().requestSignInForSave();

    useFinishedWalkStore.getState().markSaved("walk-id-1");

    expect(useFinishedWalkStore.getState().signInForSaveRequested).toBe(false);
  });

  it("clearFinishedWalk で signInForSaveRequested がリセットされる（SS-37）", () => {
    useFinishedWalkStore.getState().finishWalk(FINISHED_WALK);
    useFinishedWalkStore.getState().requestSignInForSave();

    useFinishedWalkStore.getState().clearFinishedWalk();

    expect(useFinishedWalkStore.getState().signInForSaveRequested).toBe(false);
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

  // このストアを import した時点で walkDeletionCleanup への登録が走るため、
  // resetWalkDeletionCleanupForTest() は呼ばない（呼ぶと登録ごと消えてしまう）。
  describe("削除後始末（walkDeletionCleanup 経由）", () => {
    it("savedWalkId と一致する id で削除後始末を実行すると状態がリセットされる（受け入れ条件6）", () => {
      useFinishedWalkStore.getState().finishWalk(FINISHED_WALK);
      useFinishedWalkStore.getState().markSaved("walk-id-1");

      runWalkDeletionCleanup("walk-id-1");

      const state = useFinishedWalkStore.getState();
      expect(state.finishedWalk).toBeNull();
      expect(state.savedWalkId).toBeNull();
      expect(state.saved).toBe(false);
    });

    it("savedWalkId と一致しない id では状態が変わらない", () => {
      useFinishedWalkStore.getState().finishWalk(FINISHED_WALK);
      useFinishedWalkStore.getState().markSaved("walk-id-1");

      runWalkDeletionCleanup("walk-id-other");

      const state = useFinishedWalkStore.getState();
      expect(state.finishedWalk).toEqual(FINISHED_WALK);
      expect(state.savedWalkId).toBe("walk-id-1");
      expect(state.saved).toBe(true);
    });

    it("savedWalkId が null（保存前のドラフトのみ）のときは任意の id で状態が変わらない", () => {
      useFinishedWalkStore.getState().finishWalk(FINISHED_WALK);

      runWalkDeletionCleanup("walk-id-1");

      const state = useFinishedWalkStore.getState();
      expect(state.finishedWalk).toEqual(FINISHED_WALK);
      expect(state.savedWalkId).toBeNull();
      expect(state.saved).toBe(false);
    });
  });
});
