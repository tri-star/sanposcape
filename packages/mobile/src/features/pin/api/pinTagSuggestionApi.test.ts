import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { getListSanpoMapTagsMockHandler } from "@/api/generated/endpoints/sanpo-maps/sanpo-maps.msw";
import type { SanpoMapTagListRead } from "@/api/generated/model";
import { fetchPinTagSuggestions } from "@/features/pin/api/pinTagSuggestionApi";
import { server } from "@/test/setup";

const MAP_ID = "11111111-1111-4111-8111-111111111111";

const RESPONSE: SanpoMapTagListRead = {
  items: [
    { label: "カフェ", pin_count: 3 },
    { label: "Cafe", pin_count: 1 },
  ],
};

describe("fetchPinTagSuggestions", () => {
  it("200 で順序そのままの TagSuggestion[] に変換される", async () => {
    server.use(getListSanpoMapTagsMockHandler(RESPONSE));

    await expect(fetchPinTagSuggestions(MAP_ID, {})).resolves.toEqual([
      { label: "カフェ", pinCount: 3 },
      { label: "Cafe", pinCount: 1 },
    ]);
  });

  it("地図 id と limit=100 だけを送る", async () => {
    let seenId: unknown;
    let seenQuery = "";
    server.use(
      http.get("*/sanpo-maps/:id/tags", ({ request, params }) => {
        seenId = params.id;
        seenQuery = new URL(request.url).search;
        return HttpResponse.json(RESPONSE);
      }),
    );

    await fetchPinTagSuggestions(MAP_ID, {});

    expect(seenId).toBe(MAP_ID);
    expect(seenQuery).toBe("?limit=100");
  });

  it("空配列を返す", async () => {
    server.use(getListSanpoMapTagsMockHandler({ items: [] }));

    await expect(fetchPinTagSuggestions(MAP_ID, {})).resolves.toEqual([]);
  });

  it.each([404, 500])("%i で ApiError が throw される", async (status) => {
    server.use(http.get("*/sanpo-maps/:id/tags", () => new HttpResponse(null, { status })));

    await expect(fetchPinTagSuggestions(MAP_ID, {})).rejects.toMatchObject({
      name: "ApiError",
      status,
    });
  });

  it("UUID でない sanpoMapId は通信せず ApiError(404)", async () => {
    // ハンドラを登録しない（onUnhandledRequest: "error" なので通信したら失敗する）。
    await expect(fetchPinTagSuggestions("../x", {})).rejects.toBeInstanceOf(ApiError);
    await expect(fetchPinTagSuggestions("../x", {})).rejects.toMatchObject({ status: 404 });
  });
});
