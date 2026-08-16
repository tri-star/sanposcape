import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  getGetWalkWalksWalkIdGetMockHandler,
  getListWalksWalksGetMockHandler,
} from "@/api/generated/endpoints/walks/walks.msw";
import type { WalkDetailRead, WalkListRead } from "@/api/generated/model";
import { deleteWalk } from "@/features/history/api/walkDeleteApi";
import { server } from "@/test/setup";

/** UUID形式の有効なテスト用 walkId。`deleteWalk` は非UUIDを通信前に弾くため通常系のIDはUUIDにする。 */
const VALID_WALK_ID = "123e4567-e89b-12d3-a456-426614174000";

describe("deleteWalk", () => {
  it("204で { alreadyDeleted: false } を返す（DELETE メソッド・正しいパス）", async () => {
    let method: string | undefined;
    let pathname: string | undefined;
    server.use(
      http.delete("*/walks/:walkId", (info) => {
        method = info.request.method;
        pathname = new URL(info.request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const result = await deleteWalk(VALID_WALK_ID);

    expect(result).toEqual({ alreadyDeleted: false });
    expect(method).toBe("DELETE");
    expect(pathname).toBe(`/walks/${VALID_WALK_ID}`);
  });

  it("404では throw せず { alreadyDeleted: true } を返す（受け入れ条件5）", async () => {
    server.use(http.delete("*/walks/:walkId", () => new HttpResponse(null, { status: 404 })));

    const result = await deleteWalk(VALID_WALK_ID);

    expect(result).toEqual({ alreadyDeleted: true });
  });

  it.each([401, 413, 422, 500])("%d では ApiError を throw する", async (status) => {
    server.use(http.delete("*/walks/:walkId", () => new HttpResponse(null, { status })));

    try {
      await deleteWalk(VALID_WALK_ID);
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
    }
  });

  it("401のとき呼び出し回数は1", async () => {
    let callCount = 0;
    server.use(
      http.delete("*/walks/:walkId", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(deleteWalk(VALID_WALK_ID)).rejects.toThrow(ApiError);
    expect(callCount).toBe(1);
  });

  it("walkId が UUID 形式でなければ通信せず ApiError(422) で失敗する（多層防御）", async () => {
    let requestCount = 0;
    server.use(
      http.delete("*/walks/:walkId", () => {
        requestCount += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    try {
      await deleteWalk("../../users/me");
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(422);
    }
    // ネットワークに到達していないこと（confused deputy 対策の要）を確認する。
    expect(requestCount).toBe(0);
  });

  it("一覧・詳細のハンドラと併用しても取り違えない（DELETE だけが走る）", async () => {
    const LIST_RESPONSE: WalkListRead = { items: [], next_cursor: null };
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
      track: [],
    };
    let deleteCallCount = 0;
    server.use(
      getListWalksWalksGetMockHandler(LIST_RESPONSE),
      getGetWalkWalksWalkIdGetMockHandler(DETAIL_RESPONSE),
      http.delete("*/walks/:walkId", () => {
        deleteCallCount += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const result = await deleteWalk(VALID_WALK_ID);

    expect(result).toEqual({ alreadyDeleted: false });
    expect(deleteCallCount).toBe(1);
  });
});
