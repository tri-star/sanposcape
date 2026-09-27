import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  getGetPinMockHandler,
  getListPinPhotosMockHandler,
  getListPinsMockHandler,
} from "@/api/generated/endpoints/pins/pins.msw";
import type {
  PinListItemRead,
  PinPhotoPageRead,
  PinPhotoRead,
  PinRead,
} from "@/api/generated/model";
import {
  PIN_PHOTO_PAGE_SIZE,
  fetchPinDetail,
  fetchPinPhotoPage,
  fetchPinsInBounds,
} from "@/features/pin/api/pinReadApi";
import type { GeoBounds } from "@/features/pin/types";
import { server } from "@/test/setup";

const PIN_ID = "33333333-3333-4333-8333-333333333333";
const API_BASE_URL = "https://api.sanposcape.example.com";
const BOUNDS: GeoBounds = { south: 35.6, north: 35.7, west: 139.7, east: 139.8 };

function photo(overrides: Partial<PinPhotoRead> = {}): PinPhotoRead {
  return {
    id: "photo-1",
    upload_id: "up-1",
    position: 0,
    width: 100,
    height: 100,
    byte_size: 1000,
    content_type: "image/jpeg",
    thumbnail: null,
    original_url: null,
    urls_expire_at: "2026-01-01T01:00:00.000Z",
    uploaded_by_user_id: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function listItem(overrides: Partial<PinListItemRead> = {}): PinListItemRead {
  return {
    id: "pin-1",
    sanpo_map_id: "map-1",
    name: "桜の木",
    location: { latitude: 35.681236, longitude: 139.767125 },
    tags: [],
    cover_photo: null,
    photo_count: 0,
    created_by_user_id: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function pinRead(overrides: Partial<PinRead> = {}): PinRead {
  return {
    id: PIN_ID,
    client_pin_id: "client-1",
    sanpo_map: { id: "map-1", name: "最初の地図", is_default: true },
    name: null,
    memo: null,
    location: { latitude: 35.681236, longitude: 139.767125 },
    tags: [],
    photos: [],
    photo_count: 0,
    created_by_user_id: "user-1",
    client_walk_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("fetchPinsInBounds", () => {
  it("送信クエリに sanpo_map_id・4つの bbox・limit=200 が載り、cursor/q/tags が無い", async () => {
    let searchParams: URLSearchParams | undefined;
    server.use(
      http.get("*/pins", ({ request }) => {
        searchParams = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [], next_cursor: null }, { status: 200 });
      }),
    );

    await fetchPinsInBounds({ sanpoMapId: "map-1", bounds: BOUNDS }, {});

    expect(searchParams?.get("sanpo_map_id")).toBe("map-1");
    expect(searchParams?.get("min_latitude")).toBe("35.6");
    expect(searchParams?.get("max_latitude")).toBe("35.7");
    expect(searchParams?.get("min_longitude")).toBe("139.7");
    expect(searchParams?.get("max_longitude")).toBe("139.8");
    expect(searchParams?.get("limit")).toBe("200");
    expect(searchParams?.has("cursor")).toBe(false);
    expect(searchParams?.has("q")).toBe(false);
    expect(searchParams?.has("tags")).toBe(false);
    expect([...(searchParams?.values() ?? [])]).not.toContain("null");
  });

  it("200: items を PinSummary に変換し、不正座標の要素は除外する。next_cursor 非nullなら hasMore true", async () => {
    server.use(
      getListPinsMockHandler({
        items: [
          listItem({ id: "a" }),
          listItem({ id: "b", location: { latitude: 91, longitude: 0 } }),
        ],
        next_cursor: "next",
      }),
    );

    const result = await fetchPinsInBounds({ sanpoMapId: "map-1", bounds: BOUNDS }, {});

    expect(result.pins.map((p) => p.id)).toEqual(["a"]);
    expect(result.hasMore).toBe(true);
  });

  it.each([401, 404, 422, 500])("%d は ApiError になる", async (status) => {
    server.use(http.get("*/pins", () => new HttpResponse(null, { status })));

    await expect(fetchPinsInBounds({ sanpoMapId: "map-1", bounds: BOUNDS }, {})).rejects.toThrow(
      ApiError,
    );
  });
});

describe("fetchPinDetail", () => {
  it("200: name null・タグ・写真の URL フィルタを反映した PinDetail を返す", async () => {
    server.use(
      getGetPinMockHandler(
        pinRead({
          tags: [{ id: "tag-1", label: "桜", created_by_user_id: "user-1" }],
          photos: [photo({ original_url: "http://evil.example.com/x.jpg" })],
        }),
      ),
    );

    const result = await fetchPinDetail(PIN_ID, { apiBaseUrl: API_BASE_URL });

    expect(result.name).toBeNull();
    expect(result.tags).toEqual([{ id: "tag-1", label: "桜" }]);
    expect(result.photos[0]?.originalUrl).toBeNull();
  });

  it("非UUIDのpinIdはfetchせずにApiError(404)", async () => {
    let called = false;
    server.use(
      http.get("*/pins/:pinId", () => {
        called = true;
        return HttpResponse.json(pinRead(), { status: 200 });
      }),
    );

    await expect(fetchPinDetail("not-a-uuid", { apiBaseUrl: API_BASE_URL })).rejects.toThrow(
      ApiError,
    );
    expect(called).toBe(false);
  });

  it.each([404, 401])("%d は ApiError になる", async (status) => {
    server.use(http.get("*/pins/:pinId", () => new HttpResponse(null, { status })));

    await expect(fetchPinDetail(PIN_ID, { apiBaseUrl: API_BASE_URL })).rejects.toThrow(ApiError);
  });
});

describe("fetchPinPhotoPage", () => {
  it("初回（cursor null）は cursor キー無し・limit=30", async () => {
    let searchParams: URLSearchParams | undefined;
    server.use(
      http.get("*/pins/:pinId/photos", ({ request }) => {
        searchParams = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [], photo_count: 0, next_cursor: null }, { status: 200 });
      }),
    );

    await fetchPinPhotoPage(PIN_ID, { cursor: null }, { apiBaseUrl: API_BASE_URL });

    expect(searchParams?.has("cursor")).toBe(false);
    expect(searchParams?.get("limit")).toBe(String(PIN_PHOTO_PAGE_SIZE));
  });

  it("2回目（cursor 指定）は cursor=<値> が載る", async () => {
    let searchParams: URLSearchParams | undefined;
    server.use(
      http.get("*/pins/:pinId/photos", ({ request }) => {
        searchParams = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [], photo_count: 0, next_cursor: null }, { status: 200 });
      }),
    );

    await fetchPinPhotoPage(PIN_ID, { cursor: "abc" }, { apiBaseUrl: API_BASE_URL });

    expect(searchParams?.get("cursor")).toBe("abc");
  });

  it("200: items・photoCount・nextCursor の変換", async () => {
    const page: PinPhotoPageRead = {
      items: [photo({ id: "p1" })],
      photo_count: 5,
      next_cursor: "n1",
    };
    server.use(getListPinPhotosMockHandler(page));

    const result = await fetchPinPhotoPage(PIN_ID, { cursor: null }, { apiBaseUrl: API_BASE_URL });

    expect(result.items).toHaveLength(1);
    expect(result.photoCount).toBe(5);
    expect(result.nextCursor).toBe("n1");
  });

  it("非UUIDのpinIdはfetchしない", async () => {
    let called = false;
    server.use(
      http.get("*/pins/:pinId/photos", () => {
        called = true;
        return HttpResponse.json({ items: [], photo_count: 0, next_cursor: null }, { status: 200 });
      }),
    );

    await expect(
      fetchPinPhotoPage("not-a-uuid", { cursor: null }, { apiBaseUrl: API_BASE_URL }),
    ).rejects.toThrow(ApiError);
    expect(called).toBe(false);
  });

  it("400（invalid cursor）は ApiError(400)", async () => {
    server.use(http.get("*/pins/:pinId/photos", () => new HttpResponse(null, { status: 400 })));

    try {
      await fetchPinPhotoPage(PIN_ID, { cursor: "bad" }, { apiBaseUrl: API_BASE_URL });
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(400);
    }
  });
});
