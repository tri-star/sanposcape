import { afterEach, describe, expect, it, vi } from "vitest";

import { Platform } from "react-native";

import { getApiBaseUrl, isCatalogEnabled } from "@/config/env";

describe("getApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    Platform.OS = "ios";
  });

  it("EXPO_PUBLIC_BACKEND_API_URL が未設定なら localhost にフォールバックする", () => {
    vi.stubEnv("EXPO_PUBLIC_BACKEND_API_URL", "");

    expect(getApiBaseUrl()).toBe("http://localhost:8000");
  });

  it("Android では localhost を 10.0.2.2 に置換する", () => {
    vi.stubEnv("EXPO_PUBLIC_BACKEND_API_URL", "http://localhost:8000");
    Platform.OS = "android";

    expect(getApiBaseUrl()).toBe("http://10.0.2.2:8000");
  });

  it("localhost を含まない URL はそのまま返す", () => {
    vi.stubEnv("EXPO_PUBLIC_BACKEND_API_URL", "https://api.example.com");
    Platform.OS = "android";

    expect(getApiBaseUrl()).toBe("https://api.example.com");
  });
});

describe("isCatalogEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("EXPO_PUBLIC_ENABLE_CATALOG=true なら true", () => {
    vi.stubEnv("EXPO_PUBLIC_ENABLE_CATALOG", "true");
    vi.stubGlobal("__DEV__", false);

    expect(isCatalogEnabled()).toBe(true);
  });

  it("未設定 + __DEV__=false なら false", () => {
    vi.stubGlobal("__DEV__", false);

    expect(isCatalogEnabled()).toBe(false);
  });

  it("未設定 + __DEV__=true なら true", () => {
    vi.stubGlobal("__DEV__", true);

    expect(isCatalogEnabled()).toBe(true);
  });

  it('"false" などの文字列は true と厳密比較されず false 扱いになる', () => {
    vi.stubEnv("EXPO_PUBLIC_ENABLE_CATALOG", "false");
    vi.stubGlobal("__DEV__", false);

    expect(isCatalogEnabled()).toBe(false);
  });
});
