import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { getSearchExplorePlacesByTextMockHandler } from "@/api/generated/endpoints/explore/explore.msw";
import type { PlaceTextSearchRequest } from "@/api/generated/model";
import { fetchLocationSearch } from "@/features/pin/api/locationSearchApi";
import { server } from "@/test/setup";

const REQUEST: PlaceTextSearchRequest = {
  query: "東京都千代田区丸の内1-9-1",
  bounds: {
    south_west: { latitude: 35.68, longitude: 139.76 },
    north_east: { latitude: 35.69, longitude: 139.77 },
  },
};

describe("fetchLocationSearch", () => {
  it("検索語と範囲を本文で送り（URL に載せない）、結果と scope を返す", async () => {
    let receivedBody: unknown;
    let receivedUrl = "";
    server.use(
      getSearchExplorePlacesByTextMockHandler(async (info) => {
        receivedBody = await info.request.json();
        receivedUrl = info.request.url;
        return {
          scope: "expanded",
          results: [
            {
              id: "p1",
              name: "東京駅",
              address: "東京都千代田区丸の内1丁目9-1",
              location: { latitude: 35.6812, longitude: 139.7671 },
            },
          ],
        };
      }),
    );

    await expect(fetchLocationSearch(REQUEST)).resolves.toEqual({
      scope: "expanded",
      results: [
        {
          id: "p1",
          name: "東京駅",
          address: "東京都千代田区丸の内1丁目9-1",
          location: { latitude: 35.6812, longitude: 139.7671 },
        },
      ],
    });
    expect(receivedBody).toEqual(REQUEST);
    expect(receivedUrl).not.toContain("query");
    expect(decodeURIComponent(receivedUrl)).not.toContain("丸の内");
  });

  it("失敗は ApiError で投げる（検索欄が案内を出す）", async () => {
    server.use(
      http.post("*/explore/places/text-search", () => HttpResponse.json({}, { status: 429 })),
    );

    await expect(fetchLocationSearch(REQUEST)).rejects.toBeInstanceOf(ApiError);
  });
});
