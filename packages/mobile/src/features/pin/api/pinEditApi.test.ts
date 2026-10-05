import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError, getApiErrorCode, isApiError } from "@/api/apiError";
import type { PinRead } from "@/api/generated/model";
import { deletePin, deletePinPhoto, updatePin } from "@/features/pin/api/pinEditApi";
import { server } from "@/test/setup";

const PIN_ID = "33333333-3333-4333-8333-333333333333";
const PHOTO_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const API_BASE_URL = "https://api.sanposcape.example.com";

const PIN_READ: PinRead = {
  id: PIN_ID,
  client_pin_id: "11111111-1111-4111-8111-111111111111",
  sanpo_map: { id: "map-1", name: "最初の地図", is_default: true },
  name: "新しい名前",
  memo: null,
  location: { latitude: 35.681236, longitude: 139.767125 },
  tags: [{ id: "tag-1", label: "桜", created_by_user_id: USER_ID }],
  photos: [],
  photo_count: 0,
  created_by_user_id: USER_ID,
  client_walk_id: null,
  visited: true,
  archived: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("updatePin", () => {
  it("200: 送った PinUpdate がそのままボディになり、PinDetail に変換して返す", async () => {
    let body: unknown;
    let method: string | undefined;
    let pathname: string | undefined;
    server.use(
      http.patch("*/pins/:id", async ({ request }) => {
        body = await request.json();
        method = request.method;
        pathname = new URL(request.url).pathname;
        return HttpResponse.json(PIN_READ);
      }),
    );

    const result = await updatePin(PIN_ID, { name: "新しい名前" }, { apiBaseUrl: API_BASE_URL });

    expect(method).toBe("PATCH");
    expect(pathname).toBe(`/pins/${PIN_ID}`);
    // 変更したフィールドだけを送る（他のキーが無い）。
    expect(body).toEqual({ name: "新しい名前" });
    expect(result.id).toBe(PIN_ID);
    expect(result.sanpoMapId).toBe("map-1");
    expect(result.createdByUserId).toBe(USER_ID);
  });

  it("visited / archived の差分もそのままボディに載る", async () => {
    let body: unknown;
    server.use(
      http.patch("*/pins/:id", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(PIN_READ);
      }),
    );

    const result = await updatePin(
      PIN_ID,
      { visited: true, archived: true },
      { apiBaseUrl: API_BASE_URL },
    );

    expect(body).toEqual({ visited: true, archived: true });
    expect(result.visited).toBe(true);
    expect(result.archived).toBe(true);
  });

  it("タグの差分と null（消去）もそのまま送る", async () => {
    let body: unknown;
    server.use(
      http.patch("*/pins/:id", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(PIN_READ);
      }),
    );

    await updatePin(
      PIN_ID,
      { memo: null, add_tags: ["a"], remove_tag_ids: ["t"] },
      { apiBaseUrl: API_BASE_URL },
    );

    expect(body).toEqual({ memo: null, add_tags: ["a"], remove_tag_ids: ["t"] });
  });

  it("sanpo_map_id もそのままボディに載り、応答の sanpo_map で地図が変わる", async () => {
    let body: unknown;
    server.use(
      http.patch("*/pins/:id", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          ...PIN_READ,
          sanpo_map: { id: "map-2", name: "移動先", is_default: false },
        });
      }),
    );

    const result = await updatePin(PIN_ID, { sanpo_map_id: "map-2" }, { apiBaseUrl: API_BASE_URL });

    expect(body).toEqual({ sanpo_map_id: "map-2" });
    expect(result.sanpoMapId).toBe("map-2");
    expect(result.sanpoMapName).toBe("移動先");
  });

  it.each(["sanpo_map_not_found", "pin_not_found"])(
    "404 + code %s: ApiError(404) で code が読める",
    async (code) => {
      server.use(
        http.patch("*/pins/:id", () => HttpResponse.json({ detail: "x", code }, { status: 404 })),
      );

      const error = await updatePin(
        PIN_ID,
        { sanpo_map_id: "map-2" },
        { apiBaseUrl: API_BASE_URL },
      ).catch((e: unknown) => e);

      expect(isApiError(error)).toBe(true);
      if (!isApiError(error)) return;
      expect(error.status).toBe(404);
      expect(getApiErrorCode(error)).toBe(code);
    },
  );

  it("409 tag_limit_exceeded: ApiError(409) で body.code が残る", async () => {
    server.use(
      http.patch("*/pins/:id", () =>
        HttpResponse.json({ detail: "too many", code: "tag_limit_exceeded" }, { status: 409 }),
      ),
    );

    const error = await updatePin(PIN_ID, { add_tags: ["x"] }, { apiBaseUrl: API_BASE_URL }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect(getApiErrorCode(error)).toBe("tag_limit_exceeded");
  });

  it.each([403, 404])("%d は ApiError の status がそのまま", async (status) => {
    server.use(http.patch("*/pins/:id", () => new HttpResponse(null, { status })));

    const error = await updatePin(PIN_ID, { name: "x" }, { apiBaseUrl: API_BASE_URL }).catch(
      (e: unknown) => e,
    );

    expect((error as ApiError).status).toBe(status);
  });

  it("非 UUID は通信せず ApiError(422)", async () => {
    // onUnhandledRequest: "error" のため、通信すればテストが失敗する。
    const error = await updatePin("not-a-uuid", { name: "x" }, { apiBaseUrl: API_BASE_URL }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(422);
  });
});

