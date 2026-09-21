import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { fetchAppConfig } from "@/api/appConfigApi";
import { getGetAppConfigMockHandler } from "@/api/generated/endpoints/app-config/app-config.msw";
import type { AppConfigRead } from "@/api/generated/model";
import { server } from "@/test/setup";

const RESPONSE: AppConfigRead = {
  flags: { pin_registration: true },
  minimum_supported_versions: { ios: "0.1.0", android: "0.1.0" },
  config_source: "stub",
};

describe("fetchAppConfig", () => {
  it("200で AppConfigRead がそのまま返る（明示的なレスポンス）", async () => {
    server.use(getGetAppConfigMockHandler(RESPONSE));

    const result = await fetchAppConfig();

    expect(result).toEqual(RESPONSE);
  });

  it.each([401, 404, 500])("%d で ApiError が throw され status が一致する", async (status) => {
    server.use(http.get("*/app-config", () => new HttpResponse(null, { status })));

    try {
      await fetchAppConfig();
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
    }
  });

  it("500のとき呼び出し回数は1（transientRetryの対象外）", async () => {
    let callCount = 0;
    server.use(
      http.get("*/app-config", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(fetchAppConfig()).rejects.toThrow(ApiError);
    expect(callCount).toBe(1);
  });

  it("503は2回呼ばれてから ApiError（GETのtransientRetryが効く）", async () => {
    let callCount = 0;
    server.use(
      http.get("*/app-config", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 503 });
      }),
    );

    await expect(fetchAppConfig()).rejects.toThrow(ApiError);
    expect(callCount).toBe(2);
  });
});
