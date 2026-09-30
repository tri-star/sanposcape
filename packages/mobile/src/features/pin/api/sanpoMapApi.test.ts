import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { getListSanpoMapsMockHandler } from "@/api/generated/endpoints/sanpo-maps/sanpo-maps.msw";
import type { SanpoMapListRead } from "@/api/generated/model";
import { createSanpoMap, fetchSanpoMaps } from "@/features/pin/api/sanpoMapApi";
import { server } from "@/test/setup";

const RESPONSE: SanpoMapListRead = {
  items: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "最初の地図",
      is_default: true,
      role: "owner",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      pin_count: 4,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "友達の地図",
      is_default: false,
      role: "editor",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  next_cursor: null,
};

describe("fetchSanpoMaps", () => {
  it("200 で camelCase の SanpoMap[] に変換される", async () => {
    server.use(getListSanpoMapsMockHandler(RESPONSE));

    const result = await fetchSanpoMaps();

    expect(result).toEqual([
      {
        id: RESPONSE.items[0]!.id,
        name: "最初の地図",
        isDefault: true,
        role: "owner",
        pinCount: 4,
      },
      {
        id: RESPONSE.items[1]!.id,
        name: "友達の地図",
        isDefault: false,
        role: "editor",
        pinCount: null,
      },
    ]);
  });

  it("expand=pin_count を送る", async () => {
    let searchParams: URLSearchParams | undefined;
    server.use(
      http.get("*/sanpo-maps", ({ request }) => {
        searchParams = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [], next_cursor: null }, { status: 200 });
      }),
    );

    await fetchSanpoMaps();

    expect(searchParams?.getAll("expand")).toEqual(["pin_count"]);
  });

  it("pin_count の数値・null・欠落がそれぞれ pinCount の数値・null・null になる", async () => {
    const base = RESPONSE.items[0]!;
    const { pin_count: _omit, ...withoutPinCount } = base;
    server.use(
      getListSanpoMapsMockHandler({
        items: [
          { ...base, id: "a", pin_count: 0 },
          { ...base, id: "b", pin_count: null },
          { ...withoutPinCount, id: "c" },
        ],
        next_cursor: null,
      }),
    );

    const result = await fetchSanpoMaps();

    expect(result.map((m) => m.pinCount)).toEqual([0, null, null]);
  });

  it("空配列を返す", async () => {
    server.use(getListSanpoMapsMockHandler({ items: [], next_cursor: null }));

    const result = await fetchSanpoMaps();

    expect(result).toEqual([]);
  });

  it("401 で ApiError(401) が throw される", async () => {
    server.use(http.get("*/sanpo-maps", () => new HttpResponse(null, { status: 401 })));

    await expect(fetchSanpoMaps()).rejects.toThrow(ApiError);
  });

  it("500 で ApiError(500) が throw される", async () => {
    server.use(http.get("*/sanpo-maps", () => new HttpResponse(null, { status: 500 })));

    try {
      await fetchSanpoMaps();
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(500);
    }
  });
});

describe("createSanpoMap", () => {
  const CREATED = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "新しい地図",
    is_default: false,
    role: "owner" as const,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    pin_count: null,
  };

  it("body { name } を送り、201 で pinCount 0 の SanpoMap を返す", async () => {
    let body: unknown;
    server.use(
      http.post("*/sanpo-maps", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(CREATED, { status: 201 });
      }),
    );

    const result = await createSanpoMap({ name: "新しい地図" });

    expect(body).toEqual({ name: "新しい地図" });
    expect(result).toEqual({
      id: CREATED.id,
      name: "新しい地図",
      isDefault: false,
      role: "owner",
      pinCount: 0,
    });
  });

  it.each([401, 422, 500])("%d で ApiError（status 付き）が throw される", async (status) => {
    server.use(http.post("*/sanpo-maps", () => new HttpResponse(null, { status })));

    try {
      await createSanpoMap({ name: "x" });
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
    }
  });

  it("通信断では TypeError がそのまま投げられる", async () => {
    server.use(http.post("*/sanpo-maps", () => HttpResponse.error()));

    await expect(createSanpoMap({ name: "x" })).rejects.toThrow(TypeError);
  });
});
