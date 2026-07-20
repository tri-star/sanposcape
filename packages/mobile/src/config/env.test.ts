import { afterEach, describe, expect, it, vi } from "vitest";

import { Platform } from "react-native";

import { getApiBaseUrl } from "@/config/env";

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
