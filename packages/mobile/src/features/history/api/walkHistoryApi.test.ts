import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  getGetWalkWalksWalkIdGetMockHandler,
  getListWalksWalksGetMockHandler,
} from "@/api/generated/endpoints/walks/walks.msw";
import type { WalkDetailRead, WalkListRead } from "@/api/generated/model";
import { fetchWalkDetail, fetchWalkList } from "@/features/history/api/walkHistoryApi";
import { server } from "@/test/setup";

/** UUID形式の有効なテスト用 walkId。`fetchWalkDetail` は非UUIDを通信前に弾くため通常系のIDはUUIDにする。 */
const VALID_WALK_ID = "123e4567-e89b-12d3-a456-426614174000";

const LIST_RESPONSE: WalkListRead = {
  items: [
    {
      id: "walk-1",
      client_walk_id: "client-1",
      started_at: "2026-08-02T14:30:00.000Z",
      ended_at: "2026-08-02T15:02:00.000Z",
      duration_seconds: 1920,
      distance_meters: 2143,
      destination: {
        place_id: "place-1",
        name: "緑町公園",
        location: { latitude: 35.6875, longitude: 139.7625 },
      },
      created_at: "2026-08-02T15:02:01.000Z",
    },
  ],
  next_cursor: null,
};

const DETAIL_RESPONSE: WalkDetailRead = {
  id: VALID_WALK_ID,
  client_walk_id: "client-1",
  started_at: "2026-08-02T14:30:00.000Z",
  ended_at: "2026-08-02T15:02:00.000Z",
  duration_seconds: 1920,
  distance_meters: 2143,
  destination: {
    place_id: "place-1",
    name: "緑町公園",
    location: { latitude: 35.6875, longitude: 139.7625 },
  },
  created_at: "2026-08-02T15:02:01.000Z",
  track: [
    { latitude: 35.681236, longitude: 139.767125 },
    { latitude: 35.6875, longitude: 139.7625 },
  ],
};

describe("fetchWalkList", () => {
  it("200で WalkListRead がそのまま返る", async () => {
    server.use(getListWalksWalksGetMockHandler(LIST_RESPONSE));

    const result = await fetchWalkList({ limit: 20 });

    expect(result).toEqual(LIST_RESPONSE);
  });

  it("limit=20 が付き cursor が無い", async () => {
    let searchParams: URLSearchParams | undefined;
    server.use(
      getListWalksWalksGetMockHandler((info) => {
        searchParams = new URL(info.request.url).searchParams;
        return LIST_RESPONSE;
      }),
    );

    await fetchWalkList({ limit: 20 });

    expect(searchParams?.get("limit")).toBe("20");
    expect(searchParams?.has("cursor")).toBe(false);
  });

  it("cursor 指定時はクエリに付く", async () => {
    let searchParams: URLSearchParams | undefined;
    server.use(
      getListWalksWalksGetMockHandler((info) => {
        searchParams = new URL(info.request.url).searchParams;
        return LIST_RESPONSE;
      }),
    );

    await fetchWalkList({ limit: 20, cursor: "next-page-token" });

    expect(searchParams?.get("cursor")).toBe("next-page-token");
  });

  it.each([400, 401, 422, 500])("%d で ApiError が throw される", async (status) => {
    server.use(http.get("*/walks", () => new HttpResponse(null, { status })));

    try {
      await fetchWalkList({ limit: 20 });
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
    }
  });

  it("401のとき呼び出し回数は1", async () => {
    let callCount = 0;
    server.use(
      http.get("*/walks", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(fetchWalkList({ limit: 20 })).rejects.toThrow(ApiError);
    expect(callCount).toBe(1);
  });
});

describe("fetchWalkDetail", () => {
  it("200で WalkDetailRead（track付き）が返る", async () => {
    server.use(getGetWalkWalksWalkIdGetMockHandler(DETAIL_RESPONSE));

    const result = await fetchWalkDetail(VALID_WALK_ID);

    expect(result).toEqual(DETAIL_RESPONSE);
  });

  it("404で ApiError(404)", async () => {
    server.use(http.get("*/walks/:walkId", () => new HttpResponse(null, { status: 404 })));

    try {
      await fetchWalkDetail(VALID_WALK_ID);
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(404);
    }
  });

  it("一覧用ハンドラ（*/walks）と併用しても取り違えない", async () => {
    server.use(
      getListWalksWalksGetMockHandler(LIST_RESPONSE),
      getGetWalkWalksWalkIdGetMockHandler(DETAIL_RESPONSE),
    );

    const list = await fetchWalkList({ limit: 20 });
    const detail = await fetchWalkDetail(VALID_WALK_ID);

    expect(list).toEqual(LIST_RESPONSE);
    expect(detail).toEqual(DETAIL_RESPONSE);
  });

  it("walkId が UUID 形式でなければ通信せず 404 の ApiError で失敗する（多層防御）", async () => {
    let requestCount = 0;
    server.use(
      http.get("*/walks/:walkId", () => {
        requestCount += 1;
        return HttpResponse.json(DETAIL_RESPONSE);
      }),
    );

    try {
      await fetchWalkDetail("../../users/me");
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(404);
    }
    // ネットワークに到達していないこと（confused deputy 対策の要）を確認する。
    expect(requestCount).toBe(0);
  });
});
