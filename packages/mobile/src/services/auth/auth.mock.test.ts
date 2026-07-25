import { describe, expect, it } from "vitest";

import { createMockAuthService } from "@/services/auth/auth.mock";

describe("createMockAuthService", () => {
  it("未サインイン状態では getAccessToken/refreshAccessToken が null を返す", async () => {
    const service = createMockAuthService();

    expect(service.getCurrentUser()).toBeNull();
    expect(await service.getAccessToken()).toBeNull();
    expect(await service.refreshAccessToken()).toBeNull();
  });

  it("signIn 後は getAccessToken/refreshAccessToken がトークンを返す", async () => {
    const service = createMockAuthService();

    await service.signIn("google");

    expect(await service.getAccessToken()).toBe("mock-access-token");
    expect(await service.refreshAccessToken()).toBe("mock-access-token");
  });

  it("signOut 後は再び null を返す", async () => {
    const service = createMockAuthService();
    await service.signIn("google");

    await service.signOut();

    expect(await service.getAccessToken()).toBeNull();
    expect(await service.refreshAccessToken()).toBeNull();
  });
});
