import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { getCreateWalkWalksPostMockHandler } from "@/api/generated/endpoints/walks/walks.msw";
import type { WalkCreate, WalkRead } from "@/api/generated/model";
import { saveWalk } from "@/features/walk/api/walkApi";
import { server } from "@/test/setup";

const REQUEST: WalkCreate = {
  client_walk_id: "11111111-1111-4111-8111-111111111111",
  started_at: "2026-01-01T00:00:00.000Z",
  ended_at: "2026-01-01T00:30:00.000Z",
  duration_seconds: 1700,
  distance_meters: 2100,
  destination: {
    place_id: "place-1",
    name: "緑町公園",
    location: { latitude: 35.6875, longitude: 139.7625 },
  },
  track: [
    { latitude: 35.681236, longitude: 139.767125 },
    { latitude: 35.6875, longitude: 139.7625 },
  ],
};

const RESPONSE: WalkRead = {
  id: "22222222-2222-4222-8222-222222222222",
  client_walk_id: REQUEST.client_walk_id,
  started_at: REQUEST.started_at,
  ended_at: REQUEST.ended_at,
  duration_seconds: REQUEST.duration_seconds,
  distance_meters: REQUEST.distance_meters,
  destination: {
    place_id: "place-1",
    name: "緑町公園",
    location: { latitude: 35.6875, longitude: 139.7625 },
  },
  created_at: "2026-01-01T00:30:01.000Z",
};

describe("saveWalk", () => {
  it("201（新規作成）で WalkRead が返る", async () => {
    server.use(http.post("*/walks", () => HttpResponse.json(RESPONSE, { status: 201 })));

    const result = await saveWalk(REQUEST);

    expect(result).toEqual(RESPONSE);
  });

  it("200（冪等再送）でも WalkRead が返る", async () => {
    server.use(getCreateWalkWalksPostMockHandler(RESPONSE));

    const result = await saveWalk(REQUEST);

    expect(result).toEqual(RESPONSE);
  });

  it("送信ボディが WalkCreate として期待どおり送信される", async () => {
    let receivedBody: WalkCreate | undefined;
    server.use(
      getCreateWalkWalksPostMockHandler(async (info) => {
        receivedBody = (await info.request.json()) as WalkCreate;
        return RESPONSE;
      }),
    );

    await saveWalk(REQUEST);

    expect(receivedBody).toEqual(REQUEST);
  });

  it("401 で ApiError(401) が throw され、呼び出し回数は1", async () => {
    let callCount = 0;
    server.use(
      http.post("*/walks", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(saveWalk(REQUEST)).rejects.toThrow(ApiError);
    expect(callCount).toBe(1);
  });

  it.each([413, 422, 500])("%d は ApiError になる", async (status) => {
    server.use(http.post("*/walks", () => new HttpResponse(null, { status })));

    try {
      await saveWalk(REQUEST);
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
    }
  });
});
