import { describe, expect, it } from "vitest";

import {
  LocationError,
  isLocationError,
  locationErrorMessage,
  toLocationError,
} from "@/services/location/locationError";
import type { LocationErrorCode } from "@/services/location/types";

describe("toLocationError", () => {
  it("E_NO_PERMISSIONS は permission_denied になる", () => {
    expect(toLocationError({ code: "E_NO_PERMISSIONS" }).code).toBe("permission_denied");
  });

  it("ERR_NO_PERMISSIONS は permission_denied になる", () => {
    expect(toLocationError({ code: "ERR_NO_PERMISSIONS" }).code).toBe("permission_denied");
  });

  it("E_LOCATION_SERVICES_DISABLED は services_disabled になる", () => {
    expect(toLocationError({ code: "E_LOCATION_SERVICES_DISABLED" }).code).toBe(
      "services_disabled",
    );
  });

  it("E_LOCATION_TIMEOUT は timeout になる", () => {
    expect(toLocationError({ code: "E_LOCATION_TIMEOUT" }).code).toBe("timeout");
  });

  it("E_LOCATION_UNAVAILABLE は unavailable になる", () => {
    expect(toLocationError({ code: "E_LOCATION_UNAVAILABLE" }).code).toBe("unavailable");
  });

  it("E_LOCATION_SETTINGS_UNSATISFIED は unavailable になる", () => {
    expect(toLocationError({ code: "E_LOCATION_SETTINGS_UNSATISFIED" }).code).toBe("unavailable");
  });

  it("未知の code は unknown になる", () => {
    expect(toLocationError({ code: "SOMETHING_ELSE" }).code).toBe("unknown");
  });

  it("code の無いエラーは unknown になる", () => {
    expect(toLocationError(new Error("boom")).code).toBe("unknown");
    expect(toLocationError("plain string").code).toBe("unknown");
    expect(toLocationError(null).code).toBe("unknown");
  });

  it("LocationError を渡すと同一インスタンスが返る（二重ラップしない）", () => {
    const original = new LocationError("timeout");
    expect(toLocationError(original)).toBe(original);
  });

  it("cause に元エラーが保持される", () => {
    const original = new Error("boom");
    const result = toLocationError(original);
    expect(result.cause).toBe(original);
  });
});

describe("isLocationError", () => {
  it("LocationError インスタンスは true", () => {
    expect(isLocationError(new LocationError("unknown"))).toBe(true);
  });

  it("通常の Error は false", () => {
    expect(isLocationError(new Error("x"))).toBe(false);
  });

  it("null / undefined は false", () => {
    expect(isLocationError(null)).toBe(false);
    expect(isLocationError(undefined)).toBe(false);
  });
});

describe("locationErrorMessage", () => {
  const codes: LocationErrorCode[] = [
    "permission_denied",
    "services_disabled",
    "timeout",
    "unavailable",
    "unknown",
  ];

  it.each(codes)("%s は非空文字列を返す", (code) => {
    expect(locationErrorMessage(code).length).toBeGreaterThan(0);
  });
});
