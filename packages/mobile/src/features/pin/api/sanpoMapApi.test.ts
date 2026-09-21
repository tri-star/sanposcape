import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { getListSanpoMapsMockHandler } from "@/api/generated/endpoints/sanpo-maps/sanpo-maps.msw";
import type { SanpoMapListRead } from "@/api/generated/model";
import { fetchSanpoMaps } from "@/features/pin/api/sanpoMapApi";
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
      { id: RESPONSE.items[0]!.id, name: "最初の地図", isDefault: true, role: "owner" },
      { id: RESPONSE.items[1]!.id, name: "友達の地図", isDefault: false, role: "editor" },
    ]);
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