describe("deletePin", () => {
  it("204: { alreadyDeleted: false }（DELETE・正しいパス）", async () => {
    let method: string | undefined;
    let pathname: string | undefined;
    server.use(
      http.delete("*/pins/:id", ({ request }) => {
        method = request.method;
        pathname = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    expect(await deletePin(PIN_ID)).toEqual({ alreadyDeleted: false });
    expect(method).toBe("DELETE");
    expect(pathname).toBe(`/pins/${PIN_ID}`);
  });

  it("404: throw せず { alreadyDeleted: true }", async () => {
    server.use(http.delete("*/pins/:id", () => new HttpResponse(null, { status: 404 })));

    expect(await deletePin(PIN_ID)).toEqual({ alreadyDeleted: true });
  });

  it("403: ApiError(403) を throw する", async () => {
    server.use(http.delete("*/pins/:id", () => new HttpResponse(null, { status: 403 })));

    const error = await deletePin(PIN_ID).catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(403);
  });

  it("非 UUID は通信せず ApiError(422)", async () => {
    const error = await deletePin("x").catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(422);
  });
});

describe("deletePinPhoto", () => {
  it("204: { alreadyDeleted: false }。URL に両 id が入る", async () => {
    let pathname: string | undefined;
    server.use(
      http.delete("*/pins/:id/photos/:photoId", ({ request }) => {
        pathname = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    expect(await deletePinPhoto(PIN_ID, PHOTO_ID)).toEqual({ alreadyDeleted: false });
    expect(pathname).toBe(`/pins/${PIN_ID}/photos/${PHOTO_ID}`);
  });

  it("404: { alreadyDeleted: true }", async () => {
    server.use(
      http.delete("*/pins/:id/photos/:photoId", () => new HttpResponse(null, { status: 404 })),
    );

    expect(await deletePinPhoto(PIN_ID, PHOTO_ID)).toEqual({ alreadyDeleted: true });
  });

  it("403: ApiError(403) を throw する", async () => {
    server.use(
      http.delete("*/pins/:id/photos/:photoId", () => new HttpResponse(null, { status: 403 })),
    );

    const error = await deletePinPhoto(PIN_ID, PHOTO_ID).catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(403);
  });

  it("どちらかが非 UUID なら通信せず ApiError(422)", async () => {
    const a = await deletePinPhoto("x", PHOTO_ID).catch((e: unknown) => e);
    const b = await deletePinPhoto(PIN_ID, "y").catch((e: unknown) => e);

    expect((a as ApiError).status).toBe(422);
    expect((b as ApiError).status).toBe(422);
  });
});
