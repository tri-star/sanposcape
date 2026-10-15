import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { getReverseGeocodeExploreMockHandler } from "@/api/generated/endpoints/explore/explore.msw";
import type { ReverseGeocodeRequest } from "@/api/generated/model";
import { fetchPinDefaultName } from "@/features/pin/api/pinAddressApi";
import { server } from "@/test/setup";

const REQUEST: ReverseGeocodeRequest = { location: { latitude: 35.681236, longitude: 139.767125 } };

describe("fetchPinDefaultName", () => {
  it("住所と建物名からピン名の初期値を作り、座標をボディで送る", async () => {
    let receivedBody: unknown;
    server.use(
      getReverseGeocodeExploreMockHandler(async (info) => {
        receivedBody = await info.request.json();
        return { address: "東京都千代田区丸の内1丁目9-1", building_name: "テストビル" };
      }),
    );

    await expect(fetchPinDefaultName(REQUEST, {})).resolves.toBe(
      "東京都千代田区丸の内1丁目9-1 テストビル付近",
    );
    expect(receivedBody).toEqual(REQUEST);
  });

  it("住所が無ければ null", async () => {
    server.use(getReverseGeocodeExploreMockHandler({ address: null, building_name: null }));

    await expect(fetchPinDefaultName(REQUEST, {})).resolves.toBeNull();
  });

  it("失敗は ApiError で投げる（呼び出し側の hook が null として扱う）", async () => {
    server.use(
      http.post("*/explore/reverse-geocode", () => HttpResponse.json({}, { status: 401 })),
    );

    await expect(fetchPinDefaultName(REQUEST, {})).rejects.toBeInstanceOf(ApiError);
  });
});
