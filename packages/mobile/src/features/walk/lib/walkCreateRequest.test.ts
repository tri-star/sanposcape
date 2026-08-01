import { describe, expect, it } from "vitest";

import {
  DESTINATION_NAME_MAX_LENGTH,
  MAX_DISTANCE_METERS,
  MAX_WALK_DURATION_SECONDS,
  buildWalkCreateRequest,
} from "@/features/walk/lib/walkCreateRequest";
import { toTrackPayload } from "@/features/walk/lib/walkTrackPayload";
import type { FinishedWalk } from "@/features/walk/types";

const STARTED_AT_MS = 1_700_000_000_000;

const FINISHED_WALK: FinishedWalk = {
  clientWalkId: "11111111-1111-4111-8111-111111111111",
  startedAtMs: STARTED_AT_MS,
  endedAtMs: STARTED_AT_MS + 1_800_000, // 30分後
  elapsedSec: 1700,
  distanceMeters: 2100,
  destination: {
    placeId: "place-1",
    name: "緑町公園",
    location: { latitude: 35.6875, longitude: 139.7625 },
  },
  track: [
    { latitude: 35.681236, longitude: 139.767125 },
    { latitude: 35.6875, longitude: 139.7625 },
  ],
};

describe("buildWalkCreateRequest", () => {
  it("正常系が snake_case の WalkCreate になる（started_at/ended_at が Z 終わりの ISO8601）", () => {
    const result = buildWalkCreateRequest(FINISHED_WALK);

    expect(result).not.toBeNull();
    expect(result?.client_walk_id).toBe(FINISHED_WALK.clientWalkId);
    expect(result?.started_at).toBe(new Date(STARTED_AT_MS).toISOString());
    expect(result?.ended_at).toBe(new Date(FINISHED_WALK.endedAtMs).toISOString());
    expect(result?.started_at.endsWith("Z")).toBe(true);
    expect(result?.ended_at.endsWith("Z")).toBe(true);
    expect(result?.duration_seconds).toBe(FINISHED_WALK.elapsedSec);
    expect(result?.distance_meters).toBe(FINISHED_WALK.distanceMeters);
    expect(result?.destination).toEqual({
      place_id: "place-1",
      name: "緑町公園",
      location: { latitude: 35.6875, longitude: 139.7625 },
    });
  });

  it("wall-clock が 24 時間超のとき null になる", () => {
    const finished: FinishedWalk = {
      ...FINISHED_WALK,
      endedAtMs: STARTED_AT_MS + (MAX_WALK_DURATION_SECONDS + 1) * 1000,
    };
    expect(buildWalkCreateRequest(finished)).toBeNull();
  });

  it("wall-clock がちょうど 24 時間なら保存できる", () => {
    const finished: FinishedWalk = {
      ...FINISHED_WALK,
      endedAtMs: STARTED_AT_MS + MAX_WALK_DURATION_SECONDS * 1000,
    };
    expect(buildWalkCreateRequest(finished)).not.toBeNull();
  });

  it("wall-clock が 24 時間と 1ms なら null になる", () => {
    const finished: FinishedWalk = {
      ...FINISHED_WALK,
      endedAtMs: STARTED_AT_MS + MAX_WALK_DURATION_SECONDS * 1000 + 1,
    };
    expect(buildWalkCreateRequest(finished)).toBeNull();
  });

  it("ended_at <= started_at のとき null になる", () => {
    expect(buildWalkCreateRequest({ ...FINISHED_WALK, endedAtMs: STARTED_AT_MS })).toBeNull();
    expect(
      buildWalkCreateRequest({ ...FINISHED_WALK, endedAtMs: STARTED_AT_MS - 1000 }),
    ).toBeNull();
  });

  it("placeId が空のとき null になる", () => {
    const finished: FinishedWalk = {
      ...FINISHED_WALK,
      destination: { ...FINISHED_WALK.destination, placeId: "   " },
    };
    expect(buildWalkCreateRequest(finished)).toBeNull();
  });

  it("distance_meters が 200,000 にクランプされる", () => {
    const finished: FinishedWalk = { ...FINISHED_WALK, distanceMeters: 250_000 };
    const result = buildWalkCreateRequest(finished);
    expect(result?.distance_meters).toBe(MAX_DISTANCE_METERS);
  });

  it("name が 256 文字に切り詰められる", () => {
    const longName = "あ".repeat(300);
    const finished: FinishedWalk = {
      ...FINISHED_WALK,
      destination: { ...FINISHED_WALK.destination, name: longName },
    };
    const result = buildWalkCreateRequest(finished);
    expect(result?.destination.name.length).toBe(DESTINATION_NAME_MAX_LENGTH);
    expect(result?.destination.name).toBe(longName.slice(0, DESTINATION_NAME_MAX_LENGTH));
  });

  it("name が空文字ならフォールバック文言になる", () => {
    const finished: FinishedWalk = {
      ...FINISHED_WALK,
      destination: { ...FINISHED_WALK.destination, name: "  " },
    };
    const result = buildWalkCreateRequest(finished);
    expect(result?.destination.name).toBe("目的地");
  });

  it("track が toTrackPayload の結果と一致する", () => {
    const result = buildWalkCreateRequest(FINISHED_WALK);
    expect(result?.track).toEqual(toTrackPayload(FINISHED_WALK.track));
  });
});
