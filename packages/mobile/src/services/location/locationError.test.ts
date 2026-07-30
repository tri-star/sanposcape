import { describe, expect, it } from "vitest";

import {
  LocationError,
  isLocationError,
  locationErrorMessage,
  toLocationError,
} from "@/services/location/locationError";
import type { LocationErrorCode } from "@/services/location/types";

describe("toLocationError", () => {
  // expo-location が実際に投げるコード（例外クラス名から自動導出される）。
  // Android: node_modules/expo-location/android/.../LocationExceptions.kt
  // iOS:     node_modules/expo-location/ios/LocationExceptions.swift
  // 導出規則: "ERR_" + クラス名から "Exception" を除去 → UPPER_SNAKE
  //           （expo-modules-core の CodedException.inferCode）
  describe("expo-location の現行コード（ERR_*）", () => {
    it.each([
      ["ERR_LOCATION_UNAUTHORIZED", "permission_denied"],
      ["ERR_LOCATION_BACKGROUND_UNAUTHORIZED", "permission_denied"],
      ["ERR_NO_PERMISSION_IN_MANIFEST", "permission_denied"],
      ["ERR_DENIED_FOREGROUND_LOCATION_PERMISSION", "permission_denied"],
      ["ERR_DENIED_BACKGROUND_LOCATION_PERMISSION", "permission_denied"],
      ["ERR_LOCATION_SETTINGS_UNSATISFIED", "services_disabled"],
      ["ERR_LOCATION_SERVICES_DISABLED", "services_disabled"],
      // 実測できなかったとき Android で最も多く飛んでくるコード。
      // 回帰: これが unknown に落ちると「もう一度お試しください」しか出せなくなる。
      ["ERR_CURRENT_LOCATION_IS_UNAVAILABLE", "unavailable"],
      ["ERR_LOCATION_UNAVAILABLE", "unavailable"],
      ["ERR_LOCATION_UNKNOWN", "unavailable"],
      ["ERR_LOCATION_REQUEST_REJECTED", "unavailable"],
      ["ERR_LOCATION_REQUEST_CANCELLED", "unavailable"],
      ["ERR_LOCATION_REQUEST_CANCELED", "unavailable"],
      ["ERR_LOCATION_UPDATES_UNAVAILABLE", "unavailable"],
    ] as const)("%s は %s になる", (code, expected) => {
      expect(toLocationError({ code }).code).toBe(expected);
    });

    it("expo-location のどのコードも unknown に落ちない", () => {
      // 分類漏れがあると、権限拒否も位置情報オフも同じ汎用文言になってしまう。
      const androidCodes = [
        "ERR_NO_PERMISSIONS_MODULE",
        "ERR_NO_PERMISSION_IN_MANIFEST",
        "ERR_LOCATION_BACKGROUND_UNAUTHORIZED",
        "ERR_LOCATION_REQUEST_REJECTED",
        "ERR_CURRENT_LOCATION_IS_UNAVAILABLE",
        "ERR_LOCATION_REQUEST_CANCELLED",
        "ERR_LOCATION_SETTINGS_UNSATISFIED",
        "ERR_LOCATION_UNAUTHORIZED",
        "ERR_LOCATION_UNAVAILABLE",
        "ERR_LOCATION_UNKNOWN",
      ];
      for (const code of androidCodes) {
        expect(toLocationError({ code }).code, code).not.toBe("unknown");
      }
    });
  });

  describe("unimodules 時代の旧コード（E_*。互換のため残している）", () => {
    it.each([
      ["E_NO_PERMISSIONS", "permission_denied"],
      ["ERR_NO_PERMISSIONS", "permission_denied"],
      ["E_LOCATION_SERVICES_DISABLED", "services_disabled"],
      ["E_LOCATION_TIMEOUT", "timeout"],
      ["E_LOCATION_UNAVAILABLE", "unavailable"],
      ["E_LOCATION_SETTINGS_UNSATISFIED", "unavailable"],
    ] as const)("%s は %s になる", (code, expected) => {
      expect(toLocationError({ code }).code).toBe(expected);
    });
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
